// src/metrics.ts
// Computes all Suit Lab metrics from sim_results + resolutions data.
// Called hourly by the bot process.

import Database from "better-sqlite3";
import { VERSIONS } from "./versions";
import { upsertSimMetric } from "./db";

interface TradeRow {
  mk: number;
  decision: string;
  sim_amount: number;
  entry_price: number;
  trader: string;
  slug: string;
  timestamp: string;
  won: number | null;       // 1 = win, 0 = loss, null = unresolved
  category: string | null;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/** Group resolved trades by calendar date (YYYY-MM-DD) and sum pnl per day. */
function computeDailyReturns(trades: TradeRow[]): number[] {
  const resolved = trades.filter(t => t.won !== null);
  if (resolved.length === 0) return [];

  const byDay = new Map<string, number>();
  for (const t of resolved) {
    const day = t.timestamp.slice(0, 10);
    const pnl = t.won === 1
      ? t.sim_amount * (1 / t.entry_price - 1)   // payout - stake
      : -t.sim_amount;                             // lost stake
    byDay.set(day, (byDay.get(day) ?? 0) + pnl);
  }
  return Array.from(byDay.values());
}

function computeSharpe(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0;
  const m = mean(dailyReturns);
  const sd = stdev(dailyReturns);
  if (sd === 0) return 0;
  return (m / sd) * Math.sqrt(365);
}

function computeSortino(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0;
  const m = mean(dailyReturns);
  const negReturns = dailyReturns.filter(r => r < 0);
  if (negReturns.length === 0) return m > 0 ? Infinity : 0;
  const downDev = stdev(negReturns);
  if (downDev === 0) return 0;
  return (m / downDev) * Math.sqrt(365);
}

/** Returns { maxDrawdown (fraction), maxDrawdownDurationHrs }. */
function computeDrawdown(trades: TradeRow[]): { maxDrawdown: number; maxDrawdownDurationHrs: number } {
  const resolved = trades.filter(t => t.won !== null);
  if (resolved.length === 0) return { maxDrawdown: 0, maxDrawdownDurationHrs: 0 };

  let equity = 0;
  let peak = 0;
  let maxDD = 0;
  let maxDDHrs = 0;
  let ddStartTime: number | null = null;

  for (const t of resolved) {
    const pnl = t.won === 1
      ? t.sim_amount * (1 / t.entry_price - 1)
      : -t.sim_amount;
    equity += pnl;

    if (equity > peak) {
      peak = equity;
      ddStartTime = null; // reset — we're at new highs
    }

    const dd = peak > 0 ? (peak - equity) / peak : 0;
    if (dd > maxDD) {
      maxDD = dd;
      if (ddStartTime === null) {
        ddStartTime = new Date(t.timestamp).getTime();
      }
      const nowMs = new Date(t.timestamp).getTime();
      maxDDHrs = (nowMs - ddStartTime) / 3_600_000;
    }
  }

  return { maxDrawdown: maxDD, maxDrawdownDurationHrs: maxDDHrs };
}

/** Infer category from slug prefix. */
function inferCategory(slug: string): string {
  const s = slug.toLowerCase();
  if (s.startsWith("mlb-")) return "mlb";
  if (s.startsWith("nba-")) return "nba";
  if (s.startsWith("nhl-")) return "nhl";
  if (s.startsWith("nfl-")) return "nfl";
  if (s.startsWith("mls-")) return "mls";
  if (s.startsWith("ufc-")) return "ufc";
  if (s.startsWith("atp-") || s.startsWith("wta-")) return "tennis";
  if (s.startsWith("lol-") || s.startsWith("cs2-") || s.startsWith("val-") || s.startsWith("dota")) return "esports";
  if (s.startsWith("btc-") || s.startsWith("crypto")) return "crypto";
  if (s.startsWith("epl-") || s.startsWith("ucl-") || s.startsWith("uel-") ||
      s.startsWith("fl1-") || s.startsWith("bun-") || s.startsWith("sea-") ||
      s.startsWith("elc-") || s.startsWith("bl2-")) return "soccer";
  if (s.startsWith("trump") || s.startsWith("iran") || s.startsWith("invade")) return "politics";
  return "other";
}

/** Group trades by category, return { [category]: TradeRow[] }. */
function inferCategories(trades: TradeRow[]): Record<string, TradeRow[]> {
  const groups: Record<string, TradeRow[]> = {};
  for (const t of trades) {
    const cat = t.category ?? inferCategory(t.slug);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(t);
  }
  return groups;
}

/** Confidence level based on resolved sample size. */
function confidence(n: number): string {
  if (n < 10) return "low";
  if (n < 30) return "medium";
  return "high";
}

// ── core computation ─────────────────────────────────────────────────────────

function computeVersionMetrics(db: Database.Database, mk: number): void {
  const trades = db.prepare(`
    SELECT sr.mk, sr.decision, sr.sim_amount, t.entry_price, t.trader, t.slug, t.timestamp,
           r.won, r.category
    FROM sim_results sr
    JOIN trades t ON t.id = sr.signal_id
    LEFT JOIN resolutions r ON r.slug = t.slug AND r.outcome = t.outcome
    WHERE sr.mk = ? AND sr.decision = 'trade' AND t.action = 'BUY'
    ORDER BY t.timestamp ASC
  `).all(mk) as TradeRow[];

  if (trades.length === 0) return;

  const resolved = trades.filter(t => t.won !== null);
  const n = resolved.length;
  const conf = confidence(n);

  // ── Tier 1 ───────────────────────────────────────────────────────────────

  // win_rate
  const wins = resolved.filter(t => t.won === 1).length;
  const win_rate = n > 0 ? wins / n : 0;
  upsertSimMetric(db, mk, "win_rate", win_rate, n, conf);

  // net_pnl
  let totalWinPayout = 0;
  let totalLossBet = 0;
  let net_pnl = 0;
  for (const t of resolved) {
    if (t.won === 1) {
      const profit = t.sim_amount * (1 / t.entry_price - 1);
      totalWinPayout += profit;
      net_pnl += profit;
    } else {
      totalLossBet += t.sim_amount;
      net_pnl -= t.sim_amount;
    }
  }
  upsertSimMetric(db, mk, "net_pnl", net_pnl, n, conf);

  // profit_factor
  const profit_factor = totalLossBet > 0 ? totalWinPayout / totalLossBet : totalWinPayout > 0 ? Infinity : 0;
  upsertSimMetric(db, mk, "profit_factor", isFinite(profit_factor) ? profit_factor : 999, n, conf);

  // sharpe_ratio
  const dailyReturns = computeDailyReturns(trades);
  const sharpe_ratio = computeSharpe(dailyReturns);
  upsertSimMetric(db, mk, "sharpe_ratio", sharpe_ratio, dailyReturns.length, conf);

  // ── Tier 2 ───────────────────────────────────────────────────────────────

  // brier_score — lower is better, 0 = perfect
  // outcome: 1 for win, 0 for loss; entry_price is the probability estimate
  const brier_score = n > 0
    ? mean(resolved.map(t => (t.entry_price - (t.won === 1 ? 1 : 0)) ** 2))
    : 0;
  upsertSimMetric(db, mk, "brier_score", brier_score, n, conf);

  // max_drawdown + max_drawdown_duration_hrs
  const { maxDrawdown, maxDrawdownDurationHrs } = computeDrawdown(trades);
  upsertSimMetric(db, mk, "max_drawdown", maxDrawdown, n, conf);
  upsertSimMetric(db, mk, "max_drawdown_duration_hrs", maxDrawdownDurationHrs, n, conf);

  // avg_return_per_trade
  const avg_return_per_trade = n > 0
    ? resolved.reduce((s, t) => {
        return s + (t.won === 1 ? t.sim_amount * (1 / t.entry_price - 1) : -t.sim_amount);
      }, 0) / n
    : 0;
  upsertSimMetric(db, mk, "avg_return_per_trade", avg_return_per_trade, n, conf);

  // signal_to_trade_ratio — how many signals actually became trades vs total sim rows
  const totalSignals = db.prepare(
    `SELECT COUNT(*) as cnt FROM sim_results WHERE mk = ?`
  ).get(mk) as { cnt: number };
  const signal_to_trade_ratio = totalSignals.cnt > 0 ? trades.length / totalSignals.cnt : 0;
  upsertSimMetric(db, mk, "signal_to_trade_ratio", signal_to_trade_ratio, totalSignals.cnt, conf);

  // trades_placed
  upsertSimMetric(db, mk, "trades_placed", trades.length, trades.length, conf);

  // sortino_ratio
  const sortino_ratio = computeSortino(dailyReturns);
  upsertSimMetric(db, mk, "sortino_ratio", sortino_ratio, dailyReturns.length, conf);

  // tail_ratio — ratio of 95th percentile gain to 5th percentile loss (absolute)
  if (dailyReturns.length >= 10) {
    const sorted = [...dailyReturns].sort((a, b) => a - b);
    const p5idx = Math.floor(sorted.length * 0.05);
    const p95idx = Math.floor(sorted.length * 0.95);
    const p5 = sorted[p5idx];
    const p95 = sorted[p95idx];
    const tail_ratio = p5 < 0 ? Math.abs(p95) / Math.abs(p5) : 0;
    upsertSimMetric(db, mk, "tail_ratio", tail_ratio, dailyReturns.length, conf);
  }

  // ── Tier 3: per-trader metrics ────────────────────────────────────────────

  const byTrader = new Map<string, TradeRow[]>();
  for (const t of trades) {
    if (!byTrader.has(t.trader)) byTrader.set(t.trader, []);
    byTrader.get(t.trader)!.push(t);
  }

  for (const [trader, traderTrades] of byTrader.entries()) {
    const traderResolved = traderTrades.filter(t => t.won !== null);
    const tn = traderResolved.length;
    const tConf = confidence(tn);

    const tWins = traderResolved.filter(t => t.won === 1).length;
    const tWinRate = tn > 0 ? tWins / tn : 0;
    const tPnl = traderResolved.reduce((s, t) => {
      return s + (t.won === 1 ? t.sim_amount * (1 / t.entry_price - 1) : -t.sim_amount);
    }, 0);

    // Sanitize trader name for metric key (alphanumeric + underscore only)
    const safeName = trader.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
    upsertSimMetric(db, mk, `trader_wr_${safeName}`, tWinRate, tn, tConf);
    upsertSimMetric(db, mk, `trader_pnl_${safeName}`, tPnl, tn, tConf);
  }

  // ── Tier 3: per-category metrics ─────────────────────────────────────────

  const categories = inferCategories(trades);
  for (const [cat, catTrades] of Object.entries(categories)) {
    const catResolved = catTrades.filter(t => t.won !== null);
    const cn = catResolved.length;
    const cConf = confidence(cn);

    const cWins = catResolved.filter(t => t.won === 1).length;
    const cWinRate = cn > 0 ? cWins / cn : 0;

    const safeCat = cat.replace(/[^a-zA-Z0-9]/g, "_");
    upsertSimMetric(db, mk, `category_wr_${safeCat}`, cWinRate, cn, cConf);
  }
}

// ── public API ────────────────────────────────────────────────────────────────

export function computeAllMetrics(db: Database.Database): void {
  for (const version of VERSIONS) {
    try {
      computeVersionMetrics(db, version.mk);
    } catch (err) {
      console.error(`[metrics] Error computing MK${version.mk}:`, err);
    }
  }
}
