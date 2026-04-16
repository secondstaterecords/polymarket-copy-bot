// Backtester — replays historical signals through each version's filter/sizing logic
// to compute hypothetical P&L. Uses resolution data so returns are real, not estimated.
//
// Usage: npx tsx scripts/backtest.ts [mk1-initial|mk2-risk-controls|...|all]

import Database from "better-sqlite3";
import { join } from "path";

const dataDir = process.env.DATA_DIR || join(__dirname, "..");
const db = new Database(join(dataDir, "copybot.db"), { readonly: true });

// ── Version configs — snapshots of filter/sizing logic per mk ───────
interface VersionConfig {
  name: string;
  description: string;
  tradeAmountUsd: number;
  maxPerMarketPct: number;
  maxDailyExposurePct: number;
  maxSignalsPerHour: number;         // noise filter (0 = disabled)
  bypassNoiseForProvenWinners: boolean;
  bypassDailyCapForProvenWinners: boolean;
  adaptiveSizing: boolean;           // 0.5x-2x based on trader EV
  dedupAcrossTraders: boolean;
  minPrice: number;
  maxPrice: number;
  minTraderAmount: number;
}

const VERSIONS: Record<string, VersionConfig> = {
  "mk1-initial": {
    name: "mk1-initial",
    description: "Initial V2 — basic filters only",
    tradeAmountUsd: 5,
    maxPerMarketPct: 12,
    maxDailyExposurePct: 40,
    maxSignalsPerHour: 0,
    bypassNoiseForProvenWinners: false,
    bypassDailyCapForProvenWinners: false,
    adaptiveSizing: false,
    dedupAcrossTraders: false,
    minPrice: 0.10,
    maxPrice: 0.85,
    minTraderAmount: 10,
  },
  "mk2-risk-controls": {
    name: "mk2-risk-controls",
    description: "Risk controls: both-sides limit, loss pause",
    tradeAmountUsd: 5,
    maxPerMarketPct: 12,
    maxDailyExposurePct: 40,
    maxSignalsPerHour: 0,
    bypassNoiseForProvenWinners: false,
    bypassDailyCapForProvenWinners: false,
    adaptiveSizing: false,
    dedupAcrossTraders: true,
    minPrice: 0.10,
    maxPrice: 0.85,
    minTraderAmount: 10,
  },
  "mk6-stats-resolution": {
    name: "mk6-stats-resolution",
    description: "Resolution tracking + adaptive sizing + 20/hr noise filter",
    tradeAmountUsd: 5,
    maxPerMarketPct: 12,
    maxDailyExposurePct: 40,
    maxSignalsPerHour: 20,
    bypassNoiseForProvenWinners: false,
    bypassDailyCapForProvenWinners: false,
    adaptiveSizing: true,
    dedupAcrossTraders: true,
    minPrice: 0.10,
    maxPrice: 0.85,
    minTraderAmount: 10,
  },
  "mk8-winner-bypass": {
    name: "mk8-winner-bypass",
    description: "Proven winners bypass noise filter (3x limit), tighter 5% per-market",
    tradeAmountUsd: 5,
    maxPerMarketPct: 5,
    maxDailyExposurePct: 40,
    maxSignalsPerHour: 20,
    bypassNoiseForProvenWinners: true,
    bypassDailyCapForProvenWinners: false,
    adaptiveSizing: true,
    dedupAcrossTraders: true,
    minPrice: 0.10,
    maxPrice: 0.85,
    minTraderAmount: 10,
  },
  "mk11-daily-cap-bypass": {
    name: "mk11-daily-cap-bypass (current)",
    description: "Daily cap 75% + 2x bypass for proven winners",
    tradeAmountUsd: 5,
    maxPerMarketPct: 5,
    maxDailyExposurePct: 75,
    maxSignalsPerHour: 20,
    bypassNoiseForProvenWinners: true,
    bypassDailyCapForProvenWinners: true,
    adaptiveSizing: true,
    dedupAcrossTraders: true,
    minPrice: 0.10,
    maxPrice: 0.85,
    minTraderAmount: 10,
  },
};

// ── Trader EV lookup for sizing + bypass decisions ────────────────
interface TraderEv {
  expectedValue: number;
  sizeMultiplier: number;
  confidence: "low" | "medium" | "high";
}

function loadTraderEvs(): Map<string, TraderEv> {
  const rows = db.prepare(`SELECT trader, expected_value, size_multiplier, resolved_trades FROM trader_stats`).all() as any[];
  const map = new Map<string, TraderEv>();
  for (const r of rows) {
    let confidence: "low" | "medium" | "high";
    if (r.resolved_trades < 10) confidence = "low";
    else if (r.resolved_trades < 30) confidence = "medium";
    else confidence = "high";
    map.set(r.trader, {
      expectedValue: r.expected_value,
      sizeMultiplier: r.size_multiplier,
      confidence,
    });
  }
  return map;
}

// ── Run one version against history ────────────────────────────────
function runBacktest(version: VersionConfig, traderEvs: Map<string, TraderEv>): {
  version: string;
  signalsProcessed: number;
  tradesPlaced: number;
  tradesResolved: number;
  wins: number;
  losses: number;
  spent: number;
  returns: number;  // gross returns (payouts minus bets on wins + losses)
  netPnl: number;
} {
  // Pull ALL BUY signals ever seen (including filtered) joined with resolutions
  const rows = db.prepare(`
    SELECT t.timestamp, t.trader, t.slug, t.outcome, t.entry_price, t.trader_amount,
           r.resolved_price, r.won
    FROM trades t
    LEFT JOIN resolutions r ON r.slug = t.slug AND r.outcome = t.outcome
    WHERE t.action = 'BUY'
    ORDER BY t.timestamp ASC
  `).all() as any[];

  let tradesPlaced = 0, tradesResolved = 0, wins = 0, losses = 0, spent = 0, returns = 0;
  const dailySpend = new Map<string, number>();  // date -> $ spent
  const marketSpend = new Map<string, number>(); // slug:outcome -> $ spent
  const activeMarkets = new Set<string>();       // slug:outcome we hold
  const signalsByTraderHour = new Map<string, number[]>();  // trader -> list of epoch hours

  // Estimate starting capital — scale proportionally to real-world runs
  const fallbackCapital = 250;

  for (const row of rows) {
    const date = row.timestamp.split("T")[0];
    const hour = Math.floor(new Date(row.timestamp).getTime() / (60 * 60 * 1000));
    const ev = traderEvs.get(row.trader);
    const isProvenWinner = version.adaptiveSizing && ev && ev.confidence !== "low" && ev.expectedValue > 0.3;

    // ── Filter: price range ─
    if (row.entry_price < version.minPrice) continue;
    if (row.entry_price > version.maxPrice) continue;
    if ((row.trader_amount || 0) < version.minTraderAmount) continue;

    // ── Filter: noise (velocity) ─
    if (version.maxSignalsPerHour > 0) {
      const key = row.trader;
      const hours = signalsByTraderHour.get(key) || [];
      hours.push(hour);
      signalsByTraderHour.set(key, hours);
      const thisHourCount = hours.filter(h => h === hour).length;
      const limit = (version.bypassNoiseForProvenWinners && isProvenWinner)
        ? version.maxSignalsPerHour * 3
        : version.maxSignalsPerHour;
      if (thisHourCount > limit) continue;
    }

    // ── Filter: cross-trader dedup ─
    const marketKey = `${row.slug}:${row.outcome}`;
    if (version.dedupAcrossTraders && activeMarkets.has(marketKey)) continue;

    // ── Sizing ──
    let amount = version.tradeAmountUsd;
    if (version.adaptiveSizing && ev) {
      amount = version.tradeAmountUsd * ev.sizeMultiplier;
    }

    // ── Per-market cap ──
    const marketCapLimit = (version.maxPerMarketPct / 100) * fallbackCapital;
    const marketSpent = marketSpend.get(marketKey) || 0;
    if (marketSpent + amount > marketCapLimit) continue;

    // ── Daily cap ──
    const dailyLimit = (version.maxDailyExposurePct / 100) * fallbackCapital;
    const daySpent = dailySpend.get(date) || 0;
    const effectiveDailyLimit = (version.bypassDailyCapForProvenWinners && isProvenWinner)
      ? dailyLimit * 2
      : dailyLimit;
    if (daySpent + amount > effectiveDailyLimit) continue;

    // PLACE THE TRADE (hypothetically)
    tradesPlaced++;
    spent += amount;
    dailySpend.set(date, daySpent + amount);
    marketSpend.set(marketKey, marketSpent + amount);
    activeMarkets.add(marketKey);

    // Compute P&L from resolution (if resolved)
    if (row.won !== null && row.won !== undefined && row.entry_price > 0) {
      tradesResolved++;
      if (row.won === 1) {
        // Payout = amount / entry_price (buying at entry, each share pays $1)
        const payout = amount / row.entry_price;
        returns += payout;
        wins++;
      } else {
        losses++;
      }
    }
  }

  const netPnl = returns - spent;
  return {
    version: version.name,
    signalsProcessed: rows.length,
    tradesPlaced,
    tradesResolved,
    wins,
    losses,
    spent,
    returns,
    netPnl,
  };
}

// ── Main ──
const arg = process.argv[2] || "all";
const traderEvs = loadTraderEvs();

console.log(`\nBacktest — ${traderEvs.size} traders with EV data\n`);
console.log("version".padEnd(28) + "placed".padStart(8) + "resolved".padStart(10) + "W/L".padStart(9) + "spent".padStart(10) + "payouts".padStart(10) + "  NET P&L".padStart(12));
console.log("-".repeat(90));

const versions = arg === "all" ? Object.values(VERSIONS) : [VERSIONS[arg]].filter(Boolean);
if (versions.length === 0) {
  console.error(`Unknown version: ${arg}. Available: ${Object.keys(VERSIONS).join(", ")}`);
  process.exit(1);
}

const results = versions.map(v => runBacktest(v, traderEvs));
for (const r of results) {
  const wr = r.tradesResolved > 0 ? `${Math.round(r.wins / r.tradesResolved * 100)}%` : "n/a";
  const row =
    r.version.padEnd(28) +
    r.tradesPlaced.toString().padStart(8) +
    r.tradesResolved.toString().padStart(10) +
    `${r.wins}/${r.losses} (${wr})`.padStart(9) +
    `$${r.spent.toFixed(0)}`.padStart(10) +
    `$${r.returns.toFixed(0)}`.padStart(10) +
    `  ${r.netPnl >= 0 ? "+" : ""}$${r.netPnl.toFixed(2)}`.padStart(12);
  console.log(row);
}

console.log("\n_Note: Uses current trader EV data to simulate adaptive sizing retroactively.");
console.log("_Real-world variance differs because live bot sees signals in real-time vs replay.\n");

db.close();
