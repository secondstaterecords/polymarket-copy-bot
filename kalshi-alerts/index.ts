// Main loop: rank the top Kalshi traders hourly, poll their trades every ~45s,
// and push an iPhone alert (ntfy) the moment a tracked trader makes a call.
//
// Two independent timers (recursive setTimeout, matching src/bot.ts style):
//   • rankRefreshMs  → refresh leaderboard, re-pick top-N, alert on roster changes
//   • tradePollMs    → diff each tracked trader's trades, alert on new ones

import { CONFIG } from "./config";
import {
  getLeaderboard,
  getProfileTrades,
  endpointsConfigured,
} from "./kalshi-client";
import { rankTraders, fmtPct } from "./ranker";
import { notifyEnabled, alertNewTrade, alertRosterChange } from "./notifier";
import {
  openState,
  updateTrackedSet,
  getTracked,
  isTradeSeen,
  markTradeSeen,
} from "./state";

function log(tag: string, msg: string) {
  console.log(`[${new Date().toISOString()}] [${tag}] ${msg}`);
}

const db = openState(CONFIG.dataDir);

// Grace window on first sight of a trader: their existing history isn't "news".
// We record their recent trades as seen without alerting, then alert on anything new.
const primed = new Set<string>();

function refreshRankings() {
  try {
    const board = getLeaderboard(CONFIG.leaderboardWindow, "profit");
    const ranked = rankTraders(board, {
      topN: CONFIG.topN,
      minVolumeUsd: CONFIG.minVolumeUsd,
      minSettledTrades: CONFIG.minSettledTrades,
    });
    if (!ranked.length) {
      log("RANK", `leaderboard returned ${board.length} rows but none cleared the floor`);
    }
    const { added, dropped } = updateTrackedSet(db, ranked, new Date().toISOString());
    log(
      "RANK",
      `top ${CONFIG.topN}: ${ranked.map((r) => `${r.username}(${fmtPct(r.pctMetric)})`).join(", ") || "—"}`,
    );
    if (added.length || dropped.length) {
      alertRosterChange(added, dropped);
      // New traders get primed on the next trade poll (not alerted retroactively).
      for (const t of added) primed.delete(t.userId);
    }
  } catch (e: any) {
    log("RANK", `error: ${e.message}`);
  } finally {
    setTimeout(refreshRankings, CONFIG.rankRefreshMs);
  }
}

function pollTrades() {
  try {
    const tracked = getTracked(db);
    const now = new Date().toISOString();
    for (const trader of tracked) {
      let trades;
      try {
        trades = getProfileTrades(trader.userId || trader.username);
      } catch (e: any) {
        log("POLL", `${trader.username}: ${e.message}`);
        continue;
      }
      const firstSight = !primed.has(trader.userId);
      for (const t of trades) {
        if (isTradeSeen(db, t.tradeId)) continue;
        markTradeSeen(db, t.tradeId, trader.userId, t.ts, now);
        if (firstSight) continue; // prime silently — don't alert on pre-existing history
        alertNewTrade(trader, t);
        log("ALERT", `${trader.username} ${t.side} ${t.marketTicker} @ ${t.priceCents}¢ ×${t.count}`);
      }
      primed.add(trader.userId);
    }
  } catch (e: any) {
    log("POLL", `error: ${e.message}`);
  } finally {
    setTimeout(pollTrades, CONFIG.tradePollMs);
  }
}

function main() {
  log("INIT", `Kalshi top-trader alerts — top ${CONFIG.topN}, window=${CONFIG.leaderboardWindow}`);
  log("INIT", `floor: volume ≥ $${CONFIG.minVolumeUsd}, settled ≥ ${CONFIG.minSettledTrades}`);

  if (!endpointsConfigured()) {
    log("INIT", "Kalshi social endpoints NOT configured — nothing to poll.");
    log("INIT", "Capture them: see kalshi-alerts/README.md → 'Endpoint discovery' (npm run kalshi-discover).");
    log("INIT", "Set KALSHI_LEADERBOARD_URL + KALSHI_PROFILE_TRADES_URL, then restart.");
    return; // clean exit — no fake data, no crash loop
  }
  if (!notifyEnabled()) {
    log("INIT", "NTFY_TOPIC not set — alerts will only print to the log until you set it.");
  }

  refreshRankings(); // seeds the tracked set immediately, then re-arms hourly
  // Give the first ranking a moment to land before the first trade poll.
  setTimeout(pollTrades, 3000);
}

main();
