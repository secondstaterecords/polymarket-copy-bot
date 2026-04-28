# Paste this into a fresh Claude Code tab in `/Users/max/Desktop/polymarket-copy-bot`

---

@~/.claude/WORKFLOW.md adopt this workflow.

Project: Polymarket copy-trading bot in CWD.

## CRITICAL FIRST — V2 cutover happens today

**Polymarket CLOB V2 backend cutover: April 28, 11:00 UTC. Legacy SDKs die at the same moment.** Bullpen v0.1.66 → v0.1.68 likely contains silent V2 prep. Smoke-test before resuming any live activity.

Step 0 (before doing anything else):
1. `date -u` — what time is it relative to 11:00 UTC?
2. If pre-cutover: snapshot the current Bullpen binary (`cp ~/.local/bin/bullpen ~/.local/bin/bullpen-v0.1.68-snapshot`) so we have a known-good if v0.1.69+ ships broken
3. If during cutover (11:00–12:00 UTC): bot signal feed may go silent. Don't restart anything. Wait.
4. If post-cutover: smoke-test with $5 on a **geopolitics** market (zero fee). If buy + sell round-trip works on Bullpen CLI, V2 is good.
5. Read `docs/research/2026-04-28-ecosystem-update.md` for the full breakdown — order struct rewrite, builder auth flow, pUSD wrap, fee schedule, COPYCAT competitor.
6. **Open-position risk:** wallet `0x1023C11A242905BF9C1F25f199B8107047EBe18c` has 5 open positions (~$19 total). USDC.e → pUSD collateral migration may strand them if Bullpen v0.1.68 didn't handle V2 silently. Check `bullpen polymarket positions` post-13:00 UTC. If positions show $0 or error, manual close + redeem via Polymarket UI directly. Don't panic-trade in the cutover window.

## State of the project (verify don't trust)

NOTHING is live. User stopped all 12 Bullpen native copy subs on 2026-04-28 — confirm with `bullpen tracker copy list --output json | jq '.[].status' | sort -u` (should be `"Stopped"` only). Hetzner bot runs paperMode=true. Two weeks of work, user is frustrated with lack of progress, focus on ONE thing at a time.

## Read in order before doing anything beyond Step 0

1. `CLAUDE.md` — agent rules
2. `~/.claude/projects/-Users-max/memory/project_polymarket_bot.md` (updated 2026-04-28 post-cleanup)
3. `docs/research/2026-04-28-ecosystem-update.md` — V2 cutover, Bullpen issues, COPYCAT, decoy patterns, builder program
4. `docs/shadow-live-mode-spec.md` — the build target
5. `docs/sim-engine-fidelity-v2.md` — settled audit, don't re-litigate
6. `~/.claude/learnings/trading.md` — Polygon USDC, auto-paused sells, direct API
7. `~/.claude/projects/-Users-max/memory/feedback_critical_reviewer.md` — adversarial reviewer pattern

## The plan, ordered by leverage post-cutover

**P0 — V2 readiness (ship today, ~30 min total):**
- Pin Bullpen binary (snapshot of v0.1.68)
- Geopolitics smoke-test post-13:00 UTC
- Register Builder Profile at polymarket.com/settings?tab=builder, attach `builderCode` (bytes32) — free volume credit + Builders Program eligibility ($1M)
- 50% taker rebate runs through April 30 — register before then if you want the boost retroactively

**P1 — Shadow-live mode (~6.5 hr, the real verification path):** per `docs/shadow-live-mode-spec.md`
- Schema: `shadow_trades` + `shadow_balance_snapshots`
- `src/shadow-engine.ts` initialized from real Bullpen state on startup (cash + open positions)
- Cash-aware paper buys (refuse when shadow_cash < amount)
- 5-min reconciliation cron, drift logged
- Acceptance: drift < $1 across 7 daily snapshots → live-flip ready

**P2 — Tracker source swap to data-api.polymarket.com (~2 hr):** kills slug-mismatch bug at root, returns slug+eventSlug+conditionId+asset in one payload. Worth re-verifying the data-api URL didn't change in V2.

**P3 — Wallet-basket consensus signal (~1 day):** copycat decoy defense. Only fire when ≥80% of a topic-basket of wallets agree on direction. Research has details + Phemex link.

**P4 — Iceberg detection (~half day):** sum cumulative position delta per wallet/market. Catch whales splitting one big bet across N small fills.

**P5 — `/performance/compare` dashboard (~5 hr):** side-by-side MK + shadow ledger view.

**P6 — Live flip:** gated on `scripts/preflight-live.ts` passing + 7d shadow drift <$1 + user explicit OK.

## Quality work still deferred (pick up between P1 phases if time)

- Sim sells use `signal.price` not market clearing → over/under-credit
- Sim drawdown uses cost-basis not mark-to-market → drawdowns under-report
- `applyResolutions` doesn't expire un-ingested resolutions → equity inflation
- `filters.ts` reads `config.{filters,risk}` not `deployed` (parity assertion catches drift, not root cause)

## Hard rules

- DO NOT resume any Bullpen native copy sub
- DO NOT flip paperMode without explicit OK + committed preflight pass
- DO NOT add new MK versions — verify what we have, don't pile on more strategies
- Spawn a critical reviewer agent (general-purpose) after any non-trivial code change
- If V2 cutover breaks paper-mode signal feed, DO NOT panic-restart the bot — diagnose first

## Start by

1. `date -u` and decide which V2 step (pre/during/post)
2. Confirm 12 subs still Stopped
3. Read the 7 files
4. State P0 + P1 plan in one paragraph
5. Execute

Max-autonomy mode: recommend + execute + report. Don't ask permission for things that match the plan.
