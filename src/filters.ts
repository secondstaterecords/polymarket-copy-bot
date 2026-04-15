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
}

export interface FilterResult {
  pass: boolean;
  reason?: string;
}

export function shouldCopyTrade(signal: TradeSignal, config: BotConfig, state: FilterState): FilterResult {
  if (signal.side === "SELL") return { pass: true };

  const { filters, risk } = config;

  // ── Anti-noise: trader velocity filter ───────────────────────────
  // If a trader is sending too many signals per hour, they're algorithmic noise
  if (filters.maxTraderSignalsPerHour > 0) {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentFromTrader = state.recentSignals.filter(
      s => s.traderAddress === signal.traderAddress &&
           new Date(s.timestamp).getTime() > oneHourAgo
    ).length;
    if (recentFromTrader >= filters.maxTraderSignalsPerHour)
      return { pass: false, reason: `noise: ${signal.traderName} sent ${recentFromTrader} signals/hr (max ${filters.maxTraderSignalsPerHour})` };
  }

  // ── Anti-noise: cross-trader market dedup ────────────────────────
  // Don't take multiple positions on the same market from different traders
  if (filters.dedupAcrossTraders) {
    const marketKey = `${signal.slug}:${signal.outcome}`;
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

  if (state.dailyExposure + risk.tradeAmountUsd > state.maxDailyExposure)
    return { pass: false, reason: `daily cap: $${state.dailyExposure}/$${Math.round(state.maxDailyExposure)}` };

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
