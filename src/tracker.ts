export interface PnlResult {
  pnl: number;
  invested: number;
  returnPct: number;
  positions: Array<{
    slug: string; outcome: string; entry: number; shares: number;
    current: number; pnl: number; trader?: string;
  }>;
}

export function computePaperPnl(trades: any[], prices: Map<string, Map<string, number>>): PnlResult {
  return computePnlFromTrades(trades.filter(t => t.action === "BUY" && t.entry_price > 0), prices);
}

export function computeRealPnl(trades: any[], prices: Map<string, Map<string, number>>): PnlResult {
  return computePnlFromTrades(
    trades.filter(t => t.is_real === 1 && t.status === "success" && t.action === "BUY" && t.entry_price > 0),
    prices
  );
}

function computePnlFromTrades(buys: any[], prices: Map<string, Map<string, number>>): PnlResult {
  let totalPnl = 0, totalInvested = 0;
  const positions: PnlResult["positions"] = [];
  for (const t of buys) {
    const currentPrice = prices.get(t.slug)?.get(t.outcome) || 0.001; // No price = assume near-total loss
    const positionPnl = (currentPrice - t.entry_price) * t.paper_shares;
    totalPnl += positionPnl;
    totalInvested += t.our_amount;
    positions.push({
      slug: t.slug, outcome: t.outcome, entry: t.entry_price,
      shares: t.paper_shares, current: currentPrice, pnl: positionPnl, trader: t.trader,
    });
  }
  return {
    pnl: Math.round(totalPnl * 100) / 100,
    invested: totalInvested,
    returnPct: totalInvested > 0 ? Math.round((totalPnl / totalInvested) * 10000) / 100 : 0,
    positions,
  };
}
