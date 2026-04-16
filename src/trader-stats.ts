// Per-trader statistics — win rate, avg return, expected value, best categories.
// Used to adaptively size trades based on each trader's track record.

import Database from "better-sqlite3";
import { inferCategory } from "./resolution-tracker";

export interface TraderStats {
  trader: string;
  totalTrades: number;      // all buy trades we've copied from them
  resolvedTrades: number;   // trades where the market has closed
  wins: number;
  losses: number;
  winRate: number;          // 0 to 1
  avgReturnPct: number;     // average return per resolved trade (%)
  avgClvPct: number;        // closing line value — gold-standard edge metric
  expectedValue: number;    // EV per $1 bet
  bestCategory: string | null;
  bestCategoryWr: number | null;
  sizeMultiplier: number;   // 0.5 to 2.0 based on track record
  confidence: "low" | "medium" | "high"; // based on sample size
}

// Compute stats for a single trader from resolutions
export function computeTraderStats(db: Database.Database, trader: string): TraderStats {
  // Get all BUY trades for this trader that we actually copied (paper + real success)
  // — excludes 'filtered' signals which are just noise in the log
  const rows = db.prepare(`
    SELECT t.slug, t.outcome, t.entry_price, r.resolved_price, r.won
    FROM trades t
    LEFT JOIN resolutions r ON r.slug = t.slug AND r.outcome = t.outcome
    WHERE t.trader = ? AND t.action = 'BUY' AND t.status IN ('success', 'paper')
  `).all(trader) as any[];

  const totalTrades = rows.length;
  const resolved = rows.filter(r => r.won !== null && r.won !== undefined);
  const resolvedTrades = resolved.length;
  const wins = resolved.filter(r => r.won === 1).length;
  const losses = resolvedTrades - wins;
  const winRate = resolvedTrades > 0 ? wins / resolvedTrades : 0;

  // Compute return per resolved trade
  // Return = (resolved_price - entry_price) / entry_price
  let totalReturn = 0;
  for (const r of resolved) {
    const entry = r.entry_price || 0;
    const final = r.resolved_price || 0;
    if (entry > 0) {
      totalReturn += (final - entry) / entry;
    }
  }
  const avgReturnPct = resolvedTrades > 0 ? (totalReturn / resolvedTrades) * 100 : 0;

  // Expected value per $1 bet = (avg return / entry price weighted by price)
  // Simplified: EV = winRate * avgPayout - lossRate * 1
  // avgPayout = avg(1/entry_price - 1) on wins
  let winPayouts = 0, winCount = 0;
  for (const r of resolved) {
    if (r.won === 1 && r.entry_price > 0) {
      winPayouts += (1 / r.entry_price) - 1;
      winCount++;
    }
  }
  const avgWinPayout = winCount > 0 ? winPayouts / winCount : 0;
  const expectedValue = winRate * avgWinPayout - (1 - winRate);

  // Closing Line Value (CLV) — average edge at entry vs final price.
  // Positive CLV = we consistently got better prices than the close = we're +EV
  // This is the gold-standard metric used by pro sports bettors.
  let totalClv = 0, clvCount = 0;
  for (const r of resolved) {
    if (r.entry_price > 0 && r.resolved_price !== null && r.resolved_price !== undefined) {
      // CLV = (final - entry) / entry. We want this positive on average.
      totalClv += (r.resolved_price - r.entry_price) / r.entry_price;
      clvCount++;
    }
  }
  const avgClvPct = clvCount > 0 ? (totalClv / clvCount) * 100 : 0;

  // Best category
  const catStats: Record<string, { wins: number; total: number }> = {};
  for (const r of resolved) {
    const cat = inferCategory(r.slug);
    if (!catStats[cat]) catStats[cat] = { wins: 0, total: 0 };
    catStats[cat].total++;
    if (r.won === 1) catStats[cat].wins++;
  }
  let bestCategory: string | null = null;
  let bestCategoryWr: number | null = null;
  for (const [cat, s] of Object.entries(catStats)) {
    if (s.total < 3) continue; // need at least 3 trades in category
    const wr = s.wins / s.total;
    if (bestCategoryWr === null || wr > bestCategoryWr) {
      bestCategory = cat;
      bestCategoryWr = wr;
    }
  }

  // Confidence tiers by sample size
  let confidence: "low" | "medium" | "high";
  if (resolvedTrades < 10) confidence = "low";
  else if (resolvedTrades < 30) confidence = "medium";
  else confidence = "high";

  // Size multiplier — adaptive bet sizing
  // Low confidence: always 1.0 (no signal yet)
  // Medium/High + positive EV: scale up to 2.0
  // Medium/High + negative EV: scale down to 0.5 (or avoid entirely)
  let sizeMultiplier = 1.0;
  if (confidence !== "low") {
    if (expectedValue > 0.3) sizeMultiplier = 2.0;
    else if (expectedValue > 0.1) sizeMultiplier = 1.5;
    else if (expectedValue > 0) sizeMultiplier = 1.2;
    else if (expectedValue > -0.1) sizeMultiplier = 0.8;
    else sizeMultiplier = 0.5;
  }

  return {
    trader,
    totalTrades,
    resolvedTrades,
    wins,
    losses,
    winRate,
    avgReturnPct,
    avgClvPct,
    expectedValue,
    bestCategory,
    bestCategoryWr,
    sizeMultiplier,
    confidence,
  };
}

// Recompute stats for ALL traders and save to DB
export function recomputeAllTraderStats(db: Database.Database): TraderStats[] {
  const traders = db.prepare(`SELECT DISTINCT trader FROM trades WHERE trader != '' AND trader != 'AUTO-PROFIT'`).all() as any[];
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO trader_stats
    (trader, total_trades, resolved_trades, wins, losses, win_rate, avg_return_pct,
     avg_clv_pct, expected_value, best_category, best_category_wr, size_multiplier, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  const results: TraderStats[] = [];
  for (const { trader } of traders) {
    const s = computeTraderStats(db, trader);
    stmt.run(s.trader, s.totalTrades, s.resolvedTrades, s.wins, s.losses,
      s.winRate, s.avgReturnPct, s.avgClvPct, s.expectedValue, s.bestCategory, s.bestCategoryWr,
      s.sizeMultiplier, now);
    results.push(s);
  }
  return results;
}

// Get size multiplier for a trader (1.0 default if unknown)
export function getTraderSizeMultiplier(db: Database.Database, trader: string): number {
  const row = db.prepare(`SELECT size_multiplier FROM trader_stats WHERE trader = ?`).get(trader) as any;
  return row?.size_multiplier || 1.0;
}

// Get full stats snapshot for dashboard / alerts
export function getAllTraderStats(db: Database.Database): any[] {
  return db.prepare(`SELECT * FROM trader_stats ORDER BY expected_value DESC`).all();
}
