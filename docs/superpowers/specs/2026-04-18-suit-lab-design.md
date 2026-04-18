# Coattail Suit Lab — Design Spec

**Date:** 2026-04-18
**Author:** Max + Claude
**Status:** Draft → pending approval

---

## 1. Overview

The Suit Lab is an iteration tracking and comparison system for the Coattail copy-trading bot. Each meaningful change to the bot's behavior is tracked as a numbered "MK" version (like Iron Man suits). All versions are simultaneously paper-traded against incoming signals, and their performance is compared across 20+ metrics computed from real resolution data.

**Goals:**
- Compare every iteration's performance on the same data so you can see exactly which changes made things better or worse
- Paper-trade all versions simultaneously going forward so new data continuously enriches comparisons
- Present the evolution story to subscribers and visitors as social proof
- Make every displayed number verifiable — no hardcoded data, everything computed from the database

**Non-goals:**
- Full 3D WebGL models (too heavy, no actual models to display, kills mobile)
- Real-money trading on multiple versions simultaneously (only the deployed version trades real money)

---

## 2. Version Catalog

Every meaningful bot behavior change gets an MK number. Derived from the 56-commit git history:

| MK | Codename | Commit | Date | Key Changes |
|----|----------|--------|------|-------------|
| MK1 | Genesis | 3b3a2b7 | Apr 9 | Paper trading, basic dashboard, no filters |
| MK2 | Foundation | c0c1e79 | Apr 10 | V2 architecture — executor, config, filters, db, tracker modules |
| MK3 | Tracker | cae8821 | Apr 10 | Tracker-based detection (Sharbel approach), expand to 15 traders |
| MK4 | Sentinel | 679d659 | Apr 10 | Telegram alerts for trades and P&L summaries |
| MK5 | Guardian | 0f420bb | Apr 15 | Loss-based pause, both-sides limit, daily cap. First risk controls |
| MK6 | Shield | d3aa599 | Apr 15 | Balance check before real trades, prevent failed trade spam |
| MK7 | Cashflow | 192c276 | Apr 15 | Telegram alert when cash balance recovers, trading resumes |
| MK8 | Watchdog | 58b222d | Apr 16 | Detect Bullpen auth expiry and alert via Telegram |
| MK9 | Oracle | 0e1be38 | Apr 16 | Resolution tracking, per-trader stats, adaptive sizing, expanded alerts |
| MK10 | Expansion | dbd686e | Apr 16 | Expand from 15 to 22 traders, top-30 leaderboard picks |
| MK11 | Vanguard | 55bd9a1 | Apr 16 | Exempt proven winners from noise filter, CLV tracking, safer sizing |
| MK12 | Uncapped | 263c1a3 | Apr 16 | Daily cap 40%→75%, 2x bypass for proven winners |
| MK13 | Stacker | 96be751 | Apr 16 | Let proven winners stack into existing positions |
| MK14 | Elite | 82b3534 | Apr 17 | Elite tier — 3x sizing + zero noise filter for 92%+ traders |
| MK15 | Splitfire | ceaa2b6 | Apr 17 | Split-buy: 3x multiplier = 3 separate $5 buys |
| MK16 | Spread | 1bd2a2f | Apr 17 | Revert split-buy, spread across markets instead of stacking |
| MK17 | Sovereign | 78c7b97 | Apr 17 | sovereign2013 joins elite tier — noise filter removed for both top wallets |
| MK18 | Clockwork | 2814494 | Apr 18 | Circuit breaker resets at 4 AM ET instead of midnight UTC |

**Status labels:** RETIRED (no longer deployed), DEPLOYED (currently live), TESTING (paper-trading for evaluation), CONCEPT (not yet implemented).

Only MK18 is currently DEPLOYED (it includes all prior changes). All others are RETIRED. Future versions start as TESTING.

**Note on legacy tags:** The git repo has tags `mk1-initial` through `mk11-daily-cap-bypass` from the original backtester. The new MK1-MK18 numbering above supersedes those — it includes every meaningful commit, not just the ones that were tagged. The backtester's `VERSIONS` config will be updated to match the new numbering.

**Infrastructure-only versions:** MK4 (Telegram alerts), MK7 (cash recovery alerts), and MK8 (auth expiry detection) don't change filter/sizing logic — they add monitoring. Their backtester configs are identical to the previous version. They still appear in the timeline and suit grid (they represent real iterations) but their metrics will match their predecessor. The comparison view highlights this: "Same trading logic as MK3, added Telegram monitoring."

### Version Config Schema

Each MK version is defined by a `VersionConfig` object capturing every tunable parameter:

```typescript
interface VersionConfig {
  mk: number;                          // MK number
  codename: string;                    // Human name
  commit: string;                      // Git commit hash
  date: string;                        // ISO date
  hypothesis: string;                  // What we expected this change to do
  description: string;                 // What actually changed
  status: "retired" | "deployed" | "testing" | "concept";

  // Filter params
  tradeAmountUsd: number;
  maxPerMarketPct: number;
  maxDailyExposurePct: number;
  maxSignalsPerHour: number;
  bypassNoiseForProvenWinners: boolean;
  bypassDailyCapForProvenWinners: boolean;
  adaptiveSizing: boolean;
  dedupAcrossTraders: boolean;
  minPrice: number;
  maxPrice: number;
  minTraderAmount: number;
  maxDrawdownPct: number;
  eliteTierEnabled: boolean;
  eliteTraders: string[];              // Trader names that bypass all noise
  splitBuyEnabled: boolean;
  provenWinnerStacking: boolean;

  // Trader list snapshot
  trackedTraderCount: number;
}
```

---

## 3. Architecture

### 3.1 Multi-Sim Engine

Runs inside the existing bot process (`src/bot.ts`). On every incoming signal:

1. The **real executor** evaluates the signal against the DEPLOYED version's config and executes (or skips) as normal. Zero changes to the live trading path.
2. The **sim engine** evaluates the same signal against ALL other version configs and logs the result to a new `sim_results` table. Each version maintains a virtual portfolio (virtual cash, virtual positions).

This is purely additive — the sim engine is a read-only observer of signals that the bot already processes. It adds ~5-10ms of computation per signal (running ~18 sets of if-statements). The bot processes signals every ~30 seconds, so this is negligible.

### 3.2 New Database Tables

```sql
-- Version definitions
CREATE TABLE version_configs (
  mk INTEGER PRIMARY KEY,
  codename TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  date TEXT NOT NULL,
  hypothesis TEXT,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'retired',
  config_json TEXT NOT NULL  -- Full VersionConfig serialized
);

-- Per-signal, per-version simulation result
CREATE TABLE sim_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id INTEGER NOT NULL,         -- FK to trades.id (the original signal)
  mk INTEGER NOT NULL,                -- Which version
  decision TEXT NOT NULL,             -- 'trade' | 'skip'
  skip_reason TEXT,                   -- Why it was skipped (if skipped)
  sim_amount REAL,                    -- How much this version would bet
  sim_shares REAL,                    -- Shares acquired at entry_price
  created_at TEXT NOT NULL,
  UNIQUE(signal_id, mk)
);
CREATE INDEX idx_sim_results_mk ON sim_results(mk);

-- Per-version virtual portfolio snapshots (updated on each signal)
CREATE TABLE sim_portfolios (
  mk INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  cash REAL NOT NULL,
  positions_value REAL NOT NULL,
  total_equity REAL NOT NULL,
  open_positions INTEGER NOT NULL,
  PRIMARY KEY (mk, timestamp)
);

-- Computed metrics per version (recomputed hourly)
CREATE TABLE sim_metrics (
  mk INTEGER NOT NULL,
  computed_at TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value REAL NOT NULL,
  sample_size INTEGER,                -- How many data points this is based on
  confidence TEXT,                    -- 'low' (<10), 'medium' (10-30), 'high' (30+)
  PRIMARY KEY (mk, metric_name)
);
```

### 3.3 Metrics Computation

A metrics computer runs hourly (cron or setTimeout in the bot process). For each version, it queries `sim_results` joined with `resolutions` to compute all metrics. Results go into `sim_metrics`.

### 3.4 API Endpoints

Added to the existing dashboard server (`src/dashboard.ts`):

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/lab/versions` | Internal | All versions with configs |
| `GET /api/lab/metrics/:mk` | Internal | Full metrics for one version |
| `GET /api/lab/compare?mks=1,6,11,17` | Internal | Side-by-side comparison |
| `GET /api/lab/live-sim` | Internal | Latest signal with per-version decisions |
| `GET /api/lab/traders/:mk` | Internal | Per-trader breakdown for a version |
| `GET /api/lab/categories/:mk` | Internal | Category alpha for a version |
| `GET /api/lab/timeline` | Internal | Version evolution with deltas |
| `GET /api/public/performance` | Public | Curated metrics for marketing |
| `GET /api/public/evolution` | Public | Version count, improvement arc |
| `GET /api/subscriber/performance` | Subscriber | Anonymized trader stats, category data |
| `GET /api/subscriber/versions` | Subscriber | Version history with aggregate metrics |

**Auth:** Internal endpoints require a session cookie or API key (just you). Subscriber endpoints check Stripe subscription status. Public endpoints are open.

---

## 4. Metrics — Full List

Every metric is computed from database data. No hardcoded values. Each metric stores its sample size and confidence level.

### Tier 1 — Headlines (shown on suit cards)

| Metric | Formula | Why It Matters |
|--------|---------|----------------|
| **Win Rate** | wins / resolved_trades | Most intuitive performance measure |
| **Net PnL** | sum(payouts) - sum(bets) | Bottom line: did this version make money? |
| **Profit Factor** | gross_profit / gross_loss | >1 = profitable. >1.5 = healthy. |
| **Sharpe Ratio** | mean(daily_returns) / stdev(daily_returns) * sqrt(365) | Risk-adjusted return — the gold standard |

### Tier 2 — Decision Makers (shown in comparison view)

| Metric | Formula | Why It Matters |
|--------|---------|----------------|
| **Brier Score** | mean((forecast_prob - outcome)^2) | Calibration quality. THE prediction market metric. Lower = better. |
| **Time-Weighted ROI** | sum(pnl_per_trade / days_held) annualized | Accounts for capital lockup time. 10% in 2 days >>> 10% in 2 months. |
| **Max Drawdown** | max peak-to-trough in equity curve | Worst-case pain. Also track duration (hours underwater). |
| **Avg Return/Trade** | net_pnl / trades_placed | Expected value per $5 bet. The per-trade edge. |
| **Signal-to-Trade Ratio** | trades_placed / signals_seen | How selective the version is. Lower = pickier. |
| **Sortino Ratio** | mean(returns) / stdev(negative_returns) * sqrt(365) | Like Sharpe but only penalizes downside. Higher = less painful losses. |
| **Kelly Fraction** | (p * b - q) / b where p=WR, b=avg_odds, q=1-p | Optimal bet sizing. Compares to actual bet size to see if over/under-betting. |
| **Tail Ratio** | 95th_pctl_gain / abs(5th_pctl_loss) | Win/loss asymmetry. >1 = wins bigger than losses. |

### Tier 3 — Deep Analysis (expanded detail per version)

| Metric | What It Shows |
|--------|---------------|
| **Per-Trader Win Rate** | Which traders profitable under which version |
| **Per-Trader PnL** | Dollar profit/loss per copied wallet |
| **Per-Trader Sharpe** | Risk-adjusted return per wallet |
| **Category Alpha** | Win rate and PnL by market type (MLB, EPL, NHL, NBA, Tennis, Esports, Crypto, Politics) |
| **Leader Correlation** | Avg pairwise correlation between copied traders' returns. <0.5 = well diversified |
| **Entry Timing Score** | Our entry price vs market VWAP. Measures if we're early or late |
| **Avg Slippage** | Price diff between leader's fill and ours in basis points |
| **Signal Latency** | Avg seconds from leader trade detection to our evaluation |
| **Edge Decay Rate** | ROI trend over rolling 7-day windows. Negative = edge shrinking |
| **Herfindahl Concentration (HHI)** | Sum of squared position weights. <0.15 safe, >0.25 dangerous |
| **Stale Signal Rate** | % of trades where market price moved >2% before execution |
| **Binary Loss Exposure** | Total capital in unresolved markets that goes to $0 on loss |
| **Correlated Resolution Risk** | Probability multiple positions resolve against us simultaneously |

### Data Integrity Rules

- Every displayed number links to its formula and sample size
- Metrics with <10 resolved trades show a "LOW CONFIDENCE" warning badge
- Metrics with <30 resolved trades show "MEDIUM CONFIDENCE"
- A "Verify" function re-runs the backtester and confirms displayed values match
- Sparklines and equity curves are computed from `sim_portfolios` snapshots, not interpolated
- The backtester is the source of truth for historical data; the live sim is the source for forward data

---

## 5. Frontend — Three Views

Built into the existing Next.js landing page (`landing/`). New route: `/performance`.

### 5.1 Design System

Extends the existing "Underground Quant" aesthetic:
- **Background:** #07080c (near-black)
- **Primary accent:** #00ffc8 (cyan) for positive values and highlights
- **Gold accent:** #ffd700 for the deployed/best version
- **Red:** #ff4455 for negative values and retired badges
- **Blue:** #00a3ff for testing/concept badges
- **Fonts:** JetBrains Mono (data), Fraunces (headings) — already in the landing page
- **Cards:** Glassmorphism — `backdrop-filter: blur(12px)`, subtle border glow, rgba backgrounds

### 5.2 Visual Effects (CSS 3D, no WebGL)

The "Iron Man hall of armor" effect using pure CSS + Framer Motion:

- **Suit cards** use `perspective: 1000px` and `transform: rotateY(2deg)` on the grid container, creating depth
- **Hover effect:** Cards lift with `translateZ(20px)` and glow border intensifies
- **Glass case look:** `backdrop-filter: blur(12px)` + `background: rgba(12, 14, 22, 0.7)` + subtle `box-shadow: inset 0 0 30px rgba(0, 255, 200, 0.03)`
- **Scroll animation:** Cards stagger-enter from below using Framer Motion's `staggerChildren`
- **Particle canvas:** Ambient floating data points behind the grid (50 lines of canvas code, no deps)
- **Sparkline equity curves:** Inline SVG, animated path drawing on card enter
- **Active version pulse:** The deployed card has a subtle breathing glow animation on its border

No Three.js. No React Three Fiber. No heavy dependencies. Total added bundle: <15KB.

### 5.3 Route Structure

```
/performance
  ├── Public section (top) — marketing showcase, visible to all
  ├── Subscriber section (middle) — gated by Stripe subscription check
  └── Internal section (bottom) — gated by admin auth (just Max)
```

All three sections live on the same page. Public content always visible. Subscriber and internal sections show a "Subscribe for full analytics" / "Admin login" gate respectively.

### 5.4 Public View

What visitors see:

- **Hero stat row:** Version count (18), Win Rate Improvement (+52%), Markets Resolved (229+), Sharpe Ratio
- **Evolution sparkline:** Win rate over versions, upward trend
- **Narrative text:** "Engineered to improve. 18 iterations. Every change measured against 107,000+ historical signals."
- **3 highlight cards:** Best version stats, biggest single improvement, most resolved markets
- **CTA button:** "Subscribe for full analytics →"

What is NOT shown: filter configs, trader names, version-specific logic, anything that reveals the strategy.

### 5.5 Subscriber View

What paying customers see (after Stripe subscription check):

- **System health dashboard:** Current version, uptime, trades today, active positions
- **Anonymized trader leaderboard:** WALLET-A through WALLET-F with win rate, confidence badge, specialty categories, resolved trade count
- **Version history timeline:** Shows MK1 → MK18 with aggregate improvement metrics per version. Shows the arc of improvement. No filter configs.
- **Category performance:** Win rate and edge rating by market type (MLB, EPL, NHL, etc.)
- **Per-version comparison (limited):** Win rate, PnL, Sharpe across versions. No filter parameters shown.

What is NOT shown: exact filter configs, noise thresholds, daily cap percentages, elite tier logic, trader wallet addresses.

### 5.6 Internal View (Suit Lab)

What you see (admin-only):

**Tab: Suit Grid**
- All 18+ MK cards in a grid with glassmorphism + CSS 3D depth
- Each card shows: MK number, codename, status badge, date, description, sparkline equity curve, Tier 1 metrics (WR, PnL, PF, Sharpe)
- Click to expand into full Tier 2 + Tier 3 metrics
- Change tags on each card showing what differs from the previous version

**Tab: Compare**
- Select 2-4 versions for side-by-side comparison
- Full metrics table with delta columns (MK11 vs MK1: +22pts WR, etc.)
- Overlaid equity curves
- Per-trader heatmap showing how each trader performs under each version

**Tab: Traders**
- Per-trader performance across all versions
- Trend arrows showing if a trader is improving or declining
- Status badges: ELITE, TRACKED, NOISY, DECLINING
- Category breakdown per trader

**Tab: Categories**
- Category alpha table: which market types are profitable under which versions
- Identify where to focus (MLB strong) and where to avoid (Crypto negative)

**Tab: Timeline**
- Chronological evolution log with hypothesis, commit, date, impact tags
- Visual timeline with dots (retired=gray, active=gold, concept=dashed blue)

**Tab: Live Sim**
- Real-time feed of incoming signals
- Each signal shows how every version would handle it
- Decision column: TRADE (green) or SKIP (red) with reason
- Running virtual PnL per version
- Insight engine: auto-generated text explaining divergences ("MK12 would take this but MK17 skips due to circuit breaker")

---

## 6. Backfill Strategy

### 6.1 Historical Data (107K signals)

The existing backtester replays all signals through version configs. To populate `sim_results`:

1. Define `VersionConfig` for all 18 MK versions (5 exist already, 13 need to be added based on git history)
2. Run the backtester once per version against the full signal database
3. Store results in `sim_results` table
4. Compute equity curves for `sim_portfolios` by replaying in chronological order
5. Run metrics computer to populate `sim_metrics`

This is a one-time backfill that takes ~30 seconds for all versions.

### 6.2 Forward Data (Live Multi-Sim)

After backfill, every new incoming signal is evaluated against all version configs in real-time. The sim engine runs in the bot's signal processing loop after the real executor.

### 6.3 Adding New Versions

To test a new idea:
1. Define the `VersionConfig` with a hypothesis
2. Insert into `version_configs` with status "testing"
3. The sim engine automatically starts evaluating it on all future signals
4. Optionally run the backtester to get historical comparison
5. After enough data, promote to "deployed" or mark "retired"

---

## 7. Data Flow Summary

```
Polymarket CLOB
      │
      ▼
  Bullpen CLI (poll every 30s)
      │
      ▼
  Signal Detected (trader, market, price, amount)
      │
      ├──▶ Real Executor (DEPLOYED version only)
      │         │
      │         ▼
      │    Execute trade / Skip / Paper
      │
      └──▶ Sim Engine (ALL versions)
                │
                ▼
           sim_results table (per-version decision)
           sim_portfolios table (equity snapshots)
                │
                ▼
           Metrics Computer (hourly)
                │
                ▼
           sim_metrics table
                │
                ├──▶ /api/lab/* (internal)
                ├──▶ /api/subscriber/* (anonymized)
                └──▶ /api/public/* (curated)
                          │
                          ▼
                    coattail.me/performance
                    (public + subscriber + internal views)
```

---

## 8. Implementation Notes

### 8.1 Bot Changes (`src/bot.ts`)
- Add sim engine as a function called after the real executor on each signal
- The sim engine maintains in-memory virtual portfolios per version (persisted to DB periodically)
- No changes to the real trading path

### 8.2 Dashboard Changes (`src/dashboard.ts`)
- Add new API endpoints for lab data
- Add public/subscriber/internal auth checks

### 8.3 Landing Page Changes (`landing/`)
- New `/performance` route
- Framer Motion for card animations
- Canvas particle background
- CSS 3D transforms for glassmorphism suit cards
- Fetch data from dashboard API endpoints (or from static JSON for public data on Netlify)

### 8.4 Static vs Dynamic Data on Netlify
The landing page is a static Next.js export on Netlify. It can't call the Hetzner API at build time (or can it?). Options:
- **Option A:** Build step fetches from Hetzner API, bakes into static JSON. Rebuild triggered by cron or webhook after metrics recompute. Simple.
- **Option B:** Client-side fetch from Hetzner API (CORS configured). Live data but depends on Hetzner being up.
- **Option C:** Netlify serverless function proxies to Hetzner API. Best of both.

Recommend **Option A for public/subscriber views** (rebuild daily) and **Option B for internal Suit Lab** (live data matters).

### 8.5 Subscriber Auth
- Stripe webhook sets a cookie or JWT on payment
- `/performance` page checks for valid subscription before rendering subscriber section
- For v1: manual. Customer emails Max, Max adds their email to an allowlist. Stripe webhook + proper auth comes later.

---

## 9. Open Questions

- Should the subscriber view include an email digest (weekly recap of performance metrics)?
- Should the internal Suit Lab be a separate route (`/lab`) or a section of `/performance`?
- How often should metrics recompute? Hourly is the default but could be more/less frequent.
- Should we expose a "Create New Version" UI in the Suit Lab, or is editing the config file + restarting sufficient?
