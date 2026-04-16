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
