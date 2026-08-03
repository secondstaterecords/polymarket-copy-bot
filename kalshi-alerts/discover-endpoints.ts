// One-time helper: extract Kalshi's undocumented social endpoints from a browser HAR.
//
// Why a HAR? This box can't reach Kalshi, and the endpoints aren't documented.
// The reliable, no-guessing way is to record the real requests your browser makes,
// then read the URLs out of that recording.
//
// HOW TO CAPTURE (2 minutes, on any machine with a browser logged into Kalshi):
//   1. Open Chrome → DevTools (Cmd+Opt+I) → Network tab. Check "Preserve log".
//   2. Visit  kalshi.com/social/leaderboard  and let it load.
//   3. Click into ONE public profile so its positions/trades load.
//   4. In the Network tab: right-click any row → "Save all as HAR with content".
//   5. Save it as  kalshi-alerts/capture.har  and run:  npm run kalshi-discover
//
// It prints the candidate leaderboard + profile-trades URLs (templated) to paste
// into kalshi-client.ts ENDPOINTS (or export as env vars).

import { readFileSync } from "fs";
import { join } from "path";

const HAR_PATH = process.argv[2] || join("kalshi-alerts", "capture.har");

function main() {
  let har: any;
  try {
    har = JSON.parse(readFileSync(HAR_PATH, "utf8"));
  } catch (e: any) {
    console.error(`Could not read HAR at ${HAR_PATH}: ${e.message}`);
    console.error("Capture one first — see the instructions at the top of this file.");
    process.exit(1);
  }

  const entries: any[] = har?.log?.entries || [];
  const apiCalls = entries
    .map((e) => e?.request?.url as string)
    .filter(Boolean)
    .filter((u) => /kalshi/i.test(u))
    .filter((u) => /json/i.test(guessType(u, entries)) || /\/(v\d|api|social|trade-api)\//i.test(u));

  const uniq = [...new Set(apiCalls)];

  const leaderboard = uniq.filter((u) => /leaderboard|ranking|social.*(top|leaders)/i.test(u));
  const profile = uniq.filter((u) => /profile|users?\/|positions|trades|fills|activity|portfolio/i.test(u));

  console.log(`\nScanned ${entries.length} requests, ${uniq.length} Kalshi API-ish calls.\n`);

  report("LEADERBOARD candidates", leaderboard, [
    [/(period|window|timeframe|range)=[^&]+/i, "$1={window}"],
    [/(sort|order|by)=[^&]+/i, "$1={sort}"],
  ]);
  report("PROFILE TRADES candidates", profile, [
    [/(users?\/)[^/?]+/i, "$1{user}"],
    [/(user_id|userId|username|id)=[^&]+/i, "$1={user}"],
  ]);

  if (!leaderboard.length && !profile.length) {
    console.log("No obvious matches. Dumping all Kalshi API calls so you can pick manually:\n");
    for (const u of uniq) console.log("  " + u);
  }

  console.log(`\nPaste the winners into kalshi-alerts/kalshi-client.ts → ENDPOINTS,`);
  console.log(`or export them:\n  export KALSHI_LEADERBOARD_URL='...'\n  export KALSHI_PROFILE_TRADES_URL='...'\n`);
}

function report(label: string, urls: string[], templates: [RegExp, string][]) {
  console.log(`── ${label} (${urls.length}) ─────────────────────────────`);
  for (const u of urls) {
    let t = u;
    for (const [re, rep] of templates) t = t.replace(re, rep);
    console.log(`  raw:      ${u}`);
    console.log(`  template: ${t}\n`);
  }
  if (!urls.length) console.log("  (none)\n");
}

function guessType(url: string, entries: any[]): string {
  const e = entries.find((x) => x?.request?.url === url);
  return e?.response?.content?.mimeType || "";
}

main();
