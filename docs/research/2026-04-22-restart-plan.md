# Restart Plan — 2026-04-22

## State of the world right now

**Live income path (working):**
- Bullpen native copy, 5 subs: zhanchesh (x2), RN1, CemeterySun, elkmonkey
- 98 trades today, ~$190 allocated, -$0.95 PNL today
- Settings: $5/trade, Mirror sells, Auto execution

**Paused (need action):**
- RN1 AutoPaused (insufficient balance cascade)
- 1 other AutoPaused sub
- Our custom bot on Mac: OFF
- Our custom bot on Hetzner: OFF + disabled

**Portfolio:**
- $208 total account, but Polygon USDC = ~$1.28 available, rest spread across chains
- 12-28 open positions (mix of Bullpen-native copies + leftover from earlier bot runs)

## The ONE blocking issue

**Polygon USDC = $0-$1.28 while total Bullpen cash shows $143+.** Cash sits on wrong chain. Copy trades need Polygon USDC specifically. When it hits 0, subs auto-pause.

Fix: Bullpen Wallet → Predictions → click swap icon on "Polygon USDC 0.00" row → convert $100 of cash to Polygon USDC.

## Priority order (do in sequence, don't skip)

### P0 — unblock current trading (15 min, do this first)
1. Swap cash → Polygon USDC (user action in Bullpen wallet)
2. Run `bullpen tracker copy resume 0x2005d16a84ceefa912d4e380cd32e7ff827875ea` to resume RN1
3. Run `bullpen tracker copy list` to find 2nd paused sub, resume it
4. Set `total_budget_usd: 50` on each sub via `bullpen tracker copy edit <addr> --total-budget 50` — prevents future auto-pause by skipping new trades instead of failing them

### P1 — fix root cause of mirror-sell failures (2-3 hr)
**Swap bot signal source to Polymarket direct API.** Currently `src/tracker.ts` uses Bullpen tracker feed which returns inconsistent slug formats. Replace with `data-api.polymarket.com/trades?user=<wallet>&limit=20` which returns slug + eventSlug + conditionId + asset in one payload — kills slug-mismatch bug at root. Keep Bullpen tracker as fallback.

### P2 — leaderboard source swap (30 min)
Replace leaderboard call in `scripts/refresh-traders.ts` with `lb-api.polymarket.com/profit?window=1d|7d|30d&limit=30`. Compute win_rate yourself from `/activity?user=X&type=REDEEM` since no tool returns it natively.

### P3 — CLOB API key for failover execution (1 hr)
Run `bullpen polymarket clob create-api-key` once on Hetzner. Store output in `.env`. Build `src/clob-executor.ts` to place orders directly via `clob.polymarket.com` using those creds. Issue #12 confirms CLOB creds survive Bullpen JWT expiry.

### P4 — dedicated Bullpen account for bot (10 min)
Create new Bullpen account for bot (don't use Max's gilded-vole account). Never log into app.bullpen.fi with bot account. Prevents browser auto-refresh from burning CLI JWT token.

### P5 — file GH issues (30 min)
Against `BullpenFi/bullpen-cli-releases`:
- "Copy trade $5 min fires inactivity-drop when % allocation < $5"
- "Auto-paused subs silently fail mirror-sell with 'zero token balance' when original BUY failed — should surface cascade reason in UI"

### P6 — restart Mac bot in paper-only mode (5 min)
`launchctl load ~/Library/LaunchAgents/com.max.polymarket-bot-v2.plist`. Verify zero real trades after restart. Let MK20/MK21 paper data accumulate for comparison.

### P7 — reach goals (weekend)
- Size-weighted conviction filter (spec in `docs/size-weighted-copying-spec.md`)
- Decoy defense (only mirror FILLED trades, convergence filter 2+ wallets same side)
- `/performance/compare` UI (Tremor + Recharts, spec in `docs/comparison-ui-spec.md`)

## Safety rails

- Bot stays paperMode: true until P1 (signal-source swap) ships AND paper data shows >20 resolutions with positive EV
- `total_budget_usd` caps on every Bullpen sub prevent runaway spending on one hot trader
- No roster swaps without checking daily refresh-traders advisory output
- If anything auto-unpauses in Bullpen, check `bullpen tracker copy stats` within 1hr to verify no runaway trading

## Files to read first (for fresh session context)

1. `docs/research/2026-04-20-bullpen-ecosystem-report.md` — full ecosystem intel
2. `docs/research/2026-04-20-tomorrow-plan.md` — yesterday's plan (partially done)
3. `docs/research/2026-04-22-restart-plan.md` — THIS FILE (today's updates)
4. `CLAUDE.md` — project agent rules
5. `~/.claude/learnings/trading.md` — cross-project trading patterns (updated today)
