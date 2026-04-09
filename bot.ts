import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// ── Config ──────────────────────────────────────────────────────────
const TRADE_AMOUNT_USD = 5;
const POLL_INTERVAL_MS = 30_000;
const BULLPEN = process.env.BULLPEN_PATH || "bullpen";
const TRADES_LOG = join(__dirname, "trades.json");
const SEEN_FILE = join(__dirname, "seen-trades.json");

// Top 10 active traders this week by P&L (filtered: positive P&L, >$10k volume)
const TRADERS: { name: string; address: string }[] = [
  { name: "0x4924", address: "0x492442eab586f242b53bda933fd5de859c8a3782" },
  { name: "beachboy4", address: "0xc2e7800b5af46e6093872b177b7a5e7f0563be51" },
  { name: "0x2a2c", address: "0x2a2c53bd278c04da9962fcf96490e17f3dfb9bc1" },
  { name: "Countryside", address: "0xbddf61af533ff524d27154e589d2d7a81510c684" },
  { name: "RN1", address: "0x2005d16a84ceefa912d4e380cd32e7ff827875ea" },
  { name: "sovereign2013", address: "0xee613b3fc183ee44f9da9c05f53e2da107e3debf" },
  { name: "swisstony", address: "0x204f72f35326db932158cba6adff0b9a1da95e14" },
  { name: "Mentallyillgambld", address: "0x2b3ff45c91540e46fae1e0c72f61f4b049453446" },
  { name: "bcda", address: "0xb45a797faa52b0fd8adc56d30382022b7b12192c" },
  { name: "texaskid", address: "0xc8075693f48668a264b9fa313b47f52712fcc12b" },
];

// ── Types ───────────────────────────────────────────────────────────
interface Trade {
  id: string;
  timestamp: string;
  trader: string;
  traderAddress: string;
  side: "BUY" | "SELL";
  market: string;
  slug: string;
  outcome: string;
  amount: string;
  price: string;
}

interface CopyLog {
  timestamp: string;
  trader: string;
  traderAddress: string;
  action: "BUY" | "SELL";
  market: string;
  slug: string;
  outcome: string;
  traderAmount: string;
  ourAmount: string;
  status: "success" | "failed" | "skipped";
  error?: string;
  result?: string;
  entryPrice: number;
  paperShares: number;
}

// ── State ───────────────────────────────────────────────────────────
let seenTrades: Set<string> = new Set();
let isFirstRun = true;

function loadSeen(): void {
  if (existsSync(SEEN_FILE)) {
    const data = JSON.parse(readFileSync(SEEN_FILE, "utf-8"));
    seenTrades = new Set(data);
  }
}

function saveSeen(): void {
  writeFileSync(SEEN_FILE, JSON.stringify([...seenTrades], null, 2));
}

function loadTrades(): CopyLog[] {
  if (existsSync(TRADES_LOG)) {
    return JSON.parse(readFileSync(TRADES_LOG, "utf-8"));
  }
  return [];
}

function appendTrade(log: CopyLog): void {
  const trades = loadTrades();
  trades.push(log);
  writeFileSync(TRADES_LOG, JSON.stringify(trades, null, 2));
}

// ── Bullpen CLI helpers ─────────────────────────────────────────────
function bullpen(args: string): string {
  return execSync(`${BULLPEN} ${args}`, {
    encoding: "utf-8",
    timeout: 30_000,
  }).trim();
}

function getTraderTrades(address: string): Trade[] {
  try {
    const raw = bullpen(`polymarket activity --address ${address} --type trade --limit 10 --output json`);
    // Extract JSON array from output (skip any non-JSON lines like update notices)
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start === -1 || end === -1) return [];
    const jsonStr = raw.substring(start, end + 1);
    const trades: any[] = JSON.parse(jsonStr);
    return trades.map((t: any) => ({
      id: t.transaction_hash || `${t.timestamp}-${t.slug}-${t.outcome}`,
      timestamp: t.timestamp || "",
      trader: "",
      traderAddress: address,
      side: (t.side || "").toUpperCase() as "BUY" | "SELL",
      market: t.title || "",
      slug: t.slug || "",
      outcome: t.outcome || "",
      amount: String(t.usdc_size || t.size || "0"),
      price: String(t.price || "0"),
    }));
  } catch (err: any) {
    console.error(`  [!] Failed to fetch trades for ${address}: ${err.message}`);
    return [];
  }
}

function getOurPositions(): Map<string, { shares: number; slug: string; outcome: string }> {
  const positions = new Map();
  try {
    const raw = bullpen("polymarket positions --output json");
    const data = JSON.parse(raw);
    const posArr = data.positions || data || [];
    for (const p of posArr) {
      const key = `${p.slug || p.market_slug}:${p.outcome}`;
      positions.set(key, {
        shares: parseFloat(p.size || p.shares || "0"),
        slug: p.slug || p.market_slug || "",
        outcome: p.outcome || "",
      });
    }
  } catch (err: any) {
    console.error(`  [!] Failed to fetch positions: ${err.message}`);
  }
  return positions;
}

function executeBuy(slug: string, outcome: string, amount: number): string {
  return bullpen(`polymarket buy ${slug} "${outcome}" ${amount} --yes --output json`);
}

function executeSell(slug: string, outcome: string, shares: number): string {
  return bullpen(`polymarket sell ${slug} "${outcome}" ${shares} --yes --output json`);
}

function redeemResolved(): void {
  try {
    const result = bullpen("polymarket redeem --yes --output json");
    if (result && !result.includes("nothing")) {
      console.log(`  [$$] Auto-redeemed: ${result}`);
    }
  } catch {
    // No positions to redeem — normal
  }
}

// ── Main loop ───────────────────────────────────────────────────────
function processTraderTrades(
  trader: { name: string; address: string },
  trades: Trade[]
): void {
  for (const trade of trades) {
    const tradeKey = trade.id || `${trade.timestamp}-${trade.slug}-${trade.outcome}`;

    if (seenTrades.has(tradeKey)) continue;
    seenTrades.add(tradeKey);

    // On first run, mark everything as seen without copying
    if (isFirstRun) continue;

    const tradeAmount = parseFloat(trade.amount);
    console.log(
      `  [NEW] ${trader.name} ${trade.side} $${tradeAmount.toFixed(2)} on ${trade.slug} → ${trade.outcome}`
    );

    if (trade.side === "BUY") {
      const entryPrice = parseFloat(trade.price) || 0;
      const paperShares = entryPrice > 0 ? TRADE_AMOUNT_USD / entryPrice : 0;

      // Copy the buy with our fixed amount
      try {
        const result = executeBuy(trade.slug, trade.outcome, TRADE_AMOUNT_USD);
        console.log(`  [BUY] Copied: $${TRADE_AMOUNT_USD} on ${trade.slug} ${trade.outcome} @ ${entryPrice.toFixed(2)}`);
        appendTrade({
          timestamp: new Date().toISOString(),
          trader: trader.name,
          traderAddress: trader.address,
          action: "BUY",
          market: trade.market,
          slug: trade.slug,
          outcome: trade.outcome,
          traderAmount: trade.amount,
          ourAmount: String(TRADE_AMOUNT_USD),
          status: "success",
          result,
          entryPrice,
          paperShares,
        });
      } catch (err: any) {
        console.error(`  [PAPER] Buy failed but tracking paper trade: $${TRADE_AMOUNT_USD} on ${trade.slug} @ ${entryPrice.toFixed(2)}`);
        appendTrade({
          timestamp: new Date().toISOString(),
          trader: trader.name,
          traderAddress: trader.address,
          action: "BUY",
          market: trade.market,
          slug: trade.slug,
          outcome: trade.outcome,
          traderAmount: trade.amount,
          ourAmount: String(TRADE_AMOUNT_USD),
          status: "failed",
          error: err.message,
          entryPrice,
          paperShares,
        });
      }
    } else if (trade.side === "SELL") {
      // Sell proportionally if we hold this position
      const positions = getOurPositions();
      const posKey = `${trade.slug}:${trade.outcome}`;
      const pos = positions.get(posKey);

      if (!pos || pos.shares <= 0) {
        console.log(`  [SKIP] Sell signal but we don't hold ${trade.slug} ${trade.outcome}`);
        appendTrade({
          timestamp: new Date().toISOString(),
          trader: trader.name,
          traderAddress: trader.address,
          action: "SELL",
          market: trade.market,
          slug: trade.slug,
          outcome: trade.outcome,
          traderAmount: trade.amount,
          ourAmount: "0",
          status: "skipped",
          entryPrice: 0,
          paperShares: 0,
        });
        continue;
      }

      // Proportional sell: if trader sold 50% of their position, we sell 50% of ours
      // Approximate: use amount relative to a reasonable position size
      const sellRatio = Math.min(1, tradeAmount / (tradeAmount * 2));
      const sharesToSell = Math.max(1, Math.floor(pos.shares * sellRatio));

      try {
        const result = executeSell(trade.slug, trade.outcome, sharesToSell);
        console.log(`  [SELL] Sold ${sharesToSell} shares of ${trade.slug} ${trade.outcome}`);
        appendTrade({
          timestamp: new Date().toISOString(),
          trader: trader.name,
          traderAddress: trader.address,
          action: "SELL",
          market: trade.market,
          slug: trade.slug,
          outcome: trade.outcome,
          traderAmount: trade.amount,
          ourAmount: String(sharesToSell),
          status: "success",
          result,
          entryPrice: 0,
          paperShares: 0,
        });
      } catch (err: any) {
        console.error(`  [FAIL] Sell failed: ${err.message}`);
        appendTrade({
          timestamp: new Date().toISOString(),
          trader: trader.name,
          traderAddress: trader.address,
          action: "SELL",
          market: trade.market,
          slug: trade.slug,
          outcome: trade.outcome,
          traderAmount: trade.amount,
          ourAmount: String(sharesToSell),
          status: "failed",
          error: err.message,
          entryPrice: 0,
          paperShares: 0,
        });
      }
    }
  }
}

async function pollLoop(): Promise<void> {
  console.log("🔄 Polymarket Copy Bot starting...");
  console.log(`   Tracking ${TRADERS.length} traders`);
  console.log(`   Trade size: $${TRADE_AMOUNT_USD}`);
  console.log(`   Poll interval: ${POLL_INTERVAL_MS / 1000}s`);
  console.log("");

  loadSeen();

  // First run: mark all existing trades as seen
  console.log("[INIT] Marking existing trades as seen (no retroactive copies)...");
  for (const trader of TRADERS) {
    const trades = getTraderTrades(trader.address);
    processTraderTrades(trader, trades);
    console.log(`  ${trader.name}: ${trades.length} existing trades marked`);
  }
  saveSeen();
  isFirstRun = false;
  console.log("[INIT] Done. Watching for new trades now.\n");

  // Main polling loop
  while (true) {
    const now = new Date().toLocaleTimeString();
    console.log(`[${now}] Polling ${TRADERS.length} traders...`);

    // Auto-redeem resolved positions
    redeemResolved();

    for (const trader of TRADERS) {
      try {
        const trades = getTraderTrades(trader.address);
        processTraderTrades(trader, trades);
      } catch (err: any) {
        console.error(`  [!] Error polling ${trader.name}: ${err.message}`);
      }
    }

    saveSeen();
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

// ── HTTP control server (for dashboard) ─────────────────────────────
import { createServer } from "http";

const CONTROL_PORT = parseInt(process.env.BOT_PORT || "3847");
let botRunning = true;
let cachedStats: ReturnType<typeof computeStats> | null = null;

// Update paper P&L in background every 60s (not on every API request)
function refreshPaperPnl(): void {
  try {
    const trades = loadTrades();
    cachedStats = computeStats(trades);
    console.log(`  [PAPER] P&L updated: $${cachedStats.paperPnl} (${cachedStats.paperReturn}%)`);
  } catch (err: any) {
    console.error(`  [!] Paper P&L refresh failed: ${err.message}`);
  }
}

const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === "/status") {
    res.writeHead(200);
    res.end(JSON.stringify({ running: botRunning }));
  } else if (req.url === "/trades") {
    const trades = loadTrades();
    // Use cached stats (paper P&L updates in background), fast stats always
    const quickStats = {
      totalTrades: trades.length,
      executed: trades.filter(t => t.status === "success").length,
      failed: trades.filter(t => t.status === "failed").length,
      skipped: trades.filter(t => t.status === "skipped").length,
      buys: trades.filter(t => t.status === "success" && t.action === "BUY").length,
      sells: trades.filter(t => t.status === "success" && t.action === "SELL").length,
      paperPnl: cachedStats?.paperPnl ?? 0,
      paperInvested: cachedStats?.paperInvested ?? 0,
      paperReturn: cachedStats?.paperReturn ?? 0,
      paperPositions: cachedStats?.paperPositions ?? [],
    };
    res.writeHead(200);
    res.end(JSON.stringify({ trades, stats: quickStats }));
  } else if (req.url === "/start" && req.method === "POST") {
    botRunning = true;
    res.writeHead(200);
    res.end(JSON.stringify({ running: true }));
  } else if (req.url === "/stop" && req.method === "POST") {
    botRunning = false;
    res.writeHead(200);
    res.end(JSON.stringify({ running: false }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "not found" }));
  }
});

function getCurrentPrice(slug: string): number {
  try {
    const raw = bullpen("polymarket price " + slug + " --output json");
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return 0;
    const data = JSON.parse(raw.substring(start, end + 1));
    return parseFloat(data.mid || data.last || data.yes || "0");
  } catch {
    return 0;
  }
}

function computeStats(trades: CopyLog[]) {
  const executed = trades.filter((t) => t.status === "success");
  const failed = trades.filter((t) => t.status === "failed");
  const skipped = trades.filter((t) => t.status === "skipped");
  const buys = executed.filter((t) => t.action === "BUY");
  const sells = executed.filter((t) => t.action === "SELL");
  const paperBuys = trades.filter((t) => t.action === "BUY" && t.entryPrice > 0);

  // Paper P&L: sum up (currentPrice - entryPrice) * paperShares for all buy signals
  let paperPnl = 0;
  let paperInvested = 0;
  const paperPositions: Array<{slug: string; outcome: string; entry: number; shares: number; current: number; pnl: number; trader: string}> = [];

  // Cache prices per slug to avoid repeated calls
  const priceCache = new Map<string, number>();
  for (const t of paperBuys) {
    if (!priceCache.has(t.slug)) {
      priceCache.set(t.slug, getCurrentPrice(t.slug));
    }
    const currentPrice = priceCache.get(t.slug) || 0;
    const positionPnl = (currentPrice - t.entryPrice) * t.paperShares;
    paperPnl += positionPnl;
    paperInvested += parseFloat(t.ourAmount);
    paperPositions.push({
      slug: t.slug,
      outcome: t.outcome,
      entry: t.entryPrice,
      shares: t.paperShares,
      current: currentPrice,
      pnl: positionPnl,
      trader: t.trader,
    });
  }

  return {
    totalTrades: trades.length,
    executed: executed.length,
    failed: failed.length,
    skipped: skipped.length,
    buys: buys.length,
    sells: sells.length,
    paperPnl: Math.round(paperPnl * 100) / 100,
    paperInvested,
    paperReturn: paperInvested > 0 ? Math.round((paperPnl / paperInvested) * 10000) / 100 : 0,
    paperPositions,
  };
}

// ── Start ───────────────────────────────────────────────────────────
server.listen(CONTROL_PORT, () => {
  console.log(`[API] Control server on http://localhost:${CONTROL_PORT}`);
  console.log(`      GET  /status  — bot running state`);
  console.log(`      GET  /trades  — trade log + stats`);
  console.log(`      POST /start   — resume bot`);
  console.log(`      POST /stop    — pause bot`);
  console.log("");
});

// Wrap pollLoop to respect pause/resume
async function controlledPollLoop(): Promise<void> {
  console.log("🔄 Polymarket Copy Bot starting...");
  console.log(`   Tracking ${TRADERS.length} traders`);
  console.log(`   Trade size: $${TRADE_AMOUNT_USD}`);
  console.log(`   Poll interval: ${POLL_INTERVAL_MS / 1000}s`);
  console.log("");

  loadSeen();

  // First run: mark all existing trades as seen
  console.log("[INIT] Marking existing trades as seen (no retroactive copies)...");
  for (const trader of TRADERS) {
    const trades = getTraderTrades(trader.address);
    processTraderTrades(trader, trades);
    console.log(`  ${trader.name}: ${trades.length} existing trades marked`);
  }
  saveSeen();
  isFirstRun = false;
  console.log("[INIT] Done. Watching for new trades now.\n");

  let pollCount = 0;

  while (true) {
    if (!botRunning) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    const now = new Date().toLocaleTimeString();
    console.log(`[${now}] Polling ${TRADERS.length} traders...`);

    redeemResolved();

    // Refresh paper P&L every ~2 minutes (every 4th poll cycle)
    if (pollCount % 4 === 0) {
      refreshPaperPnl();
    }
    pollCount++;

    for (const trader of TRADERS) {
      try {
        const trades = getTraderTrades(trader.address);
        processTraderTrades(trader, trades);
      } catch (err: any) {
        console.error(`  [!] Error polling ${trader.name}: ${err.message}`);
      }
    }

    saveSeen();
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

controlledPollLoop().catch(console.error);
