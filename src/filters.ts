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
}

export interface FilterResult {
  pass: boolean;
  reason?: string;
}

export function shouldCopyTrade(signal: TradeSignal, config: BotConfig, state: FilterState): FilterResult {
  if (signal.side === "SELL") return { pass: true };

  const { filters, risk } = config;

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
  if (currentExposure + risk.tradeAmountUsd > risk.maxPerMarket)
    return { pass: false, reason: `market cap: ${marketKey} at $${currentExposure}/$${risk.maxPerMarket}` };

  if (state.dailyExposure + risk.tradeAmountUsd > risk.maxDailyExposure)
    return { pass: false, reason: `daily cap: $${state.dailyExposure}/$${risk.maxDailyExposure}` };

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
