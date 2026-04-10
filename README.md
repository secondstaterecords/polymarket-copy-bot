# Polymarket Copy Bot

Automated copy trading bot that mirrors top Polymarket traders using [Bullpen CLI](https://bullpen.fi).

## Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_REPO/main/install.sh | bash
```

## Features

- **Smart Filters** — Price range (0.10-0.85), min trade size ($50), position caps
- **Daily Limits** — Max $25/market, $200/day exposure
- **Exit Mirroring** — Sells when tracked traders sell
- **Paper Mode** — Test without risking real money
- **Real-Time Dashboard** — Real P&L vs Paper P&L, filter stats, trade log
- **SQLite Storage** — Fast, reliable, no more multi-MB JSON files

## Manual Setup

1. Install Bullpen CLI:
   ```bash
   curl -fsSL https://cli.bullpen.fi/install.sh | bash -s -- --referral @gilded-vole
   ```
2. Authenticate: `bullpen login`
3. Approve contracts: `bullpen polymarket approve --yes`
4. Fund wallet with USDC
5. Clone and install:
   ```bash
   git clone https://github.com/YOUR_REPO/polymarket-copy-bot.git
   cd polymarket-copy-bot && npm install
   ```
6. Start: `npm run start`

## Configuration

Edit `src/config.ts`:

| Setting | Default | Description |
|---------|---------|-------------|
| `paperMode` | `true` | Set `false` for live trading |
| `tradeAmountUsd` | `5` | USD per copy trade |
| `minPrice` | `0.10` | Skip outcomes below this price |
| `maxPrice` | `0.85` | Skip outcomes above this price |
| `minTraderAmount` | `50` | Only copy trades > $50 |
| `maxPerMarket` | `25` | Max exposure per market |
| `maxDailyExposure` | `200` | Max new exposure per day |

## Dashboard

Open `http://localhost:3848` to see:
- Real vs Paper P&L
- Filter pass rate
- Live trade log with filter reasons

## Commands

```bash
npm run bot        # Start bot only
npm run dashboard  # Start dashboard only
npm run start      # Start both
npm run test       # Run tests
```

## Powered by [Bullpen CLI](https://bullpen.fi)
