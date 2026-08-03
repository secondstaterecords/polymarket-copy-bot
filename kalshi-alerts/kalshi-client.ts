// ─────────────────────────────────────────────────────────────────────────────
// THE ONE MODULE THAT TALKS TO KALSHI'S UNDOCUMENTED SOCIAL API.
//
// Kalshi's Social → Leaderboard and public-profile data are served by internal
// endpoints the web/mobile app calls. They are NOT in the official docs. You
// capture the exact paths ONCE from the live site, then paste them into ENDPOINTS
// below. See README.md → "Endpoint discovery" (or run: npm run kalshi-discover).
//
// Until ENDPOINTS is filled in, every call throws a clear error. We deliberately
// do NOT fabricate data — a fake leaderboard would mislead real trading decisions.
// ─────────────────────────────────────────────────────────────────────────────

import { execSync } from "child_process";

// A browser-ish UA — Kalshi sits behind Cloudflare and rejects bare clients.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// ── Fill these in from the discovery step ────────────────────────────
// Use `{window}`, `{sort}`, `{user}` as placeholders — they get substituted.
// Example shapes (REPLACE with what you actually capture):
//   leaderboard: "https://api.elections.kalshi.com/v1/social/leaderboard?period={window}&sort={sort}&limit=100"
//   profileTrades: "https://api.elections.kalshi.com/v1/social/users/{user}/trades?limit=50"
export const ENDPOINTS = {
  leaderboard: process.env.KALSHI_LEADERBOARD_URL || "",
  profileTrades: process.env.KALSHI_PROFILE_TRADES_URL || "",
} as const;

export function endpointsConfigured(): boolean {
  return !!(ENDPOINTS.leaderboard && ENDPOINTS.profileTrades);
}

export function assertEndpoints(): void {
  if (!endpointsConfigured()) {
    throw new Error(
      "Kalshi social endpoints not configured. Capture them from the live site " +
        "(see README → Endpoint discovery, or run `npm run kalshi-discover`) and set " +
        "KALSHI_LEADERBOARD_URL + KALSHI_PROFILE_TRADES_URL, or edit ENDPOINTS in kalshi-client.ts.",
    );
  }
}

// ── Normalized shapes the rest of the app depends on ─────────────────
export interface LeaderboardEntry {
  userId: string;
  username: string;
  profitUsd: number;
  volumeUsd: number;
  settledTrades: number; // may be 0 if the leaderboard doesn't include it (see enrich note in README)
  rank: number;
}

export interface ProfileTrade {
  tradeId: string;
  marketTicker: string;
  marketTitle?: string;
  side: "YES" | "NO";
  priceCents: number;
  count: number; // number of contracts
  ts: number; // epoch ms
}

function httpGetJson(url: string): any {
  // Single-quote the URL so shell metachars in query strings are safe.
  const safe = url.replace(/'/g, "%27");
  const stdout = execSync(
    `curl -sS --max-time 20 -H 'User-Agent: ${UA}' -H 'Accept: application/json' '${safe}'`,
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  ).trim();
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`Kalshi returned non-JSON (first 200 chars): ${stdout.slice(0, 200)}`);
  }
}

/**
 * Pull the leaderboard. `sort` is "profit" or "volume" — we fetch "profit" (which
 * also carries the volume field) so the ranker can compute profit-per-dollar.
 *
 * The field mapping below is intentionally defensive: Kalshi's JSON keys aren't
 * documented, so we probe a few likely names. Adjust once you see the real payload.
 */
export function getLeaderboard(
  window: string,
  sort: "profit" | "volume" = "profit",
): LeaderboardEntry[] {
  assertEndpoints();
  const url = ENDPOINTS.leaderboard
    .replace("{window}", encodeURIComponent(window))
    .replace("{sort}", encodeURIComponent(sort));
  const raw = httpGetJson(url);

  // Kalshi commonly wraps lists — try the obvious containers.
  const rows: any[] = Array.isArray(raw)
    ? raw
    : raw.leaderboard || raw.entries || raw.members || raw.users || raw.data || [];

  return rows.map((r: any, i: number) => ({
    userId: String(r.user_id ?? r.userId ?? r.id ?? r.username ?? ""),
    username: String(r.username ?? r.display_name ?? r.name ?? r.handle ?? ""),
    profitUsd: dollars(r.profit ?? r.profit_usd ?? r.pnl ?? r.total_profit),
    volumeUsd: dollars(r.volume ?? r.volume_usd ?? r.total_volume),
    settledTrades: Number(r.settled_trades ?? r.trades_count ?? r.num_trades ?? 0),
    rank: Number(r.rank ?? i + 1),
  }));
}

/**
 * Recent trades for one public profile, newest first. Used to detect "they just
 * made a call". Keyed by whatever the profile endpoint takes (userId or username).
 */
export function getProfileTrades(user: string): ProfileTrade[] {
  assertEndpoints();
  const url = ENDPOINTS.profileTrades.replace("{user}", encodeURIComponent(user));
  const raw = httpGetJson(url);

  const rows: any[] = Array.isArray(raw)
    ? raw
    : raw.trades || raw.activity || raw.fills || raw.data || [];

  return rows.map((t: any) => ({
    tradeId: String(t.trade_id ?? t.id ?? `${t.ticker ?? t.market_ticker}-${t.created_time ?? t.ts}`),
    marketTicker: String(t.market_ticker ?? t.ticker ?? t.market ?? ""),
    marketTitle: t.title ?? t.market_title ?? undefined,
    side: (String(t.side ?? t.taker_side ?? "").toUpperCase() === "NO" ? "NO" : "YES") as "YES" | "NO",
    priceCents: Number(t.price ?? t.yes_price ?? t.price_cents ?? 0),
    count: Number(t.count ?? t.contracts ?? t.size ?? 0),
    ts: toEpochMs(t.created_time ?? t.ts ?? t.timestamp ?? t.created_at),
  }));
}

// Kalshi amounts are usually in cents; fall back to treating as dollars if small.
function dollars(v: any): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  // Heuristic: leaderboard profit/volume are typically in cents. Divide by 100.
  // If your captured payload is already in dollars, set KALSHI_AMOUNTS_IN_DOLLARS=1.
  return process.env.KALSHI_AMOUNTS_IN_DOLLARS ? n : n / 100;
}

function toEpochMs(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") return v > 1e12 ? v : v * 1000; // sec vs ms
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : 0;
}
