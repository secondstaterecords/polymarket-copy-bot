# Polymarket Copy Bot

Automated copy-trading bot for [Polymarket](https://polymarket.com). Monitors top-performing traders and mirrors their positions with configurable risk controls.

## Quick Install (macOS)

```bash
git clone https://github.com/secondstaterecords/polymarket-copy-bot.git ~/polymarket-copy-bot
cd ~/polymarket-copy-bot && bash install.sh
```

The installer handles everything: Node.js check, Bullpen CLI, authentication, auto-start.

## What It Does

- Monitors 15 top Polymarket traders every 30 seconds
- When a trader buys a position, the bot copies it with a $5 bet
- Filters out noise: price limits, daily caps, dedup, velocity limits
- Auto-redeems resolved winning positions
- Dashboard at `http://localhost:3848` shows live P&L, positions, and trade history

## How It Works

1. Bot polls the Polymarket Data API for trader activity
2. New trades are filtered through risk controls (price range, daily exposure, market concentration)
3. Trades that pass filters are executed via Bullpen CLI
4. Dashboard reads from Bullpen's portfolio API for real-time P&L

## Configuration

Edit `src/config.ts`:

| Setting | Default | Description |
|---------|---------|-------------|
| `paperMode` | `true` | Paper trade (no real money) vs live |
| `tradeAmountUsd` | `5` | Amount per trade |
| `maxDailyExposurePct` | `40` | Max % of capital deployed per day |
| `maxPerMarketPct` | `12` | Max % of capital on one market |
| `maxDrawdownPct` | `20` | Circuit breaker threshold |
| `takeProfitPct` | `900` | Auto-sell at 10x return |

## Going Live

1. Deposit USDC to your Bullpen wallet at [app.bullpen.fi/wallet](https://app.bullpen.fi/wallet)
2. Edit `src/config.ts` — change `paperMode: false`
3. Restart the bot:
   ```bash
   launchctl unload ~/Library/LaunchAgents/com.copybot.bot.plist
   launchctl load ~/Library/LaunchAgents/com.copybot.bot.plist
   ```

## Funding Your Wallet

1. Buy USDC on Coinbase, Phantom, or any exchange
2. Send to your Polymarket wallet via Bullpen: [app.bullpen.fi/wallet](https://app.bullpen.fi/wallet) → Deposit
3. The bot auto-detects your balance and adjusts trading limits

## Dashboard

Open `http://localhost:3848` — auto-refreshes every 5 seconds.

Shows: portfolio value, unrealized P&L, open positions, trade history, trader performance.

## Updating

```bash
cd ~/polymarket-copy-bot && git pull && npm install
```

Then restart bot and dashboard via launchctl.

## Logs

- `bot.log` — trading activity
- `dashboard.log` — dashboard server
- `trader-analytics.json` — trader performance data

## Disclaimer

This software is provided as-is. Trading prediction markets involves risk of loss. Past performance does not guarantee future results. This is not financial advice. You are solely responsible for your trading decisions and any funds deposited.
