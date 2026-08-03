# Kalshi Top-Trader iPhone Alerts

Standalone alerter (no Bullpen, no coupling to the Polymarket bot). It ranks the
**most %-profitable public Kalshi traders**, watches them, and pushes an alert to
your iPhone the moment one of them makes a trade — so you can **manually** decide
whether to copy it.

- **Ranks by profit-per-dollar-traded, not raw $** → you get sharp traders, not whales.
- **Balanced anti-whale floor**: a trader must clear ~$5k volume **and** ~20 settled
  trades before they're eligible for the top 3.
- **Alerts via [ntfy.sh](https://ntfy.sh)** — free, open-source, dedicated iOS app.

## ⚠️ Two things you must know

1. **Only opted-in public profiles are visible.** Kalshi's leaderboard shows "Only
   public profiles." The genuinely elite may keep their profile private — that's a
   limit of the data, not the tool. This ranks the best of what's public.
2. **The social endpoints are undocumented.** Kalshi's app calls them internally;
   they're not in the official API. You capture them **once** from the live site
   (below). Until then the alerter exits cleanly and does nothing — it will **never
   invent fake traders or trades**.

## Setup

### 1. Endpoint discovery (once, ~2 min, on a machine logged into Kalshi)

1. Chrome → DevTools (`Cmd+Opt+I`) → **Network** tab → check **Preserve log**.
2. Visit `kalshi.com/social/leaderboard` and let it load.
3. Click into **one** public profile so its trades/positions load.
4. Right-click any Network row → **Save all as HAR with content** →
   save as `kalshi-alerts/capture.har`.
5. Run:
   ```bash
   npm run kalshi-discover
   ```
   It prints templated URLs. Paste the winners into `kalshi-alerts/kalshi-client.ts`
   → `ENDPOINTS`, **or** export them:
   ```bash
   export KALSHI_LEADERBOARD_URL='https://.../leaderboard?period={window}&sort={sort}&limit=100'
   export KALSHI_PROFILE_TRADES_URL='https://.../users/{user}/trades?limit=50'
   ```
   Placeholders `{window}`, `{sort}`, `{user}` are substituted at request time.

> When you see the real JSON, sanity-check the field mapping in `kalshi-client.ts`
> (`getLeaderboard` / `getProfileTrades` probe several likely key names). Amounts are
> assumed to be in **cents**; if your payload is already dollars, set
> `KALSHI_AMOUNTS_IN_DOLLARS=1`.

### 2. iPhone notifications (ntfy)

1. Install the **ntfy** app from the App Store.
2. Pick a hard-to-guess topic name (anyone who knows it can read your alerts), e.g.
   `kalshi-alerts-max-9f3a`. Subscribe to it in the app.
3. Export it:
   ```bash
   export NTFY_TOPIC='kalshi-alerts-max-9f3a'
   ```
4. Test:
   ```bash
   curl -d "hello from the alerter" ntfy.sh/$NTFY_TOPIC   # phone should buzz
   ```

### 3. Run

```bash
npm run kalshi-alerts
```
You'll see the top-3 ranked on startup, then per-poll trade checks. On the first
sight of a trader their existing history is recorded silently (not alerted); only
**new** trades after that fire a push.

## Tuning (env vars)

| Var | Default | Meaning |
|-----|---------|---------|
| `KALSHI_TOP_N` | `3` | How many traders to track |
| `KALSHI_MIN_VOLUME_USD` | `5000` | Anti-whale volume floor |
| `KALSHI_MIN_SETTLED_TRADES` | `20` | Anti-whale sample floor |
| `KALSHI_LEADERBOARD_WINDOW` | `week` | `day`/`week`/`month`/`all` |
| `KALSHI_RANK_REFRESH_MS` | `3600000` | Re-rank interval (hourly) |
| `KALSHI_TRADE_POLL_MS` | `45000` | Trade poll interval (≈ alert latency) |
| `NTFY_SERVER` | `https://ntfy.sh` | Self-host ntfy if you want |
| `NTFY_TOPIC` | — | Your ntfy topic (required for pushes) |

## Run it always-on

- **Mac (launchd):** edit paths/env in `deploy/com.max.kalshi-alerts.plist`, then
  `cp deploy/com.max.kalshi-alerts.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.max.kalshi-alerts.plist`
- **Hetzner (systemd):** edit `deploy/kalshi-alerts.service`, then
  `sudo cp deploy/kalshi-alerts.service /etc/systemd/system/ && sudo systemctl enable --now kalshi-alerts`

## Test

```bash
npm test -- kalshi-alerts   # ranker logic: whale-filtering, floors, ordering (no network)
```

## Files

```
config.ts              settings (all env-overridable)
kalshi-client.ts       the ONE module hitting Kalshi's undocumented social API
discover-endpoints.ts  HAR parser to find those endpoints
ranker.ts              profit/volume ranking + anti-whale floor (pure, tested)
notifier.ts            ntfy push formatting
state.ts               better-sqlite3 store: tracked traders + seen trades
index.ts               main loop (hourly re-rank + ~45s trade poll)
deploy/                launchd + systemd unit examples
```

Alerts only — this never auto-trades. You pick and choose.
