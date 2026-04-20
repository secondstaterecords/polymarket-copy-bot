# Comparison UI — design spec for /performance/compare

## Why

The existing `/performance` page buries the MK comparison in a single table at the bottom. You can't actually *compare* versions — just scroll and squint.

Goal: a dedicated `/performance/compare` view where anyone (you, subscribers, internal) can pick 2-5 MK versions and see them rendered side-by-side with charts, radar plots, and a diff view that calls out which strategy change moved which metric.

## Inspiration / references to steal from

| Source | What to steal |
|--------|---------------|
| **Vercel Analytics** | "Compare to previous period" top-bar with live-updating delta pills in each metric card |
| **Linear Insights** | Radar chart for version profile (WR, Sharpe, Brier, max DD — 5-axis) |
| **PostHog feature-flag comparison** | A/B result panel with confidence intervals, not just point estimates |
| **TradingView strategy tester** | Equity-curve overlay with multiple versions drawn on one chart |
| **Stripe Sigma dashboards** | Horizontal diff table with highlighted winning cells (green) and losing cells (red) |
| **Rally (rally.fyi)** | Storybook-style navigation between versions with keyboard arrows |
| **Retool dashboards** | Draggable KPI tiles, save layouts as views |

## Stack

- **Charts**: Tremor (`@tremor/react`) — purpose-built for analytics dashboards. `<AreaChart>`, `<BarChart>`, `<DonutChart>` out of the box, styled to match.
- **Primitives**: shadcn/ui — already in the landing page. `<Select>`, `<Tabs>`, `<HoverCard>` for diff tooltips.
- **Radar/multi-axis**: Recharts `<RadarChart>` (Tremor doesn't have this; Recharts does).
- **Animations**: Framer Motion (already installed).

Install once: `npm i @tremor/react recharts`

## Page structure — `/performance/compare`

```
┌────────────────────────────────────────────────────────────┐
│  [ MK 13 Stacker ] [ MK 18 Clockwork ] [ MK 19 Priority ]  │   ← version picker pills (up to 5)
│  [+ Add version ▾]    [ Sample size filter: ≥20 ▼ ]        │
├────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌──── KPI row ────────────────────────────────────┐        │
│   │  WR       Net PnL    Sharpe     Brier    Max DD │        │
│   │  57%      +$8.80     6.34       0.28     4.1%   │  MK13  │
│   │  57%      +$8.80     6.34       0.28     4.1%   │  MK18  │   ← winner cells highlighted
│   │  67% ↑    +$11.30 ↑  9.38 ↑     0.22 ↑   3.2% ↑ │  MK19  │
│   └─────────────────────────────────────────────────┘        │
│                                                              │
│   ┌──── Equity curve (Tremor AreaChart) ──────┐              │
│   │    overlays MK13 / MK18 / MK19            │              │
│   └────────────────────────────────────────────┘             │
│                                                              │
│   ┌──── Profile radar (Recharts RadarChart) ─┐               │
│   │   5 axes: WR, PnL, Sharpe, Brier-inv,    │               │
│   │   Profit-factor                          │               │
│   └──────────────────────────────────────────┘               │
│                                                              │
│   ┌──── Diff table (full metrics, collapsed) ┐               │
│   │   trades_placed, signal_to_trade_ratio,  │               │
│   │   sortino, tail_ratio, category WRs      │               │
│   └──────────────────────────────────────────┘               │
│                                                              │
│   ┌──── Config diff ──────────────────────────┐              │
│   │ + MK19 enabled: priority_queue            │              │
│   │ ~ MK19 tradeAmountUsd: 5 → 3              │              │
│   │ - MK19 removed: elite_tier_3x_multiplier  │              │
│   └──────────────────────────────────────────┘               │
└────────────────────────────────────────────────────────────┘
```

## Key interactions

- **URL-driven state**: `/performance/compare?v=13,18,19` — copy/paste = share view.
- **Sample-size gating**: versions with <20 resolutions show `(n=7, insufficient)` badge and their metrics are greyed. Bold + full color only for statistically meaningful rows.
- **Delta pills**: each metric on a "later" version shows `↑ +10pp` or `↓ -2pp` relative to the first selected version.
- **Hover a metric** → tooltip shows the raw sample (e.g. "57% = 4 wins / 7 resolved in MK13 window").
- **"Significance" badge**: if two versions have overlapping CIs (computed from sample size), show "NOT STATISTICALLY SIGNIFICANT" badge on the delta.

## Data source

Already in `sim_metrics`. Query shape for `/api/lab/compare?mks=13,18,19`:

```ts
type CompareResponse = {
  mks: number[];
  metrics: Record<string, Array<{ mk: number; value: number; sampleSize: number; confidence: "high"|"medium"|"low" }>>;
  configDiff: Array<{ mk: number; added: string[]; removed: string[]; changed: Record<string,[any,any]> }>;
};
```

New endpoint needed in `src/dashboard.ts` — 1 day of backend work.

## Honesty rules (carry over from main page)

- Never show a metric without its sample size.
- Never color a delta green/red if `sampleSize < 20` — use grey.
- Never show a "confidence: low" metric in the KPI hero row — move to the collapsed diff table.
- Include a "Last backfilled: {timestamp}" footer so users know the data isn't real-time (sim resolutions lag market closes by hours).

## Build order

1. Backend: `/api/lab/compare` endpoint (2-3 hr)
2. Install Tremor + Recharts, copy shadcn primitives we don't have (1 hr)
3. Version picker + KPI row + delta pills (2 hr)
4. Equity curve overlay (2 hr)
5. Radar chart (1 hr)
6. Config diff from `version_configs` table (1 hr)
7. Polish, responsive, URL state, share links (2 hr)

**Total: ~12-14 hr of focused work.** Plan for a full Saturday, not a Friday-night hack.

## Skills / tutorials to pull from

- [Tremor dashboard kit](https://tremor.so/docs) — free tier covers everything we need
- [shadcn/ui charts](https://www.shadcn.io/charts) — 53 pre-built chart components in shadcn style
- [Linear Insights deep-dive](https://linear.app/blog/insights) — how they designed their comparison views
- [PostHog comparison pattern](https://posthog.com/tutorials/dashboard) — A/B result confidence intervals
- The existing `agent-workflow-designer` and `observability-designer` skills in your Claude Code — both have relevant sub-patterns for KPI dashboards.

## What NOT to build (yet)

- ML-driven "auto-explain which config change caused the metric delta" — too early, too little data
- Real-time WebSocket updates — re-render on page focus is fine
- Export to PDF/PNG — subscribers can screenshot
- User-saved custom views — not worth until we have >20 subscribers
