// ntfy.sh push notifications — free, open-source, iOS app.
// Subscribe to your topic in the ntfy iOS app, then set NTFY_TOPIC.
// Nothing here fabricates data; it just formats real trades into a push.

import { execSync } from "child_process";
import { CONFIG } from "./config";
import { fmtPct, type RankedTrader } from "./ranker";
import type { ProfileTrade } from "./kalshi-client";

export function notifyEnabled(): boolean {
  return !!CONFIG.ntfyTopic;
}

interface Push {
  title: string;
  body: string;
  priority?: 1 | 2 | 3 | 4 | 5; // 5 = max (bypasses some silencing)
  tags?: string[]; // emoji shortcodes, e.g. ["rotating_light"]
  clickUrl?: string;
}

export function push(p: Push): void {
  if (!notifyEnabled()) {
    console.log(`[NTFY] (disabled — set NTFY_TOPIC) ${p.title}: ${p.body}`);
    return;
  }
  const url = `${CONFIG.ntfyServer.replace(/\/$/, "")}/${CONFIG.ntfyTopic}`;
  const headers = [
    `-H 'Title: ${shellSafe(p.title)}'`,
    `-H 'Priority: ${p.priority ?? 4}'`,
  ];
  if (p.tags?.length) headers.push(`-H 'Tags: ${shellSafe(p.tags.join(","))}'`);
  if (p.clickUrl) headers.push(`-H 'Click: ${shellSafe(p.clickUrl)}'`);

  try {
    execSync(
      `curl -sS --max-time 15 ${headers.join(" ")} -d '${shellSafe(p.body)}' '${url}'`,
      { encoding: "utf8" },
    );
  } catch (err: any) {
    console.error(`[NTFY] send failed: ${err.message}`);
  }
}

// A tracked trader just placed a trade → the copy signal.
export function alertNewTrade(trader: RankedTrader, t: ProfileTrade): void {
  const price = t.priceCents ? `${t.priceCents}¢` : "?";
  const market = t.marketTitle || t.marketTicker;
  push({
    title: `📈 ${trader.username} bought ${t.side} (${fmtPct(trader.pctMetric)} trader)`,
    body: `${market}\n${t.side} @ ${price} × ${t.count}`,
    priority: 5,
    tags: ["chart_with_upwards_trend"],
    clickUrl: t.marketTicker
      ? `https://kalshi.com/markets/${t.marketTicker}`
      : `https://kalshi.com/${trader.username}`,
  });
}

// The tracked top-N rotated (hourly re-rank) — so you know who you're watching.
export function alertRosterChange(
  added: RankedTrader[],
  dropped: { username: string }[],
): void {
  if (!added.length && !dropped.length) return;
  const lines: string[] = [];
  for (const t of added) lines.push(`+ ${t.username} (${fmtPct(t.pctMetric)})`);
  for (const t of dropped) lines.push(`- ${t.username}`);
  push({
    title: `🔄 Top ${CONFIG.topN} Kalshi traders updated`,
    body: lines.join("\n"),
    priority: 2,
    tags: ["arrows_counterclockwise"],
  });
}

// Escape single quotes for safe single-quoted shell args.
function shellSafe(s: string): string {
  return s.replace(/'/g, "'\\''");
}
