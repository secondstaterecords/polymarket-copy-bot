// Kalshi top-trader alert config — standalone, no Bullpen.
// Everything is env-overridable so you don't have to edit code to tune it.

export interface KalshiAlertConfig {
  /** How many top traders to track + alert on. */
  topN: number;

  /** Anti-whale floor: a trader is only eligible for the top-N once they clear BOTH. */
  minVolumeUsd: number;
  minSettledTrades: number;

  /**
   * Leaderboard window to rank on. Kalshi's leaderboard supports a period filter;
   * we default to the most recent meaningful window so rankings reflect CURRENT form
   * rather than lifetime whales. Discovery step confirms the exact accepted values.
   */
  leaderboardWindow: "day" | "week" | "month" | "all";

  /** Re-rank the leaderboard this often (default hourly — "hour by hour"). */
  rankRefreshMs: number;

  /** Poll each tracked trader's trades this often. Alert latency ≈ this value. */
  tradePollMs: number;

  /** ntfy.sh delivery. Subscribe to `ntfyTopic` in the iOS app to receive alerts. */
  ntfyServer: string;
  ntfyTopic: string;

  /** Where the state DB lives. */
  dataDir: string;
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

// ── Balanced anti-whale floor (per user's choice) ────────────────────
// Top 3 by profit-per-dollar-traded, requiring a real track record.
export const CONFIG: KalshiAlertConfig = {
  topN: envInt("KALSHI_TOP_N", 3),

  minVolumeUsd: envInt("KALSHI_MIN_VOLUME_USD", 5000),
  minSettledTrades: envInt("KALSHI_MIN_SETTLED_TRADES", 20),

  leaderboardWindow: (process.env.KALSHI_LEADERBOARD_WINDOW as any) || "week",

  rankRefreshMs: envInt("KALSHI_RANK_REFRESH_MS", 60 * 60 * 1000), // 1h
  tradePollMs: envInt("KALSHI_TRADE_POLL_MS", 45 * 1000), // 45s

  ntfyServer: process.env.NTFY_SERVER || "https://ntfy.sh",
  ntfyTopic: process.env.NTFY_TOPIC || "",

  dataDir: process.env.KALSHI_DATA_DIR || "data",
};
