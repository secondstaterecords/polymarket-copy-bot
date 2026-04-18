import http from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { loadConfig, BotConfig } from "./config";
import { shouldCopyTrade, TradeSignal, FilterState } from "./filters";
import {
  getTraderActivity,
  getTrackerTrades,
  followTrader,
  getFollowing,
  buyMarket,
  sellMarket,
  getPositions,
  getPrice,
  getBalance,
  redeemResolved,
} from "./executor";
import {
  createDb,
  insertTrade,
  getMarketExposure,
  getDailyExposure,
  getActiveMarkets,
  getTrades,
} from "./db";
import { computePaperPnl, computeRealPnl, PnlResult } from "./tracker";
import Database from "better-sqlite3";
import {
  telegramEnabled, alertTrade, alertPnl, alertDailyGames, sendTelegram,
  alertBigWin, alertBigLoss, alertHotTrader, alertColdTrader,
  alertDailyRecap, alertDrawdown, alertResolvingSoon,
} from "./telegram";
import { scanAndRecordResolutions } from "./resolution-tracker";
import { recomputeAllTraderStats, getTraderSizeMultiplier } from "./trader-stats";

// ── State ───────────────────────────────────────────────────────────
let config: BotConfig;
let db: Database.Database;
let running = true;
let pollCount = 0;
let circuitBreakerTripped = false;
let dailyHighWaterMark = 0;
let lastDrawdownReset = "";
let totalCapital = 0; // balance + positions value — updated on each P&L refresh
let usdcBalance = 0;  // available USDC — updated on each P&L refresh
let authAlertSent = false;  // prevent repeated auth-expired alerts
let lastAuthAlertTime = 0;  // last time we sent an auth alert — re-send hourly if still broken
let lastDailyRecapDate = "";  // yyyy-mm-dd of last daily recap sent
let lastResolutionScan = 0;   // timestamp of last resolution scan
let lastStatsRecompute = 0;   // timestamp of last stats recomputation
const alertedBigLosses = new Set<string>(); // slug:outcome of losses already alerted
const alertedBigWins = new Set<string>();  // slug:outcome of wins already alerted
const alertedResolvingSoon = new Set<string>(); // slug:outcome of resolving-soon alerts

const seenTrades = new Set<string>();
const seenPositions = new Set<string>();
const recentSignals: TradeSignal[] = [];

// ── Paths ───────────────────────────────────────────────────────────
function dataPath(file: string) {
  return join(config.dataDir, file);
}

// ── Persistence helpers ─────────────────────────────────────────────
function loadSeenTrades(): void {
  const p = dataPath("seen-trades-v2.json");
  if (!existsSync(p)) return;
  try {
    const data = JSON.parse(readFileSync(p, "utf-8"));
    if (Array.isArray(data.seenTrades)) data.seenTrades.forEach((k: string) => seenTrades.add(k));
    if (Array.isArray(data.seenPositions)) data.seenPositions.forEach((k: string) => seenPositions.add(k));
  } catch {}
}

function saveSeenTrades(): void {
  writeFileSync(
    dataPath("seen-trades-v2.json"),
    JSON.stringify({
      seenTrades: [...seenTrades],
      seenPositions: [...seenPositions],
    }),
  );
}

function readBotStatus(): void {
  const p = dataPath("bot-status.json");
  if (!existsSync(p)) return;
  try {
    const data = JSON.parse(readFileSync(p, "utf-8"));
    if (typeof data.running === "boolean") running = data.running;
  } catch {}
}

function savePaperPnl(pnl: PnlResult): void {
  writeFileSync(dataPath("paper-pnl.json"), JSON.stringify(pnl));
}

function saveRealPnl(pnl: PnlResult): void {
  writeFileSync(dataPath("real-pnl.json"), JSON.stringify(pnl));
}

// ── Logging ─────────────────────────────────────────────────────────
function log(tag: string, msg: string): void {
  const ts = new Date().toISOString();
  console.log(`${ts} [${tag}] ${msg}`);
}

// ── Trade key for dedup ─────────────────────────────────────────────
function tradeKey(traderAddr: string, t: any): string {
  return `${traderAddr}:${t.slug || t.market}:${t.outcome}:${t.side || t.action}:${t.timestamp || t.time}`;
}

// ── First-run: mark existing trades as seen ─────────────────────────
async function markExistingTrades(): Promise<void> {
  for (const trader of config.traders) {
    try {
      const activity = getTraderActivity(trader.address, 20);
      for (const t of activity) {
        seenTrades.add(tradeKey(trader.address, t));
        if ((t.side || t.action) === "BUY") {
          seenPositions.add(`${trader.name}:${t.slug || t.market}:${t.outcome}`);
        }
      }
      log("INIT", `Marked ${activity.length} existing trades for ${trader.name}`);
    } catch (err: any) {
      log("FAIL", `Could not fetch existing trades for ${trader.name}: ${err.message}`);
    }
  }
  saveSeenTrades();
}

// ── Process a single trade signal ───────────────────────────────────
function processSignal(signal: TradeSignal): void {
  const cap = totalCapital || config.risk.fallbackCapital;
  // Build trader EV map so filter can exempt proven winners from noise throttle
  const traderEv = new Map<string, { expectedValue: number; confidence: "low" | "medium" | "high" }>();
  try {
    const statsRows = db.prepare(`SELECT trader, expected_value, resolved_trades FROM trader_stats`).all() as any[];
    for (const row of statsRows) {
      let conf: "low" | "medium" | "high";
      if (row.resolved_trades < 10) conf = "low";
      else if (row.resolved_trades < 30) conf = "medium";
      else conf = "high";
      traderEv.set(row.trader, { expectedValue: row.expected_value, confidence: conf });
    }
  } catch {}

  const filterState: FilterState = {
    marketExposure: getMarketExposure(db),
    dailyExposure: getDailyExposure(db),
    seenPositions,
    recentSignals,
    activeMarkets: getActiveMarkets(db),
    maxPerMarket: (config.risk.maxPerMarketPct / 100) * cap,
    maxDailyExposure: (config.risk.maxDailyExposurePct / 100) * cap,
    traderEv,
  };

  // Circuit breaker: block new buys when drawdown exceeds limit
  if (circuitBreakerTripped && signal.side === "BUY") {
    log("RISK", `Circuit breaker active — blocking BUY ${signal.slug}:${signal.outcome}`);
    insertTrade(db, {
      timestamp: signal.timestamp, trader: signal.traderName, traderAddress: signal.traderAddress,
      action: signal.side, market: signal.slug, slug: signal.slug, outcome: signal.outcome,
      traderAmount: signal.traderAmount, ourAmount: 0, entryPrice: signal.price, paperShares: 0,
      status: "filtered", error: "circuit breaker: drawdown limit exceeded", isReal: false,
    });
    return;
  }

  const filterResult = shouldCopyTrade(signal, config, filterState);

  if (!filterResult.pass) {
    log("SKIP", `${signal.traderName} ${signal.side} ${signal.slug}:${signal.outcome} — ${filterResult.reason}`);
    insertTrade(db, {
      timestamp: signal.timestamp,
      trader: signal.traderName,
      traderAddress: signal.traderAddress,
      action: signal.side,
      market: signal.slug,
      slug: signal.slug,
      outcome: signal.outcome,
      traderAmount: signal.traderAmount,
      ourAmount: 0,
      entryPrice: signal.price,
      paperShares: 0,
      status: "filtered",
      error: filterResult.reason,
      isReal: false,
    });
    return;
  }

  if (signal.side === "BUY") {
    handleBuy(signal);
  } else {
    handleSell(signal);
  }
}

function handleBuy(signal: TradeSignal): void {
  // Always $5 per trade. Elite traders get value from SPREAD (more unique
  // signals pass via noise filter bypass), not from stacking same market.
  const amount = config.risk.tradeAmountUsd;
  const paperShares = signal.price > 0 ? amount / signal.price : 0;

  if (!config.paperMode) {
    // Check balance before attempting buy
    if (usdcBalance < amount + 1) {
      log("SKIP", `${signal.traderName} ${signal.slug}:${signal.outcome} — insufficient balance ($${usdcBalance.toFixed(2)} < $${amount})`);
      log("PAPER", `${signal.traderName} BUY ${signal.slug}:${signal.outcome} $${amount} @ ${signal.price} (no cash)`);
      insertTrade(db, {
        timestamp: new Date().toISOString(), trader: signal.traderName,
        traderAddress: signal.traderAddress, action: "BUY", market: signal.slug,
        slug: signal.slug, outcome: signal.outcome, traderAmount: signal.traderAmount,
        ourAmount: 0, entryPrice: signal.price, paperShares,
        status: "paper", isReal: false,
      });
      return;
    }
    // Attempt real buy — always $5, one per signal
    const result = buyMarket(signal.slug, signal.outcome, amount);
    if (result.success) {
      log("BUY", `${signal.traderName} ${signal.slug}:${signal.outcome} $${amount} @ ${signal.price}`);
      insertTrade(db, {
        timestamp: new Date().toISOString(),
        trader: signal.traderName, traderAddress: signal.traderAddress,
        action: "BUY", market: signal.slug, slug: signal.slug, outcome: signal.outcome,
        traderAmount: signal.traderAmount, ourAmount: amount, entryPrice: signal.price,
        paperShares, status: "success", result: result.stdout, isReal: true,
      });
      alertTrade("BUY", signal.traderName, signal.slug, signal.outcome, signal.price, amount, "REAL");
      usdcBalance = Math.max(0, usdcBalance - amount);
    } else {
      log("FAIL", `Real buy failed for ${signal.slug}:${signal.outcome}: ${result.error}`);
      insertTrade(db, {
        timestamp: new Date().toISOString(),
        trader: signal.traderName, traderAddress: signal.traderAddress,
        action: "BUY", market: signal.slug, slug: signal.slug, outcome: signal.outcome,
        traderAmount: signal.traderAmount, ourAmount: 0, entryPrice: signal.price,
        paperShares: 0, status: "failed", error: result.error || "real buy failed", isReal: true,
      });
      return;
    }
    // Record analytics
    try {
      const analyticsPath = join(config.dataDir, "trader-analytics.json");
      let analytics: Record<string, any> = {};
      if (existsSync(analyticsPath)) analytics = JSON.parse(readFileSync(analyticsPath, "utf-8"));
      if (!analytics[signal.traderName]) analytics[signal.traderName] = { totalTrades: 0, totalSpent: 0, moonshots: 0, avgEntryPrice: 0, lastSeen: "" };
      const r = analytics[signal.traderName];
      r.avgEntryPrice = (r.avgEntryPrice * r.totalTrades + signal.price) / (r.totalTrades + 1);
      r.totalTrades++; r.totalSpent += amount;
      if (signal.price < 0.20) r.moonshots++;
      r.lastSeen = new Date().toISOString();
      writeFileSync(analyticsPath, JSON.stringify(analytics, null, 2));
    } catch {}
    seenPositions.add(`${signal.traderName}:${signal.slug}:${signal.outcome}`);
    saveSeenTrades();
    return;
  }

  // Paper trade
  log("PAPER", `${signal.traderName} BUY ${signal.slug}:${signal.outcome} $${amount} @ ${signal.price} (${paperShares.toFixed(2)} shares)`);
  insertTrade(db, {
    timestamp: new Date().toISOString(),
    trader: signal.traderName,
    traderAddress: signal.traderAddress,
    action: "BUY",
    market: signal.slug,
    slug: signal.slug,
    outcome: signal.outcome,
    traderAmount: signal.traderAmount,
    ourAmount: amount,
    entryPrice: signal.price,
    paperShares,
    status: "paper",
    isReal: false,
  });
  alertTrade("BUY", signal.traderName, signal.slug, signal.outcome, signal.price, amount, "paper");
  seenPositions.add(`${signal.traderName}:${signal.slug}:${signal.outcome}`);
  saveSeenTrades();
}

function handleSell(signal: TradeSignal): void {
  if (!config.paperMode) {
    // Check real positions
    const positions = getPositions();
    const match = positions.find(
      (p: any) => (p.slug === signal.slug || p.market === signal.slug) && p.outcome === signal.outcome,
    );
    if (match) {
      const totalShares = match.shares || match.size || 0;
      // Sell all shares — if the trader we're copying sold, we should exit too
      const sharesToSell = Math.round(totalShares * 100) / 100; // round to 2 decimals, not floor
      if (sharesToSell > 0) {
        const result = sellMarket(signal.slug, signal.outcome, sharesToSell);
        if (result.success) {
          log("SELL", `${signal.traderName} ${signal.slug}:${signal.outcome} ${sharesToSell} shares`);
          insertTrade(db, {
            timestamp: new Date().toISOString(),
            trader: signal.traderName,
            traderAddress: signal.traderAddress,
            action: "SELL",
            market: signal.slug,
            slug: signal.slug,
            outcome: signal.outcome,
            traderAmount: signal.traderAmount,
            ourAmount: 0,
            entryPrice: signal.price,
            paperShares: sharesToSell,
            status: "success",
            result: result.stdout,
            isReal: true,
          });
          seenPositions.delete(`${signal.traderName}:${signal.slug}:${signal.outcome}`);
          saveSeenTrades();
          return;
        }
        log("FAIL", `Real sell failed: ${result.error}`);
      }
    }
  }

  // Paper sell
  log("PAPER", `${signal.traderName} SELL ${signal.slug}:${signal.outcome}`);
  insertTrade(db, {
    timestamp: new Date().toISOString(),
    trader: signal.traderName,
    traderAddress: signal.traderAddress,
    action: "SELL",
    market: signal.slug,
    slug: signal.slug,
    outcome: signal.outcome,
    traderAmount: signal.traderAmount,
    ourAmount: 0,
    entryPrice: signal.price,
    paperShares: 0,
    status: "paper",
    isReal: false,
  });
  seenPositions.delete(`${signal.traderName}:${signal.slug}:${signal.outcome}`);
  saveSeenTrades();
}

// ── Setup tracker following ─────────────────────────────────────────
function setupTrackerFollowing(): void {
  const following = getFollowing();
  const followedAddrs = new Set(following.map((f: any) => (f.address || "").toLowerCase()));

  for (const trader of config.traders) {
    if (!followedAddrs.has(trader.address.toLowerCase())) {
      log("INIT", `Following ${trader.name} (${trader.address.substring(0, 10)}...)`);
      followTrader(trader.address, config.filters.minTraderAmount);
    }
  }
}

// ── Poll via tracker trades (unified feed — Sharbel approach) ──────
function pollViaTracker(): void {
  if (!running) return;

  try {
    const trades = getTrackerTrades(50); // Get last 50 trades from all followed
    const addrToName = new Map(config.traders.map((t) => [t.address.toLowerCase(), t.name]));

    for (const t of trades) {
      const addr = (t.proxy_wallet || t.address || "").toLowerCase();
      const traderName = addrToName.get(addr) || t.username || addr.substring(0, 10);
      const key = tradeKey(addr, t);
      if (seenTrades.has(key)) continue;
      seenTrades.add(key);

      const signal: TradeSignal = {
        traderName,
        traderAddress: addr,
        side: (t.side || t.action || "BUY").toUpperCase() as "BUY" | "SELL",
        slug: t.slug || t.market_slug || "",
        outcome: t.outcome || "",
        price: parseFloat(t.price || t.avg_price || "0"),
        traderAmount: parseFloat(t.usdc_size || t.amount || "0"),
        timestamp: t.timestamp || t.time || new Date().toISOString(),
      };

      if (!signal.slug || !signal.outcome) continue;

      log("NEW", `${signal.traderName} ${signal.side} ${signal.slug}:${signal.outcome} @ ${signal.price}`);
      recentSignals.push(signal);
      if (recentSignals.length > 200) recentSignals.shift();

      processSignal(signal);
    }
  } catch (err: any) {
    log("FAIL", `Tracker trades error: ${err.message}`);
  }

  saveSeenTrades();
}

// ── Poll via individual activity (fallback) ────────────────────────
function pollTraders(): void {
  if (!running) return;

  for (const trader of config.traders) {
    try {
      const activity = getTraderActivity(trader.address, 10);
      for (const t of activity) {
        const key = tradeKey(trader.address, t);
        if (seenTrades.has(key)) continue;
        seenTrades.add(key);

        const signal: TradeSignal = {
          traderName: trader.name,
          traderAddress: trader.address,
          side: (t.side || t.action || "BUY").toUpperCase() as "BUY" | "SELL",
          slug: t.slug || t.market || "",
          outcome: t.outcome || "",
          price: parseFloat(t.price || t.avg_price || "0"),
          traderAmount: parseFloat(t.usdc_size || t.amount || "0"),
          timestamp: t.timestamp || t.time || new Date().toISOString(),
        };

        log("NEW", `${signal.traderName} ${signal.side} ${signal.slug}:${signal.outcome} @ ${signal.price}`);
        recentSignals.push(signal);
        if (recentSignals.length > 200) recentSignals.shift();

        processSignal(signal);
      }
    } catch (err: any) {
      log("FAIL", `Error polling ${trader.name}: ${err.message}`);
    }
  }

  saveSeenTrades();
}

// ── P&L refresh ─────────────────────────────────────────────────────
function refreshPnl(): void {
  try {
    // Only fetch paper/success trades for P&L — filtered trades have no position data
    const allTrades = db.prepare(
      "SELECT * FROM trades WHERE status IN ('paper', 'success') AND action = 'BUY' AND entry_price > 0"
    ).all() as any[];
    const slugs = new Set(allTrades.map((t: any) => t.slug));
    const prices = new Map<string, Map<string, number>>();
    for (const slug of slugs) {
      const p = getPrice(slug);
      if (p.size > 0) prices.set(slug, p);
    }
    const paperPnl = computePaperPnl(allTrades, prices);
    const realPnl = computeRealPnl(allTrades, prices);
    savePaperPnl(paperPnl);
    saveRealPnl(realPnl);

    // ── Update total capital (balance + positions value) ─────────
    const activePnl = config.paperMode ? paperPnl : realPnl;
    // For paper mode, use DB-reconstructed value. For live mode, use Bullpen's
    // actual positions API (DB-reconstruction double-counts resolved/sold markets).
    let positionsValue = activePnl.invested + activePnl.pnl;
    let liveInvested = 0;
    let liveUnrealizedPnl = 0;
    if (!config.paperMode) {
      try {
        const livePositions = getPositions();
        const liveValue = livePositions.reduce((sum: number, p: any) =>
          sum + parseFloat(p.current_value || p.value || "0"), 0);
        liveInvested = livePositions.reduce((sum: number, p: any) =>
          sum + parseFloat(p.invested_usd || "0"), 0);
        liveUnrealizedPnl = livePositions.reduce((sum: number, p: any) =>
          sum + parseFloat(p.unrealized_pnl || "0"), 0);
        if (!isNaN(liveValue) && liveValue > 0) {
          positionsValue = liveValue;
          // Override realPnl with live truth
          realPnl.pnl = Math.round(liveUnrealizedPnl * 100) / 100;
          realPnl.invested = liveInvested;
          realPnl.returnPct = liveInvested > 0
            ? Math.round((liveUnrealizedPnl / liveInvested) * 10000) / 100
            : 0;
        }
      } catch {}
    }
    if (!config.paperMode) {
      const prevBalance = usdcBalance;
      const bal = getBalance();
      if (bal !== null) {
        usdcBalance = bal;
        totalCapital = bal + positionsValue;
        // Alert when balance recovers enough to trade again
        if (prevBalance < config.risk.tradeAmountUsd && bal >= config.risk.tradeAmountUsd) {
          log("CASH", `Balance recovered to $${bal.toFixed(2)} — live trading resumed`);
          sendTelegram(`💰 *Cash is back!*\nBalance: $${bal.toFixed(2)}\nLive trading resumed automatically.`);
        }
      } else {
        // Fallback: use configured capital if balance check fails
        totalCapital = Math.max(config.risk.fallbackCapital, positionsValue);
      }
    } else {
      totalCapital = config.risk.fallbackCapital;
    }
    const cap = totalCapital || config.risk.fallbackCapital;
    const maxDaily = Math.round((config.risk.maxDailyExposurePct / 100) * cap);
    const maxMkt = Math.round((config.risk.maxPerMarketPct / 100) * cap);

    log("P&L", `Paper: $${paperPnl.pnl} (${paperPnl.returnPct}%) | Real: $${realPnl.pnl} (${realPnl.returnPct}%) | Capital: $${cap.toFixed(0)} (bal $${usdcBalance.toFixed(0)} + pos $${positionsValue.toFixed(0)}) | Limits: daily $${maxDaily}, mkt $${maxMkt}`);

    // ── Drawdown circuit breaker (based on total capital) ────────
    // Reset at 4 AM ET (8 AM UTC) — NOT midnight UTC — so evening US
    // sports (NBA 7-10:30 PM, MLB, NHL) always fall within the window.
    const nowUtc = new Date();
    const resetHour = 8; // 8 AM UTC = 4 AM ET
    const dayKey = nowUtc.getUTCHours() >= resetHour
      ? nowUtc.toISOString().split("T")[0]
      : new Date(nowUtc.getTime() - 86400000).toISOString().split("T")[0];
    if (dayKey !== lastDrawdownReset) {
      lastDrawdownReset = dayKey;
      dailyHighWaterMark = activePnl.pnl;
      circuitBreakerTripped = false;
    }
    if (activePnl.pnl > dailyHighWaterMark) dailyHighWaterMark = activePnl.pnl;
    const drawdownFromHwm = dailyHighWaterMark - activePnl.pnl;
    const maxDrawdown = (config.risk.maxDrawdownPct / 100) * cap;
    if (drawdownFromHwm > maxDrawdown && !circuitBreakerTripped) {
      circuitBreakerTripped = true;
      log("RISK", `CIRCUIT BREAKER: drawdown $${drawdownFromHwm.toFixed(2)} exceeds max $${maxDrawdown.toFixed(2)} (${config.risk.maxDrawdownPct}% of $${cap.toFixed(0)}) — pausing new buys`);
      alertTrade("CIRCUIT_BREAKER", "SYSTEM", "drawdown", `$${drawdownFromHwm.toFixed(2)}`, 0, 0, "risk");
    }
    if (circuitBreakerTripped && drawdownFromHwm <= maxDrawdown * 0.5) {
      circuitBreakerTripped = false;
      log("RISK", `Circuit breaker reset — drawdown recovered to $${drawdownFromHwm.toFixed(2)}`);
    }

    // Send Telegram P&L summary every 60th poll (~30 min)
    if (pollCount % 60 === 0) {
      const executedCount = (db.prepare("SELECT COUNT(*) as c FROM trades WHERE is_real = 1 AND status = 'success'").get() as any)?.c || 0;
      alertPnl(paperPnl.pnl, paperPnl.returnPct, realPnl.pnl, realPnl.returnPct, executedCount, usdcBalance, totalCapital);
    }

    // Send daily games digest once per day (on first poll after 10 AM local)
    const hour = new Date().getHours();
    if (pollCount % 120 === 0 && hour >= 10 && hour < 12) {
      try {
        const { execSync } = require("child_process");
        const BULLPEN = process.env.BULLPEN_PATH || `${process.env.HOME}/.local/bin/bullpen`;
        const posRaw = execSync(`${BULLPEN} polymarket positions --output json 2>/dev/null`, { encoding: "utf-8", timeout: 15000 }).trim();
        const posStart = posRaw.indexOf("{"); const posEnd = posRaw.lastIndexOf("}");
        if (posStart >= 0) {
          const posData = JSON.parse(posRaw.substring(posStart, posEnd + 1));
          const positions = (posData.positions || []).map((p: any) => ({
            slug: p.slug || "", outcome: p.outcome || "", market: p.market || "",
            entry: parseFloat(p.avg_price || "0"), current: parseFloat(p.current_price || "0"),
            pnl: parseFloat(p.unrealized_pnl || "0"), endDate: p.end_date || "",
          }));
          alertDailyGames(positions);
        }
      } catch {}
    }

    // ── Take-profit: auto-sell positions above threshold ────────
    if (!config.paperMode && config.risk.takeProfitPct > 0) {
      for (const pos of realPnl.positions) {
        if (pos.entry <= 0 || pos.current <= 0) continue;
        const returnPct = ((pos.current - pos.entry) / pos.entry) * 100;
        if (returnPct >= config.risk.takeProfitPct) {
          log("PROFIT", `Take-profit triggered: ${pos.slug}:${pos.outcome} up ${returnPct.toFixed(0)}% (entry ${pos.entry.toFixed(2)} → ${pos.current.toFixed(2)})`);
          // Check actual position shares on Polymarket
          const positions = getPositions();
          const match = positions.find((p: any) => p.slug === pos.slug && p.outcome === pos.outcome);
          if (match) {
            const sharesToSell = Math.round((match.shares || match.size || 0) * 100) / 100;
            if (sharesToSell > 0) {
              const result = sellMarket(pos.slug, pos.outcome, sharesToSell);
              if (result.success) {
                log("PROFIT", `SOLD ${pos.slug}:${pos.outcome} — ${sharesToSell} shares @ ${pos.current.toFixed(2)} (was ${pos.entry.toFixed(2)}, +${returnPct.toFixed(0)}%)`);
                insertTrade(db, {
                  timestamp: new Date().toISOString(),
                  trader: "AUTO-PROFIT", traderAddress: "",
                  action: "SELL", market: pos.slug, slug: pos.slug, outcome: pos.outcome,
                  traderAmount: 0, ourAmount: sharesToSell * pos.current,
                  entryPrice: pos.current, paperShares: sharesToSell,
                  status: "success", result: result.stdout, isReal: true,
                });
                alertTrade("SELL", "TAKE-PROFIT", pos.slug, pos.outcome, pos.current, sharesToSell * pos.current, `+${returnPct.toFixed(0)}%`);
              } else {
                log("FAIL", `Take-profit sell failed for ${pos.slug}: ${result.error}`);
              }
            }
          }
        }
      }
    }

    // Try redeeming resolved markets
    const redeemStatus = redeemResolved();
    if (redeemStatus.authExpired) {
      // Re-alert every hour if still broken (was: only once, easy to miss)
      const sinceLastAlert = Date.now() - lastAuthAlertTime;
      if (!authAlertSent || sinceLastAlert > 60 * 60 * 1000) {
        log("AUTH", "Bullpen auth expired — generating login code");
        // Try to generate a fresh login code and include it in the alert
        let loginCode: string | null = null;
        try {
          const { execSync } = require("child_process");
          const BULLPEN = process.env.BULLPEN_PATH || `${process.env.HOME}/.local/bin/bullpen`;
          // Kill any stale login processes
          try { execSync("pkill -f 'bullpen login' 2>/dev/null", { timeout: 3000 }); } catch {}
          // Start a new login attempt, capture the code from output
          execSync(`nohup ${BULLPEN} login --no-browser > /tmp/bpl-auto.log 2>&1 & sleep 5`, { timeout: 10000, shell: "/bin/bash" });
          const out = execSync(`cat /tmp/bpl-auto.log 2>/dev/null || echo ""`, { encoding: "utf-8", timeout: 3000 });
          const match = out.match(/([A-Z]{4}-[A-Z]{4})/);
          if (match) loginCode = match[1];
        } catch (err: any) {
          log("AUTH", `Could not auto-generate login code: ${err.message}`);
        }
        const codeBlock = loginCode
          ? `\n\n*Login code (tap to copy):*\n\`${loginCode}\`\n\n1. Tap: https://app.bullpen.fi/device\n2. Enter code above\n3. Bot resumes in ~30s`
          : `\n\nSSH to server and run: \`bullpen login\``;
        sendTelegram(
          `⚠️ *Bullpen auth EXPIRED*\n\n` +
          `Trades failing — winnings stuck.` +
          codeBlock +
          `\n\n_Alert repeats every 60 min until fixed._`
        );
        authAlertSent = true;
        lastAuthAlertTime = Date.now();
      }
    } else if (redeemStatus.success && redeemStatus.message) {
      log("P&L", `Redeemed resolved markets: ${redeemStatus.message}`);
      if (authAlertSent) {
        sendTelegram(`✅ *Auth restored*\nRedeems working again. Bot back to normal.`);
      }
      authAlertSent = false; // Reset once auth is working again
      lastAuthAlertTime = 0;
    }

    // ── Resolution tracking (every 30 minutes) ──────────────────
    const now = Date.now();
    if (now - lastResolutionScan > 30 * 60 * 1000) {
      lastResolutionScan = now;
      try {
        const result = scanAndRecordResolutions(db, 40);
        if (result.newlyResolved > 0) {
          log("RES", `Resolution scan: ${result.newlyResolved} newly resolved out of ${result.checked} checked`);
        }
      } catch (err: any) {
        log("RES", `Resolution scan error: ${err.message}`);
      }
    }

    // ── Recompute trader stats (every 2 hours) ──────────────────
    if (now - lastStatsRecompute > 2 * 60 * 60 * 1000) {
      lastStatsRecompute = now;
      try {
        const stats = recomputeAllTraderStats(db);
        const withEnoughData = stats.filter(s => s.confidence !== "low");
        if (withEnoughData.length > 0) {
          log("STATS", `Updated stats for ${withEnoughData.length} traders with sufficient data`);

          // Alert on hot traders (high EV + high confidence, haven't alerted recently)
          for (const s of withEnoughData) {
            if (s.confidence === "high" && s.expectedValue > 0.3 && s.winRate >= 0.6) {
              alertHotTrader(s.trader, s.winRate, s.avgReturnPct, s.resolvedTrades);
            }
          }
        }
      } catch (err: any) {
        log("STATS", `Stats recompute error: ${err.message}`);
      }
    }

    // ── Big loss alerts — position down >70% AND on bigger bets (>=$10) ──
    // Research shows panic-selling on drops is "disposition bias" — don't stress
    // on small positions. Only alert if it's meaningful.
    if (!config.paperMode) {
      for (const pos of realPnl.positions) {
        const key = `${pos.slug}:${pos.outcome}`;
        if (pos.entry > 0 && pos.current > 0 && !alertedBigLosses.has(key)) {
          const lossPct = ((pos.current - pos.entry) / pos.entry) * 100;
          if (lossPct < -70 && pos.invested >= 10) {
            alertBigLoss(pos.market || pos.slug, pos.outcome, pos.entry, pos.current, pos.pnl);
            alertedBigLosses.add(key);
          }
        }
      }
    }

    // ── Resolving-soon alerts (position ends in <2 hours) ────────
    if (pollCount % 30 === 0 && !config.paperMode) {
      try {
        const { execSync } = require("child_process");
        const BULLPEN = process.env.BULLPEN_PATH || `${process.env.HOME}/.local/bin/bullpen`;
        const posRaw = execSync(`${BULLPEN} polymarket positions --output json 2>/dev/null`, { encoding: "utf-8", timeout: 15000 }).trim();
        const ps = posRaw.indexOf("{"); const pe = posRaw.lastIndexOf("}");
        if (ps >= 0) {
          const data = JSON.parse(posRaw.substring(ps, pe + 1));
          const positions = data.positions || [];
          const resolvingSoon: any[] = [];
          for (const p of positions) {
            if (!p.end_date) continue;
            const endTs = new Date(p.end_date).getTime();
            const hoursUntil = (endTs - Date.now()) / (1000 * 60 * 60);
            const key = `${p.slug}:${p.outcome}`;
            if (hoursUntil > 0 && hoursUntil < 2 && !alertedResolvingSoon.has(key)) {
              resolvingSoon.push({
                market: p.market || p.slug, outcome: p.outcome,
                currentPrice: parseFloat(p.current_price || "0"),
                pnl: parseFloat(p.unrealized_pnl || "0"),
                hoursUntil,
              });
              alertedResolvingSoon.add(key);
            }
          }
          if (resolvingSoon.length > 0) alertResolvingSoon(resolvingSoon);
        }
      } catch {}
    }

    // ── Daily recap (sent once per day at ~11 PM local time) ─────
    const recapNow = new Date();
    const todayStr = recapNow.toISOString().split("T")[0];
    if (recapNow.getHours() >= 23 && lastDailyRecapDate !== todayStr) {
      lastDailyRecapDate = todayStr;
      try {
        const dayStart = todayStr + "T00:00:00.000Z";
        const todayTrades = db.prepare(`
          SELECT * FROM trades WHERE timestamp >= ? AND is_real = 1 AND status = 'success'
        `).all(dayStart) as any[];
        const resolvedToday = db.prepare(`
          SELECT t.*, r.won, r.resolved_price
          FROM trades t
          JOIN resolutions r ON r.slug = t.slug AND r.outcome = t.outcome
          WHERE t.timestamp >= ? AND t.is_real = 1 AND t.action = 'BUY' AND t.status = 'success'
        `).all(dayStart) as any[];
        const wins = resolvedToday.filter(r => r.won === 1).length;
        const losses = resolvedToday.filter(r => r.won === 0).length;
        let biggestWin: any = null, biggestLoss: any = null;
        for (const r of resolvedToday) {
          const profit = r.won ? (r.our_amount / r.entry_price - r.our_amount) : -r.our_amount;
          if (!biggestWin || profit > biggestWin.profit) biggestWin = { market: r.slug, profit };
          if (!biggestLoss || profit < biggestLoss.loss) biggestLoss = { market: r.slug, loss: profit };
        }
        alertDailyRecap({
          trades: todayTrades.length, wins, losses,
          biggestWin: biggestWin?.profit > 0 ? biggestWin : null,
          biggestLoss: biggestLoss?.loss < 0 ? biggestLoss : null,
          netPnl: realPnl.pnl, returnPct: realPnl.returnPct, capital: totalCapital,
        });
      } catch (err: any) {
        log("RECAP", `Daily recap error: ${err.message}`);
      }
    }
  } catch (err: any) {
    log("FAIL", `P&L refresh error: ${err.message}`);
  }
}

// ── HTTP control server ─────────────────────────────────────────────
function startControlServer(): void {
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ running, paperMode: config.paperMode }));
      return;
    }

    if (req.method === "GET" && req.url === "/trades") {
      const trades = getTrades(db, { limit: 200 });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(trades));
      return;
    }

    if (req.method === "POST" && req.url === "/start") {
      running = true;
      writeFileSync(dataPath("bot-status.json"), JSON.stringify({ running: true, paperMode: config.paperMode }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ running: true }));
      return;
    }

    if (req.method === "POST" && req.url === "/stop") {
      running = false;
      writeFileSync(dataPath("bot-status.json"), JSON.stringify({ running: false, paperMode: config.paperMode }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ running: false }));
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      log("INIT", `Port ${config.botPort} in use, skipping control server (dashboard still works)`);
    } else {
      throw err;
    }
  });
  server.listen(config.botPort, () => {
    log("INIT", `Control server on port ${config.botPort}`);
  });
}

// ── Main loop ───────────────────────────────────────────────────────
async function main(): Promise<void> {
  config = loadConfig();
  db = createDb(config.dataDir);

  log("INIT", `Polymarket Copy Bot V2 starting (paper=${config.paperMode})`);
  log("INIT", `Tracking ${config.traders.length} traders, poll every ${config.pollIntervalMs / 1000}s`);
  log("INIT", `Telegram alerts: ${telegramEnabled() ? "enabled" : "disabled (set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)"}`);

  // Check initial balance
  if (!config.paperMode) {
    const bal = getBalance();
    if (bal !== null) {
      usdcBalance = bal;
      totalCapital = bal;
      log("INIT", `USDC balance: $${bal.toFixed(2)} — limits: daily $${Math.round((config.risk.maxDailyExposurePct / 100) * bal)}, per-market $${Math.round((config.risk.maxPerMarketPct / 100) * bal)}, circuit breaker at $${Math.round((config.risk.maxDrawdownPct / 100) * bal)} drawdown`);
    } else {
      totalCapital = config.risk.fallbackCapital;
      log("INIT", `Balance check failed — using fallback capital $${config.risk.fallbackCapital}`);
    }
  } else {
    totalCapital = config.risk.fallbackCapital;
  }

  // Write initial status with mode info
  writeFileSync(dataPath("bot-status.json"), JSON.stringify({ running: true, paperMode: config.paperMode }));

  loadSeenTrades();
  readBotStatus();

  // First run: mark existing trades as seen
  if (seenTrades.size === 0) {
    log("INIT", "First run — marking existing trader positions as seen");
    await markExistingTrades();
  }

  // Set up tracker following if enabled
  if (config.useTracker) {
    log("INIT", "Setting up tracker following for all traders...");
    setupTrackerFollowing();
    log("INIT", "Tracker mode enabled — using unified trade feed");
  }

  startControlServer();

  // Main poll loop
  const tick = () => {
    readBotStatus();
    if (running) {
      if (config.useTracker) {
        pollViaTracker();
      } else {
        pollTraders();
      }
      pollCount++;
      if (pollCount % 4 === 0) refreshPnl();
    }
    setTimeout(tick, config.pollIntervalMs);
  };
  tick();
}

main().catch((err) => {
  log("FAIL", `Fatal: ${err.message}`);
  process.exit(1);
});
