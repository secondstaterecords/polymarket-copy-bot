// Telegram alert integration — trade notifications, P&L summaries, daily games digest
// Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables to enable

const TELEGRAM_API = "https://api.telegram.org/bot";

let token = process.env.TELEGRAM_BOT_TOKEN || "";
let chatId = process.env.TELEGRAM_CHAT_ID || "";

export function telegramEnabled(): boolean {
  return !!(token && chatId);
}

export async function sendTelegram(message: string): Promise<void> {
  if (!token || !chatId) return;

  try {
    const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.error(`[TG] ${res.status}: ${await res.text()}`);
    }
  } catch (err: any) {
    console.error(`[TG] Error: ${err.message}`);
  }
}

export async function alertTrade(
  action: string,
  trader: string,
  slug: string,
  outcome: string,
  price: number,
  amount: number,
  status: string,
): Promise<void> {
  const emoji = action === "BUY" ? "🟢" : action === "SELL" ? "🔴" : "⚡";
  await sendTelegram(
    `${emoji} *${action}* — ${status}\n` +
    `Trader: \`${trader}\`\n` +
    `${slug} → *${outcome}*\n` +
    `Price: ${price.toFixed(2)}¢ | $${amount.toFixed(2)}`
  );
}

export async function alertPnl(
  paperPnl: number,
  paperReturn: number,
  realPnl: number,
  realReturn: number,
  totalTrades: number,
  cash: number,
  portfolioValue: number,
): Promise<void> {
  const emoji = realPnl >= 0 ? "📈" : "📉";
  await sendTelegram(
    `${emoji} *Portfolio Update*\n` +
    `Value: *$${portfolioValue.toFixed(2)}*\n` +
    `P&L: ${realPnl >= 0 ? "+" : ""}$${realPnl.toFixed(2)} (${realReturn.toFixed(1)}%)\n` +
    `Cash: $${cash.toFixed(2)} | Trades: ${totalTrades}`
  );
}

// ── Daily games digest ──────────────────────────────────────────────
interface GamePosition {
  slug: string; outcome: string; market?: string; entry: number;
  current: number; pnl: number; endDate?: string; value?: number;
  invested?: number;
}

// League detection + typical start times (ET) + streaming
const LEAGUES: Record<string, { emoji: string; time: string; stream: boolean }> = {
  nba: { emoji: "🏀", time: "7-10:30 PM", stream: true },
  nhl: { emoji: "🏒", time: "7-10 PM", stream: true },
  mlb: { emoji: "⚾", time: "1-10 PM", stream: true },
  nfl: { emoji: "🏈", time: "1-8:30 PM", stream: true },
  ucl: { emoji: "⚽", time: "3 PM", stream: true },
  epl: { emoji: "⚽", time: "7:30-3 PM", stream: true },
  mls: { emoji: "⚽", time: "7:30 PM", stream: true },
  lol: { emoji: "🎮", time: "varies", stream: false },
  atp: { emoji: "🎾", time: "varies", stream: false },
  lib: { emoji: "⚽", time: "6-9 PM", stream: true },
};

function getLeague(slug: string): string {
  const first = slug.split("-")[0];
  return LEAGUES[first] ? first : "other";
}

// Sort order: UCL/soccer afternoon → NBA/NHL evening → MLB flexible → other
const LEAGUE_ORDER: Record<string, number> = {
  ucl: 1, epl: 2, lib: 3, mls: 4, mlb: 5, nba: 6, nhl: 7, nfl: 8, atp: 9, lol: 10, other: 11,
};

export async function alertDailyGames(positions: GamePosition[]): Promise<void> {
  if (positions.length === 0) return;

  const today = new Date().toISOString().split("T")[0];
  const todayGames = positions.filter(p => {
    const ed = p.endDate || "";
    return ed === today || (p.slug && p.slug.includes(today));
  });

  if (todayGames.length === 0) return;

  // Sort chronologically by league time, then by value at stake
  todayGames.sort((a, b) => {
    const la = LEAGUE_ORDER[getLeague(a.slug)] || 11;
    const lb = LEAGUE_ORDER[getLeague(b.slug)] || 11;
    if (la !== lb) return la - lb;
    return Math.abs(b.value || 0) - Math.abs(a.value || 0);
  });

  // Group by league
  const groups: Record<string, GamePosition[]> = {};
  for (const g of todayGames) {
    const league = getLeague(g.slug);
    if (!groups[league]) groups[league] = [];
    groups[league].push(g);
  }

  let msg = `🏟️ *Games to Watch Today*\n`;
  const totalValue = todayGames.reduce((s, g) => s + (g.value || 0), 0);
  msg += `${todayGames.length} positions | $${totalValue.toFixed(0)} at stake\n\n`;

  for (const [league, games] of Object.entries(groups).sort(
    (a, b) => (LEAGUE_ORDER[a[0]] || 11) - (LEAGUE_ORDER[b[0]] || 11)
  )) {
    const info = LEAGUES[league] || { emoji: "📊", time: "TBD", stream: false };
    msg += `${info.emoji} *${league.toUpperCase()}* — ${info.time} ET`;
    if (info.stream) msg += ` 📺`;
    msg += `\n`;

    for (const g of games) {
      const name = g.market || g.slug.replace(/-/g, " ");
      const stake = g.value || g.invested || 5;
      const bigMoney = stake >= 15;
      const flag = bigMoney ? "🔥 " : "";
      const pnlStr = `${g.pnl >= 0 ? "+" : ""}$${g.pnl.toFixed(2)}`;
      msg += `${flag}${name}\n`;
      msg += `  → *${g.outcome}* at ${(g.current * 100).toFixed(0)}% | $${stake.toFixed(0)} in | ${pnlStr}\n`;
    }
    msg += `\n`;
  }

  if (Object.values(groups).some(g => g.some(p => (LEAGUES[getLeague(p.slug)]?.stream)))) {
    msg += `📺 _streameast.app for NBA/NHL/MLB/Soccer_\n`;
  }
  msg += `_Dashboard: http://localhost:3848_`;

  await sendTelegram(msg);
}

// ── New high-value alerts ──────────────────────────────────────────

// Big win on a single position (when it resolves)
export async function alertBigWin(
  market: string, outcome: string, entry: number, payout: number, profit: number
): Promise<void> {
  await sendTelegram(
    `🎉 *Big Win Resolved*\n` +
    `${market} → *${outcome}*\n` +
    `Entry ${(entry * 100).toFixed(0)}¢ → Won at 100¢\n` +
    `Profit: *+$${profit.toFixed(2)}* (+${((payout / entry - 1) * 100).toFixed(0)}%)`
  );
}

// Big loss warning — position down >50% but not yet resolved
export async function alertBigLoss(
  market: string, outcome: string, entry: number, current: number, pnl: number
): Promise<void> {
  await sendTelegram(
    `🚨 *Position Warning*\n` +
    `${market} → ${outcome}\n` +
    `Down ${(((current - entry) / entry) * 100).toFixed(0)}% (entry ${(entry * 100).toFixed(0)}¢ → ${(current * 100).toFixed(0)}¢)\n` +
    `Unrealized: $${pnl.toFixed(2)}\n` +
    `_Consider closing manually if market is moving away_`
  );
}

// Hot trader — just hit a big win themselves, worth tailing harder
export async function alertHotTrader(
  trader: string, winRate: number, avgReturn: number, trades: number
): Promise<void> {
  await sendTelegram(
    `🔥 *Hot Trader: ${trader}*\n` +
    `Win rate: ${(winRate * 100).toFixed(0)}% over ${trades} resolved trades\n` +
    `Avg return: ${avgReturn >= 0 ? "+" : ""}${avgReturn.toFixed(0)}%\n` +
    `_Bot will auto-size up next signals from this trader_`
  );
}

// Cold trader — losing streak, bot will auto-size down
export async function alertColdTrader(
  trader: string, losingStreak: number, winRate: number
): Promise<void> {
  await sendTelegram(
    `❄️ *Cold Streak: ${trader}*\n` +
    `${losingStreak} losses in a row | Win rate: ${(winRate * 100).toFixed(0)}%\n` +
    `_Bot reduced sizing — consider dropping trader if streak continues_`
  );
}

// Daily recap
export async function alertDailyRecap(stats: {
  trades: number; wins: number; losses: number;
  biggestWin: { market: string; profit: number } | null;
  biggestLoss: { market: string; loss: number } | null;
  netPnl: number; returnPct: number; capital: number;
}): Promise<void> {
  const wr = stats.wins + stats.losses > 0 ? stats.wins / (stats.wins + stats.losses) : 0;
  let msg = `📊 *Daily Recap*\n`;
  msg += `Trades: ${stats.trades} | Win rate: ${(wr * 100).toFixed(0)}% (${stats.wins}W/${stats.losses}L)\n`;
  msg += `Net P&L: ${stats.netPnl >= 0 ? "+" : ""}$${stats.netPnl.toFixed(2)} (${stats.returnPct.toFixed(1)}%)\n`;
  msg += `Capital: $${stats.capital.toFixed(2)}\n\n`;
  if (stats.biggestWin) {
    msg += `🏆 Biggest win: ${stats.biggestWin.market} +$${stats.biggestWin.profit.toFixed(2)}\n`;
  }
  if (stats.biggestLoss) {
    msg += `💔 Biggest loss: ${stats.biggestLoss.market} -$${Math.abs(stats.biggestLoss.loss).toFixed(2)}\n`;
  }
  await sendTelegram(msg);
}

// Drawdown warning
export async function alertDrawdown(
  currentPnl: number, peakPnl: number, drawdownPct: number
): Promise<void> {
  await sendTelegram(
    `⚠️ *Drawdown Alert*\n` +
    `Down ${drawdownPct.toFixed(1)}% from peak\n` +
    `Peak: $${peakPnl.toFixed(2)} → Current: $${currentPnl.toFixed(2)}\n` +
    `_Circuit breaker may trigger at 15%_`
  );
}

// Market resolving soon — position expires in <2 hours
export async function alertResolvingSoon(positions: Array<{
  market: string; outcome: string; currentPrice: number; pnl: number; hoursUntil: number;
}>): Promise<void> {
  if (positions.length === 0) return;
  let msg = `⏰ *Markets Resolving Soon*\n\n`;
  for (const p of positions.slice(0, 10)) {
    msg += `${p.market} → *${p.outcome}* in ${p.hoursUntil.toFixed(1)}h\n`;
    msg += `  Current: ${(p.currentPrice * 100).toFixed(0)}¢ | P&L: ${p.pnl >= 0 ? "+" : ""}$${p.pnl.toFixed(2)}\n`;
  }
  await sendTelegram(msg);
}
