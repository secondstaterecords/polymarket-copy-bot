# Shadow-live mode — design spec

Date: 2026-04-28
Goal: replace the current $250-fiction-per-MK paper sim with a single shadow ledger that mirrors the user's actual Bullpen account state, so verification before any live flip is 1:1 not approximate.

## Why this exists

Current sim-engine.ts gives every MK a fresh `STARTING_CAPITAL = 250` virtual portfolio and runs forever. Useful for comparing strategies, useless for "would this exact bot, with my exact balance and my exact open positions, have made money this week."

User-stated requirement (2026-04-28): "I need everything working perfectly and perfectly firing as if it was the balance I have now in my bullpen, but needs to track buys and sells and not buy when it has no cash etc, so I can verify it would work exactly as planned before we switch to live."

## Scope

**In:**
- Single shadow portfolio for the deployed MK only (MK20 today)
- Starts at the actual Bullpen Polygon USDC balance + real open positions snapshot
- Every BUY signal: paper-execute IF shadow cash ≥ amount, else record `skipped: insufficient cash`
- Every SELL signal: run MK21-fix matcher against shadow positions, paper-execute if matched
- Periodically reconcile: shadow cash vs `bullpen polymarket positions` cash. Drift report.
- Audit log: every paper trade has timestamp, slug, outcome, decision, reason, shadow_cash_before, shadow_cash_after

**Out (deferred):**
- Multi-MK shadow comparison — sim-engine still does that for "how would MK22 compare"
- Slippage modeling — assume signal.price for now (reviewer-flagged item, separate fix)
- Mark-to-market drawdown — same (separate fix)
- Bullpen native vs shadow side-by-side dashboard — Phase 2

## Schema additions (additive, no migration of existing tables)

```sql
CREATE TABLE shadow_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  trader TEXT NOT NULL,
  slug TEXT NOT NULL,
  outcome TEXT NOT NULL,
  side TEXT NOT NULL,                -- 'BUY' | 'SELL'
  decision TEXT NOT NULL,            -- 'executed' | 'skipped' | 'sell-miss'
  reason TEXT,
  amount_usd REAL,
  shares REAL,
  price REAL,
  shadow_cash_before REAL NOT NULL,
  shadow_cash_after REAL NOT NULL,
  match_type TEXT                    -- exact / fuzzy / null
);

CREATE INDEX idx_shadow_trades_signal ON shadow_trades(signal_id);
CREATE INDEX idx_shadow_trades_slug ON shadow_trades(slug, outcome);

CREATE TABLE shadow_balance_snapshots (
  timestamp TEXT PRIMARY KEY,
  shadow_cash REAL NOT NULL,
  shadow_positions_value REAL NOT NULL,
  bullpen_cash REAL,                 -- nullable: source-of-truth from bullpen CLI
  bullpen_positions_value REAL,
  drift_usd REAL                     -- shadow - bullpen, positive = paper ahead
);
```

## Engine: `src/shadow-engine.ts`

One module, one exported function `processSignalShadow(db, signalId, signal)`. Mirrors `simulateSignal` but:
1. Runs for the deployed MK only (`getDeployedVersion()`)
2. Maintains in-memory shadow portfolio: `{cash: number, positions: Map<key, {shares, slug, outcome, entry, amount}>}`
3. Initializes from real Bullpen state on bot startup via `bullpen polymarket positions` + cash query
4. Uses MK21-fix matcher (`mirrorSellFuzzyMatch`) for sells regardless of deployed MK's setting — we want shadow to test the fix path
5. Persists every decision to `shadow_trades` with full audit fields

## Reconciliation

A 5-min interval task runs:
1. Fetch real Bullpen state via `bullpen polymarket positions --output json`
2. Compute `bullpen_cash + bullpen_positions_value`
3. Compute `shadow_cash + shadow_positions_value`
4. Insert row into `shadow_balance_snapshots` with both + drift
5. If `|drift| > $10`, log a WARN with which positions diverged

This is the verification layer the user asked for. After 7 days of running, you can answer: "did shadow track Bullpen?" with a chart.

## Initialization flow (bot startup)

```ts
async function initShadow() {
  const positions = await getRealPositions();        // bullpen CLI
  const cash = await getRealCash();                  // bullpen CLI
  shadowPortfolio = {
    cash,
    positions: new Map(positions.map(p => [`${p.slug}:${p.outcome}`, {
      shares: p.shares, slug: p.slug, outcome: p.outcome,
      entry: p.avg_price, amount: p.invested_usd
    }]))
  };
  log("SHADOW", `Initialized from Bullpen: $${cash} cash, ${positions.length} positions`);
}
```

## Acceptance criteria (when shadow-mode is "working perfectly")

1. Shadow cash matches real Bullpen cash within $1 across 7 consecutive daily snapshots
2. Shadow position list matches real Bullpen position list (same slugs+outcomes, share-counts within 1%) for 7 consecutive days
3. Every paper trade in `shadow_trades` has a corresponding signal in `trades` table (no phantom trades)
4. `shadow_trades.shadow_cash_after` equals `shadow_trades.shadow_cash_before ± amount` exactly (no math errors)
5. `assertConfigParity` still passes on every restart

When all 5 hold for 7 days, the shadow is trustworthy enough that flipping to live should produce the same trades.

## Open design questions

- **Sells when source trader exits but bullpen position is bigger than what we'd have shadow-bought:** real bot would only sell what we own; shadow should do the same. Need explicit `min(shadow.shares, signal_implied_shares)` clamp.
- **Reconciliation fails when Bullpen native copy executes a trade we didn't shadow-execute (different roster):** drift will be persistent. Solution: only reconcile against the `0x1023…` wallet portfolio that comes from OUR bot's own actions. If user runs both native + custom on same wallet, drift is unavoidable. Recommend dedicated bot wallet for clean shadow.
- **Initial sync race:** bot starts → fetches positions → 30s later a signal fires for a market the user just bought manually. Edge case, low frequency, can detect via "shadow has no record of this position but it's in Bullpen."

## Why this is the right next step before live

Today's sim says "MK20 placed 216 trades, win rate 0% (no resolutions yet)." Useless for go/no-go. Shadow says "in the past 7 days, the bot would have executed N trades with your $148 starting cash, ending at $X with Y open positions, drift vs Bullpen native $Z." That's a directly comparable number.

## Estimated work

- Schema + engine module: 2 hr
- Bot.ts wire-in (call shadow alongside sim, no behavior change): 30 min
- Reconciliation cron: 1 hr
- Dashboard view (`/performance/shadow`): 2 hr
- Tests: 1 hr

Total: ~6.5 hr. Phase the dashboard for last; backend can be useful immediately.

## Prior-art notes (consulted 2026-04-28)

- **`learnings/trading.md` 2026-04-22 — auto-paused subs still fire sells.** Shadow must process SELL signals regardless of native sub state, otherwise drift will spike whenever a sub auto-pauses (which is often). Already implicit in design since shadow runs against signals not against native sub state, but worth documenting.
- **`learnings/trading.md` 2026-04-22 — Polymarket direct API.** Independent improvement that should ship before live flip alongside shadow. Direct-API tracker source kills slug-mismatch at root (P1 in 2026-04-22 restart plan). If we ship shadow first and tracker swap second, shadow's match rates will improve when tracker swaps. Don't conflate them.
- **`learnings/security.md` 2026-04-19 — no inline secrets.** Shadow engine uses existing Bullpen CLI auth (no new secrets). Position/balance fetches go via `bullpen polymarket positions` which is already-authenticated. Do not log full position lists to Telegram or commit shadow_trades dumps to git — they reveal strategy and wallet activity.
- **`learnings/backend.md` 2026-04-19 — jarvis spine.** Considered storing shadow snapshots on jarvis-memory for cross-device access. Decision: keep in `copybot.db` for now (already on Hetzner, already backed up, lower latency). If/when we want shadow visible from phone or other devices, add a sync job `jarvis-memory store_memory` for the daily reconciliation row only — not every paper trade.
