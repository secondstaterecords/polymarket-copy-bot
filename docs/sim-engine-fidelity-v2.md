# Sim-engine fidelity audit — v2

Date: 2026-04-23
Purpose: establish ground truth about which `VersionConfig` fields actually affect paper-trade behavior, and which are documentation-only. Needed before any further MK iteration or live flip.

## TL;DR

Sim-engine reads 14 of 17 behavior-affecting fields. Three are dead in sim, four MK "improvements" (14, 15/16, 18, 19) produced zero observable paper difference because their changes targeted code paths the sim doesn't model. MK21's mirror-sell fix is not testable in paper mode at all. Live bot reads risk caps from a separate global config, not from `version.*` — parallel-truth bug. Fix that structural split first.

## Field-by-field audit

Source grep: `src/sim-engine.ts`, `src/bot.ts`, `src/filters.ts`, `src/dashboard.ts`.

| Field | Sim-engine (paper) | Live bot | Status |
|---|---|---|---|
| `minPrice` | sim-engine.ts:50 | filters.ts (via `config.filters`) | WIRED both |
| `maxPrice` | sim-engine.ts:52 | filters.ts | WIRED both |
| `minTraderAmount` | sim-engine.ts:55 | filters.ts | WIRED both |
| `maxSignalsPerHour` | sim-engine.ts:58 | filters.ts (`maxTraderSignalsPerHour`) | WIRED both |
| `dedupAcrossTraders` | sim-engine.ts:70 | filters.ts | WIRED both |
| `tradeAmountUsd` | sim-engine.ts:75 | **bot.ts:208 reads `config.risk.tradeAmountUsd`, not `version.*`** | PARALLEL-TRUTH |
| `adaptiveSizing` | sim-engine.ts:76 | bot.ts (via trader EV) | WIRED both |
| `maxPerMarketPct` | sim-engine.ts:81 | **bot.ts:568 reads `config.risk.*`, not `version.*`** | PARALLEL-TRUTH |
| `maxDailyExposurePct` | sim-engine.ts:88 | **bot.ts:567 reads `config.risk.*`** | PARALLEL-TRUTH |
| `bypassDailyCapForProvenWinners` | sim-engine.ts:89 | bot.ts (proven winner check) | WIRED both |
| `bypassNoiseForProvenWinners` | sim-engine.ts:62 | filters.ts | WIRED both |
| `provenWinnerStacking` | sim-engine.ts:71 | bot.ts | WIRED both |
| `eliteTierEnabled` | sim-engine.ts:47 | bot.ts | WIRED both |
| `eliteTraders` | sim-engine.ts:47 | bot.ts | WIRED both |
| `maxDrawdownPct` | — | bot.ts:587 (circuit breaker) | **DEAD in sim** |
| `splitBuyEnabled` | — | — | **DEAD everywhere** |
| `trackedTraderCount` | — | — | meta only |

## Why specific MK versions looked identical in paper

- **MK14 → MK15 (Splitfire):** Added `splitBuyEnabled: true`. Flag read nowhere in code. Zero behavior change.
- **MK15 → MK16 (Spread):** Reverted `splitBuyEnabled: false`. Same dead flag. Identical metrics confirmed.
- **MK16 → MK17 (Sovereign):** Added `sovereign2013` to `eliteTraders`. Real sim wiring at sim-engine.ts:47, but sovereign2013's signal rate in the sample window never hit `maxSignalsPerHour` (20), so the noise-filter bypass never triggered. No observable diff.
- **MK17 → MK18 (Clockwork):** Circuit breaker reset time change. Circuit breaker exists only in bot.ts (line 576), reset hour is **hardcoded `resetHour = 8`** — not driven by config. Sim has no circuit breaker at all. Zero diff possible.
- **MK18 → MK19 (Priority):** Priority queue with 60s deferral. Grep for `priorityQueue`, `defer`, `queue` in `src/`: zero matches. Feature unimplemented. Zero diff possible.
- **MK19 → MK20 (Reset):** Roster 22→10, tighter caps. These fields ARE wired in sim. Taken count dropped 2971→154. Real diff confirmed.
- **MK20 → MK21 (Mirror):** Mirror-sell fix in bot.ts:289. Fix path gated by `if (!config.paperMode)` — never runs in paper mode. Sim configs identical to MK20 → identical sim_results. Validating MK21 in paper requires a mock-position layer.

## Structural bug: parallel truth

Live bot reads risk caps (`tradeAmountUsd`, `maxPerMarketPct`, `maxDailyExposurePct`, `maxDrawdownPct`) from the global `config.risk` object defined in `src/config.ts`. Sim-engine reads the same names from `version.*`. Both live bot and sim should be driven by the deployed MK config. Right now you must hand-sync `config.ts` when shipping a new MK or the live bot ignores the MK's caps entirely.

Evidence this already happened: MK20 config sets `maxPerMarketPct: 3` and `maxDailyExposurePct: 30`, but those values only apply because `config.ts` was also updated in the same commit (`ab08d39`). A future MK that updates `versions.ts` alone would silently not apply.

## What paper mode cannot test (be honest about this)

1. **Mirror-sell matching (MK21).** Runs only when `!paperMode`. 1,818 paper sells since 4/19 bypassed the fix path entirely.
2. **Circuit breaker drawdown trigger (MK18 and earlier).** Not in sim.
3. **JWT auth reauth / CLI latency.** Execution layer not modeled.
4. **Bullpen's own filters** (e.g. insufficient-balance auto-pause). External to our code.
5. **Slippage + fills.** Sim assumes instant fill at entry_price.

## Recommended fixes (ranked by value)

1. **[3 hr] Mock-position layer in sim-engine.** Per-MK virtual position list tracks shares bought and sold. When a SELL signal fires in sim, run the MK21 matching logic against the virtual positions. This enables paper-testing the mirror-sell fix before any live flip. Highest leverage — unblocks the entire MK21 validation.

2. **[1 hr] Collapse `config.risk` → `version.*`.** Live bot picks the `status: "deployed"` MK and reads all risk params from it. One source of truth. Deletes the parallel-config-maintenance chore and eliminates drift bugs.

3. **[30 min] Delete dead fields.** Remove `splitBuyEnabled` (unreferenced), `trackedTraderCount` (meta-only), and `maxDrawdownPct` from sim-relevant types if not wired. Or implement them. Don't leave half-done knobs that pollute the comparison dashboard.

4. **[2 hr] Wire priority queue in sim (if we still want it).** sim-engine signal evaluation becomes async with a 60s defer buffer for low-conviction trades. Then MK19 has meaning.

5. **[30 min] Wire circuit breaker in sim.** Per-MK drawdown tracker that halts new buys when `unrealized_pnl < -maxDrawdownPct * STARTING_CAPITAL`. Then MK18's reset-hour change has meaning (and needs `resetHour` promoted to config field, not hardcoded).

6. **[1 hr] Add `config_fingerprint` hash to each VersionConfig** — SHA of all behavior-affecting fields. If two MKs have identical fingerprints, fail CI — forces new MKs to either change a real knob or not be a new MK.

## Minimum bar before any live flip

Per-MK, no exceptions:
- `sample_size ≥ 100 resolved` in the `win_rate` metric row
- `config_fingerprint` differs from all previously-deployed MKs
- If MK adds a new flag, sim-engine grep must show the flag is read
- Offline replay script for MK21-class bot-level fixes: feeds the last 500 real SELL signals through the fixed matcher against reconstructed historical positions, reports match rate

## Next actions

1. Commit this spec.
2. If you approve the ranking: start with fix #1 (mock-position layer) — unblocks MK21 paper validation.
3. Fix #2 (collapse config.risk → version.*) next session — eliminates the drift bug.
4. Do not ship MK22 until at least fixes #1, #2, #3 are in.
