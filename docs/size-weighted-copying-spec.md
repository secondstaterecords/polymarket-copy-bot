# Size-weighted copying — design note

## Problem

Current bot copies every signal at flat $5 regardless of the trader's own conviction. But position size is the single best signal of conviction:

```
Trader        avg bet   max bet    trades 7d    profile
mhh29         $88K      $367K      87           whale, big swings
0x4924        $96K      $340K      22           low-freq, high-conviction
0x2a2c        $3.8K     $249K      2052         active, occasional big bets
texaskid      $2.9K     $250K      479          mix of sizes
elkmonkey     $189      $72K       13,211       spray-and-pray — most bets tiny
swisstony     $198      $100K      16,851       extreme spray
```

At $5/trade we currently mirror every spray from elkmonkey/swisstony. That's ~30,000+ low-conviction signals per week of which 99% are noise. The real alpha — when 0x2a2c goes 50x his avg bet — gets lost in the flood.

## Defense against decoy manipulation

A trader trying to confuse copiers doesn't put serious money on the decoy. They'll spread small positions to poison the copy signal. Size-weighting naturally immunizes:
- Decoy bets at $200 (small % of their avg) → we skip
- Real conviction at $50K (10x their avg) → we fire big

## Design

### Tracking (already done ✅)
- `trades.trader_amount` logs per-signal position size
- Need derived stat: `trader_stats.p75_amount`, `p90_amount` (computed rolling 30d)

### Scoring (new)
```ts
function conviction(trader: string, amount: number): "skip" | "normal" | "high" | "max" {
  const p = getPercentileRank(trader, amount);  // 0..1 vs trader's 30d distribution
  if (p < 0.5) return "skip";        // below their median = spray/decoy
  if (p < 0.75) return "normal";     // ordinary conviction
  if (p < 0.95) return "high";       // top quartile
  return "max";                       // top 5% — this is the one
}
```

### Bet sizing (new)
```
conviction    our_bet    # of signals that hit this tier per day
skip          $0         ~80%  (dropped)
normal        $3         ~15%  (base size, current default)
high          $6         ~4%
max           $12        ~1%   (but these are the highest-EV trades)
```

Base exposure **drops** (fewer trades taken) but concentrated where it matters. Expected outcome: fewer trades, higher per-trade EV, smaller daily exposure.

### Edge cases
- **New trader (<30d history)**: no distribution yet → treat as "normal" for first 30 signals, then re-evaluate.
- **Sniper tier (<100 lifetime trades)**: distribution meaningless with so few samples. Skip the filter, use flat $5.
- **Trader changes strategy** (e.g. suddenly 10x their avg on every bet): percentile stays valid, just biases toward "high" tier which is OK.

### Instrumentation
Before shipping, log `conviction_tier` per signal for 2 weeks in paper mode (sim engine can back-test this). Only promote to live after confirming it improves Sharpe on sim_results.

## Implementation plan (when ready)

1. Add `computeAmountPercentile(trader, amount)` to `trader-stats.ts` — pulls 30d trade history, computes percentile rank.
2. Add `p75_amount`, `p90_amount` columns to `trader_stats` table (migration).
3. Backfill from existing `trades` rows.
4. Add `conviction` filter as option in `filters.ts` (default off).
5. Wire to bet sizing in `bot.ts:handleBuy` — map tier → $ multiplier.
6. New MK version (MK20 "Conviction") enabled in sim engine for 2 weeks.
7. Compare MK19 vs MK20 in `/performance/compare` once samples accumulate.

## Not doing tonight

This is a week-long instrumentation project, not an evening hack. Shipping this before the mirror-sell bug fix would be rearranging deck chairs.

**Order of operations:**
1. Fix mirror-sell match (unblocks real edge capture)
2. Ship trader-refresh auto-update (✅ done tonight)
3. Run 1 week on trimmed roster + native Bullpen copy
4. Instrument conviction tier in sim engine (MK20)
5. Observe 2 weeks of sim data
6. If MK20 Sharpe > MK19 Sharpe on n≥30 resolved, go live

Until then: size-weighting is a good *idea* we're not ready to execute on yet.
