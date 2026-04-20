# Tomorrow's Plan — 2026-04-20 morning onward

## Context (where we ended tonight)
- Bot paused for a while, now restarted PAPER-ONLY on Hetzner (paperMode:true verified)
- Mac bot stays OFF until we trust the slug-match fix
- Bullpen native copy running for ElkMonkey + 0x2a2c + CemeterySun (or add CemeterySun fresh)
- MK18 (deployed), MK19 (Priority), MK20 (Reset), MK21 (Mirror) all in sim
- ~$30 recovered from bad-bot sells overnight
- Research report saved: `docs/research/2026-04-20-bullpen-ecosystem-report.md`

## The "gotcha" from research that changes everything
**Polymarket's direct API solves the root bug.** `data-api.polymarket.com/trades?user=X` returns slug + eventSlug + conditionId + asset (tokenID) in ONE payload. Our mirror-sell slug mismatch stops being a problem because we get all three identifiers from the source — no guessing, no fuzzy matching. This is a 30-min swap in `src/tracker.ts`, and it's bigger than every MK version we've shipped combined.

## Morning priorities (in order)

### 1. Review overnight paper data (20 min)
Open `coattail.me/performance` — check "In the lab" section for MK20 Reset + MK21 Mirror + MK19 Priority samples. If all three show n=0 resolutions, something's not wiring through (check `/api/lab/versions` directly). If samples are populating, we have real signal to work with.

### 2. Swap tracker signal source to Polymarket direct API (2 hr — HIGHEST VALUE)
Replace `src/tracker.ts` source from Bullpen tracker → `data-api.polymarket.com/trades?user=<wallet>&limit=20`.
- Response includes: slug, eventSlug, conditionId, asset, proxyWallet, outcome, outcomeIndex, price, size, timestamp
- No auth needed, 30 req/s limit
- Fixes slug mismatch at root
- Removes Bullpen as SPOF for signal
- Keep Bullpen tracker as fallback

### 3. Swap leaderboard source to Polymarket native (30 min)
Replace `scripts/refresh-traders.ts` leaderboard call with `lb-api.polymarket.com/profit?window=1d|7d|all&limit=30`. Compute win_rate yourself from `/activity?user=X&type=REDEEM` — no tool returns it natively, so whatever win_rate we show is ours to own. This also de-risks leaderboard from Bullpen downtime.

### 4. File 2 GitHub issues against BullpenFi/bullpen-cli-releases (30 min)
- **"Copy trade $5 minimum fires inactivity-drop when % allocation < $5"** — confirm repro by setting 2% of $60 balance.
- **"Copy trade subscription silently removed on UI refresh when 0 trades + 0 allocated"** — repro after a trader doesn't fire for 24 hrs.
@wu-hongjun responds same-day. These issues are blocking thousands of copy traders, not just you.

### 5. Mint CLOB API key for failover execution (1 hr)
Run `bullpen polymarket clob create-api-key` once on Hetzner, store output in `.env`, build `src/clob-executor.ts` that can place orders directly via `clob.polymarket.com` using those creds. Issue #12 confirms CLOB creds survive Bullpen JWT expiry — this is your reliability insurance.

### 6. Isolate Bullpen account for Hetzner bot (10 min)
- Create new Bullpen account for `jarvis-bot@` or similar
- Never log into app.bullpen.fi with that account
- Migrate Hetzner's `~/.bullpen/credentials.json` to use that account
- Prevents browser auto-refresh from burning the CLI token (the real cause of the 15-min JWT bug)

### 7. Decide on Mac bot restart (30 min)
MK21's paper performance by then will tell us if mirror-sell fix works on paper. If yes, turn Mac bot back on live (paperMode: false) with tight caps. If no, debug further before going live.

## Afternoon / weekend

### Size-weighted conviction filter (4 hr)
Already spec'd in `docs/size-weighted-copying-spec.md`. Use each trader's own bet-size distribution to filter out their low-conviction sprays. elkmonkey averages $189 — anything below $189 from him is noise; anything >$1K is real conviction. $5/trade passes through all; we only WANT the top-quartile signals from spray traders.

### Decoy defense (3 hr)
From research:
- Only mirror FILLED trades (not limit orders on book — decoys cancel before fill)
- Convergence filter: require 2+ tracked wallets same side within 5 min
- Bullpen docs describe this as first-class "convergence signal" — we can use `--type top_traders --category sports` to surface these directly.

### Comparison UI (half day)
`docs/comparison-ui-spec.md` has the full spec. Tremor + Recharts + shadcn. `/performance/compare?v=18,19,20,21`. Side-by-side metrics with sample-size gates.

## Weekend reach goals

- **Custom trader list feature** for subscribers — they can specify which wallets to copy, bot runs their config. Per research, Bullpen's roadmap is moving toward this being built-in, so ship it first.
- **Coattail Signals** as a standalone product line — sell convergence alerts via Telegram for $29/mo, separate from copy-trading bot. Uses Bullpen's smart-money convergence API under the hood.
- **Publish blog post** on `coattail.me/blog`: "Every Polymarket win rate you've seen is made up" — explaining that neither Bullpen nor Polymarket natively expose win_rate; every number in every tool is a derivation. Differentiator for UVA student pitches.

## What NOT to do tomorrow

- Don't touch `paperMode` to false until we have 24h of paper data showing positive EV
- Don't add more traders until the current 10 have enough resolutions to evaluate
- Don't rebuild the backfill / MK-sim engine again — it works, just needs more time and data
- Don't ship the comparison UI before the signal source swap — UI quality matters less than data quality

## Safety rails ongoing

- `paperMode: true` in Hetzner config as default until we have confidence
- `CLAUDE.md` instructs future Claude sessions to never flip paperMode without explicit user confirmation
- All MK versions stay `status: "testing"` until n≥20 resolutions with positive signal
- Daily trader refresh runs 6am/noon/6pm via launchd, writes advisory to `data/latest-roster.json`
