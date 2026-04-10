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
  redeemResolved,
} from "./executor";
import {
  createDb,
  insertTrade,
  getMarketExposure,
  getDailyExposure,
  getTrades,
} from "./db";
import { computePaperPnl, computeRealPnl, PnlResult } from "./tracker";
import Database from "better-sqlite3";
import { telegramEnabled, alertTrade, alertPnl } from "./telegram";

// ── State ───────────────────────────────────────────────────────────
let config: BotConfig;
let db: Database.Database;
let running = true;
let pollCount = 0;

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
  const filterState: FilterState = {
    marketExposure: getMarketExposure(db),
    dailyExposure: getDailyExposure(db),
    seenPositions,
    recentSignals,
  };

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
  const amount = config.risk.tradeAmountUsd;
  const paperShares = signal.price > 0 ? amount / signal.price : 0;

  if (!config.paperMode) {
    // Attempt real buy
    const result = buyMarket(signal.slug, signal.outcome, amount);
    if (result.success) {
      log("BUY", `${signal.traderName} ${signal.slug}:${signal.outcome} $${amount} @ ${signal.price}`);
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
        status: "success",
        result: result.stdout,
        isReal: true,
      });
      seenPositions.add(`${signal.traderName}:${signal.slug}:${signal.outcome}`);
      saveSeenTrades();
      return;
    }
    log("FAIL", `Real buy failed for ${signal.slug}:${signal.outcome}: ${result.error}`);
    // Fall through to paper
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
      const sharesToSell = Math.floor((match.shares || match.size || 0) * 0.5);
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
    const allTrades = getTrades(db, { limit: 500 });
    const slugs = new Set(allTrades.map((t: any) => t.slug));
    const prices = new Map<string, Map<string, number>>();
    for (const slug of slugs) {
      const p = getPrice(slug);
      if (p.size > 0) prices.set(slug, p);
    }
    const paperPnl = computePaperPnl(allTrades, prices);
    const realPnl = computeRealPnl(allTrades, prices);
    savePaperPnl(paperPnl);
    log("P&L", `Paper: $${paperPnl.pnl} (${paperPnl.returnPct}%) | Real: $${realPnl.pnl} (${realPnl.returnPct}%)`);

    // Send Telegram P&L summary every 12th poll (~6 min)
    if (pollCount % 12 === 0) {
      const allTrades = getTrades(db);
      const paperCount = allTrades.filter((t: any) => t.status === "paper").length;
      const filteredCount = allTrades.filter((t: any) => t.status === "filtered").length;
      alertPnl(paperPnl.pnl, paperPnl.returnPct, realPnl.pnl, realPnl.returnPct, paperCount, filteredCount);
    }

    // Try redeeming resolved markets
    const redeemed = redeemResolved();
    if (redeemed) log("P&L", `Redeemed resolved markets: ${redeemed}`);
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
      writeFileSync(dataPath("bot-status.json"), JSON.stringify({ running: true }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ running: true }));
      return;
    }

    if (req.method === "POST" && req.url === "/stop") {
      running = false;
      writeFileSync(dataPath("bot-status.json"), JSON.stringify({ running: false }));
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
