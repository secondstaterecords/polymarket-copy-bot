// Pure ranking logic — no network, fully unit-testable.
// Ranks by profit-per-dollar-traded (margin), NOT raw profit, so whales don't win.

import type { LeaderboardEntry } from "./kalshi-client";

export interface RankedTrader extends LeaderboardEntry {
  /** profit / volume — "how much profit per dollar pushed through". Higher = sharper. */
  pctMetric: number;
}

export interface RankOptions {
  topN: number;
  minVolumeUsd: number;
  minSettledTrades: number;
}

/**
 * Apply the anti-whale floor, then rank by pctMetric descending, return top N.
 *
 * The floor is what keeps this honest: without a minimum volume/sample, a trader
 * who turned $50 into $100 shows as 100% and beats a proven trader at 8%.
 */
export function rankTraders(entries: LeaderboardEntry[], opts: RankOptions): RankedTrader[] {
  return entries
    .filter((e) => e.volumeUsd >= opts.minVolumeUsd)
    // Only enforce the trade-count floor when the leaderboard actually reports it.
    .filter((e) => e.settledTrades === 0 || e.settledTrades >= opts.minSettledTrades)
    .map((e) => ({
      ...e,
      pctMetric: e.volumeUsd > 0 ? e.profitUsd / e.volumeUsd : 0,
    }))
    // Only surface profitable traders — copying a top-of-list loser makes no sense.
    .filter((e) => e.pctMetric > 0)
    .sort((a, b) => b.pctMetric - a.pctMetric)
    .slice(0, opts.topN);
}

/** Format the metric as a human %, e.g. 0.083 → "8.3%". */
export function fmtPct(metric: number): string {
  return `${(metric * 100).toFixed(1)}%`;
}
