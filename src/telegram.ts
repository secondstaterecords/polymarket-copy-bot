// Telegram alert integration — sends trade notifications and daily summaries
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
  action: "BUY" | "SELL",
  trader: string,
  slug: string,
  outcome: string,
  price: number,
  amount: number,
  status: "paper" | "success" | "failed"
): Promise<void> {
  const emoji = action === "BUY" ? "🟢" : "🔴";
  const statusEmoji = status === "success" ? "✅" : status === "paper" ? "📝" : "❌";
  await sendTelegram(
    `${emoji} *${action}* ${statusEmoji} ${status.toUpperCase()}\n` +
    `Trader: ${trader}\n` +
    `Market: \`${slug}\`\n` +
    `Outcome: ${outcome}\n` +
    `Price: ${price.toFixed(2)} | Amount: $${amount}`
  );
}

export async function alertPnl(
  paperPnl: number,
  paperReturn: number,
  realPnl: number,
  realReturn: number,
  paperTrades: number,
  filtered: number
): Promise<void> {
  const paperEmoji = paperPnl >= 0 ? "📈" : "📉";
  await sendTelegram(
    `${paperEmoji} *P&L Update*\n` +
    `Paper: $${paperPnl.toFixed(2)} (${paperReturn}%)\n` +
    `Real: $${realPnl.toFixed(2)} (${realReturn}%)\n` +
    `Trades: ${paperTrades} paper | ${filtered} filtered`
  );
}
