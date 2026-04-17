import { BotConfig } from "./config";

export interface TradeSignal {
  traderName: string;
  traderAddress: string;
  side: "BUY" | "SELL";
  slug: string;
  outcome: string;
  price: number;
  traderAmount: number;
  timestamp: string;
}

export interface FilterState {
  marketExposure: Map<string, number>;
  dailyExposure: number;
  seenPositions: Set<string>;
  recentSignals: TradeSignal[];
  activeMarkets: Set<string>; // slug:outcome keys we already hold (across ALL traders)
  // Dynamic limits computed from total capital
  maxPerMarket: number;
  maxDailyExposure: number;
  // Per-trader EV info for smart-filter bypasses (optional)
  traderEv?: Map<string, { expectedValue: number; confidence: "low" | "medium" | "high" }>;
}

export interface FilterResult {
  pass: boolean;
  reason?: string;
}

export function shouldCopyTrade(signal: TradeSignal, config: BotConfig, state: FilterState): FilterResult {
  if (signal.side === "SELL") return { pass: true };

  const { filters, risk } = config;

  // ── Anti-noise: trader velocity filter ───────────────────────────
  // Block noisy traders — BUT exempt proven winners (high confidence + positive EV)
  // so we don't filter out 96% of signals from our best traders.
  if (filters.maxTraderSignalsPerHour > 0) {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentFromTrader = state.recentSignals.filter(
      s => s.traderAddress === signal.traderAddress &&
           new Date(s.timestamp).getTime() > oneHourAgo
    ).length;
    // Trader tiers: elite bypass entirely, proven get 3x, rest get normal limit
    const ev = state.traderEv?.get(signal.traderName);
    const isElite = ev && ev.confidence !== "low" && ev.expectedValue > 0.8;
    const isProvenWinner = ev && ev.confidence !== "low" && ev.expectedValue > 0.1;
    if (!isElite) {
      const limit = isProvenWinner ? filters.maxTraderSignalsPerHour * 3 : filters.maxTraderSignalsPerHour;
      if (recentFromTrader >= limit)
        return { pass: false, reason: `noise: ${signal.traderName} sent ${recentFromTrader} signals/hr (max ${limit}${isProvenWinner ? " boosted" : ""})` };
    }
    // Elite traders (EV > 1.0, e.g. 0x2a2c): ZERO noise filtering — every signal passes
  }

  // ── Anti-noise: cross-trader market dedup ────────────────────────
  // Don't take multiple positions on the same market from different traders.
  // BUT proven winners (med+ confidence, EV > 0.3) can stack — adding to a
  // winning sharp's position is usually +EV. Per-market cap still limits size.
  if (filters.dedupAcrossTraders) {
    const marketKey = `${signal.slug}:${signal.outcome}`;
    // Dedup applies to ALL traders — spread across different markets, don't stack
    if (state.activeMarkets.has(marketKey))
      return { pass: false, reason: `dedup: already hold position on ${signal.slug}:${signal.outcome}` };
  }

  if (signal.price < filters.minPrice)
    return { pass: false, reason: `price ${signal.price} below min ${filters.minPrice}` };
  if (signal.price > filters.maxPrice)
    return { pass: false, reason: `price ${signal.price} above max ${filters.maxPrice}` };
  if (signal.traderAmount < filters.minTraderAmount)
    return { pass: false, reason: `trader amount $${signal.traderAmount} below min $${filters.minTraderAmount}` };

  if (filters.newPositionsOnly) {
    const posKey = `${signal.traderName}:${signal.slug}:${signal.outcome}`;
    if (state.seenPositions.has(posKey))
      return { pass: false, reason: `${signal.traderName} already holds ${signal.slug}:${signal.outcome}` };
  }

  const marketKey = `${signal.slug}:${signal.outcome}`;
  const currentExposure = state.marketExposure.get(marketKey) || 0;
  if (currentExposure + risk.tradeAmountUsd > state.maxPerMarket)
    return { pass: false, reason: `market cap: $${currentExposure}/$${Math.round(state.maxPerMarket)}` };

  // Daily cap — but proven winners (medium+ confidence, EV > 0.3) bypass up to 2x the cap
  // so we don't starve the 92% WR trader's signals when bot hits daily limit early.
  const ev = state.traderEv?.get(signal.traderName);
  const isProvenWinner = ev && ev.confidence !== "low" && ev.expectedValue > 0.3;
  const effectiveDailyCap = isProvenWinner ? state.maxDailyExposure * 2 : state.maxDailyExposure;
  if (state.dailyExposure + risk.tradeAmountUsd > effectiveDailyCap)
    return { pass: false, reason: `daily cap: $${state.dailyExposure}/$${Math.round(effectiveDailyCap)}${isProvenWinner ? " (boosted)" : ""}` };

  if (filters.requireMultiWallet) {
    const windowMs = filters.multiWalletWindow * 60 * 1000;
    const cutoff = Date.now() - windowMs;
    const confirming = state.recentSignals.filter(
      s => s.slug === signal.slug && s.outcome === signal.outcome &&
           s.traderAddress !== signal.traderAddress &&
           new Date(s.timestamp).getTime() > cutoff
    );
    if (confirming.length === 0)
      return { pass: false, reason: `multi-wallet: no confirmation for ${signal.slug}:${signal.outcome}` };
  }

  return { pass: true };
}
