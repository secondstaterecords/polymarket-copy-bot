// scripts/backfill-sim.ts
// One-time backfill: replay all historical signals through all MK version configs
// and populate sim_results + sim_metrics tables.
//
// Usage: npx tsx scripts/backfill-sim.ts

import Database from "better-sqlite3";
import { join } from "path";
import { VERSIONS, VersionConfig } from "../src/versions";
import { computeAllMetrics } from "../src/metrics";

const dataDir = process.env.DATA_DIR || ".";
const db = new Database(join(dataDir, "copybot.db"));

// Create tables if not exist
db.exec(`
  CREATE TABLE IF NOT EXISTS sim_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signal_id INTEGER NOT NULL,
    mk INTEGER NOT NULL,
    decision TEXT NOT NULL,
    skip_reason TEXT,
    sim_amount REAL,
    sim_shares REAL,
    created_at TEXT NOT NULL,
    UNIQUE(signal_id, mk)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_sim_results_mk ON sim_results(mk)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_sim_results_signal ON sim_results(signal_id)`);
db.exec(`
  CREATE TABLE IF NOT EXISTS sim_metrics (
    mk INTEGER NOT NULL,
    computed_at TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    metric_value REAL NOT NULL,
    sample_size INTEGER,
    confidence TEXT,
    PRIMARY KEY (mk, metric_name)
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS version_configs (
    mk INTEGER PRIMARY KEY,
    codename TEXT NOT NULL,
    commit_hash TEXT NOT NULL,
    date TEXT NOT NULL,
    hypothesis TEXT,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'retired',
    config_json TEXT NOT NULL
  )
`);

// Seed version configs
const seedStmt = db.prepare(`
  INSERT OR REPLACE INTO version_configs (mk, codename, commit_hash, date, hypothesis, description, status, config_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
for (const v of VERSIONS) {
  seedStmt.run(v.mk, v.codename, v.commit, v.date, v.hypothesis, v.description, v.status, JSON.stringify(v));
}

// Load all BUY signals
const signals = db.prepare(`
  SELECT id, timestamp, trader, trader_address, slug, outcome, entry_price, trader_amount
  FROM trades
  WHERE action = 'BUY'
  ORDER BY timestamp ASC
`).all() as any[];

// Load trader EVs
const traderEvs = new Map<string, { expectedValue: number; confidence: string }>();
const evRows = db.prepare(`SELECT trader, expected_value, resolved_trades FROM trader_stats`).all() as any[];
for (const r of evRows) {
  traderEvs.set(r.trader, {
    expectedValue: r.expected_value,
    confidence: r.resolved_trades < 10 ? "low" : r.resolved_trades < 30 ? "medium" : "high",
  });
}

// Load resolutions for applying to virtual portfolios
const resolutions = db.prepare(`SELECT slug, outcome, won FROM resolutions`).all() as any[];
const resolutionMap = new Map<string, number>();
for (const r of resolutions) {
  resolutionMap.set(`${r.slug}:${r.outcome}`, r.won);
}

console.log(`\nBackfill: ${signals.length} signals, ${VERSIONS.length} versions, ${resolutions.length} resolutions\n`);

// Clear existing sim_results
db.exec(`DELETE FROM sim_results`);
db.exec(`DELETE FROM sim_metrics`);

const STARTING_CAPITAL = 250;

// For each version, replay all signals
const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO sim_results (signal_id, mk, decision, skip_reason, sim_amount, sim_shares, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertMany = db.transaction(() => {
  for (const version of VERSIONS) {
    const portfolio = {
      cash: STARTING_CAPITAL,
      positions: new Map<string, { shares: number; amount: number }>(),
      dailySpend: new Map<string, number>(),
      signalsByHour: new Map<string, number[]>(),
    };

    let placed = 0, skipped = 0;

    for (const sig of signals) {
      const hour = Math.floor(new Date(sig.timestamp).getTime() / (60 * 60 * 1000));
      const date = sig.timestamp.split("T")[0];
      const marketKey = `${sig.slug}:${sig.outcome}`;

      const ev = traderEvs.get(sig.trader);
      const isElite = version.eliteTierEnabled && version.eliteTraders.includes(sig.trader);
      const isProvenWinner = ev && ev.confidence !== "low" && ev.expectedValue > 0.1;

      let decision = "trade";
      let reason: string | null = null;
      let amount = version.tradeAmountUsd;

      // Price filter
      if (sig.entry_price < version.minPrice) { decision = "skip"; reason = `price below min`; }
      else if (sig.entry_price > version.maxPrice) { decision = "skip"; reason = `price above max`; }
      // Trader amount
      else if (sig.trader_amount < version.minTraderAmount) { decision = "skip"; reason = `trader amount below min`; }
      // Noise filter
      else if (version.maxSignalsPerHour > 0 && !isElite) {
        const hours = portfolio.signalsByHour.get(sig.trader) || [];
        const thisHourCount = hours.filter(h => h === hour).length;
        const limit = (version.bypassNoiseForProvenWinners && isProvenWinner)
          ? version.maxSignalsPerHour * 3 : version.maxSignalsPerHour;
        if (thisHourCount >= limit) { decision = "skip"; reason = `noise`; }
      }
      // Dedup
      else if (version.dedupAcrossTraders && portfolio.positions.has(marketKey)) {
        if (!(version.provenWinnerStacking && isProvenWinner)) { decision = "skip"; reason = `dedup`; }
      }

      // Sizing
      if (decision === "trade" && version.adaptiveSizing && ev) {
        const mult = Math.max(0.5, Math.min(2.0, ev.expectedValue + 0.5));
        amount = version.tradeAmountUsd * mult;
      }

      // Caps
      if (decision === "trade") {
        const marketCap = (version.maxPerMarketPct / 100) * STARTING_CAPITAL;
        const mSpent = portfolio.positions.get(marketKey)?.amount || 0;
        if (mSpent + amount > marketCap) { decision = "skip"; reason = `market cap`; }
      }
      if (decision === "trade") {
        const daySpent = portfolio.dailySpend.get(date) || 0;
        const dailyLimit = (version.maxDailyExposurePct / 100) * STARTING_CAPITAL;
        const effLimit = (version.bypassDailyCapForProvenWinners && isProvenWinner) ? dailyLimit * 2 : dailyLimit;
        if (daySpent + amount > effLimit) { decision = "skip"; reason = `daily cap`; }
      }

      // Record
      const shares = decision === "trade" && sig.entry_price > 0 ? amount / sig.entry_price : null;
      insertStmt.run(sig.id, version.mk, decision, reason, decision === "trade" ? amount : null, shares, sig.timestamp);

      if (decision === "trade") {
        placed++;
        portfolio.cash -= amount;
        const existing = portfolio.positions.get(marketKey);
        if (existing) { existing.shares += (shares || 0); existing.amount += amount; }
        else { portfolio.positions.set(marketKey, { shares: shares || 0, amount }); }
        portfolio.dailySpend.set(date, (portfolio.dailySpend.get(date) || 0) + amount);

        // Apply resolution if known
        const res = resolutionMap.get(marketKey);
        if (res !== undefined) {
          if (res === 1) portfolio.cash += (shares || 0); // winning shares pay $1 each
          portfolio.positions.delete(marketKey);
        }
      } else {
        skipped++;
      }

      // Track velocity
      const hours = portfolio.signalsByHour.get(sig.trader) || [];
      hours.push(hour);
      if (hours.length > 200) hours.splice(0, hours.length - 100);
      portfolio.signalsByHour.set(sig.trader, hours);
    }

    console.log(`  MK${version.mk} ${version.codename.padEnd(12)} placed=${placed} skipped=${skipped} cash=$${portfolio.cash.toFixed(2)}`);
  }
});

insertMany();

// Compute metrics
console.log("\nComputing metrics...");
computeAllMetrics(db);

// Print summary
console.log("\nMetrics summary:");
for (const version of VERSIONS) {
  const wr = db.prepare(`SELECT metric_value FROM sim_metrics WHERE mk = ? AND metric_name = 'win_rate'`).get(version.mk) as any;
  const pnl = db.prepare(`SELECT metric_value FROM sim_metrics WHERE mk = ? AND metric_name = 'net_pnl'`).get(version.mk) as any;
  const sharpe = db.prepare(`SELECT metric_value FROM sim_metrics WHERE mk = ? AND metric_name = 'sharpe_ratio'`).get(version.mk) as any;
  console.log(`  MK${version.mk} ${version.codename.padEnd(12)} WR=${wr ? (wr.metric_value * 100).toFixed(0) + "%" : "n/a"} PnL=${pnl ? "$" + pnl.metric_value.toFixed(2) : "n/a"} Sharpe=${sharpe ? sharpe.metric_value.toFixed(2) : "n/a"}`);
}

db.close();
console.log("\nBackfill complete.");
