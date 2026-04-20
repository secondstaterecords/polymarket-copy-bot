# Bullpen CLI Ecosystem — Full Intel Report
Generated: 2026-04-20 by background research agent

## TL;DR — the 3 things that matter
1. **v0.1.64 fixed the JWT bug we thought was unsolvable.** Sessions now last 30 DAYS, not 15 min. You're on v0.1.64 already. Skip v0.1.65 (README-only change).
2. **Root cause of auth failures was browser + CLI racing.** If you log into app.bullpen.fi while the bot runs with the same account, browser burns CLI token. **Give Hetzner bot a dedicated account.**
3. **Polymarket's own API bypasses Bullpen entirely for data.** `data-api.polymarket.com/trades?user=X` returns `slug + eventSlug + conditionId + asset` in ONE payload — kills the mirror-sell slug-mismatch bug at the root.

## Other highlights
- `$5 minimum` NOT fixed, `inactivity drop` NOT acknowledged — file GH issues, @wu-hongjun responds same-day
- Whale decoys are real — top traders use 2-3 wallets, cancel limit orders before fill. Defense: require FILLED trades, convergence filter (2+ wallets same side)
- **CLOB API keys survive Bullpen JWT expiry** — run `bullpen polymarket clob create-api-key` for failover path
- Today's top by volume: **Theo4** ($22M lifetime), **Fredi9999** ($16M), **kch123** ($11M)
- Today's 24h #1: **CemeterySun** ($397K) — the one I recommended
- `bullpen polymarket data smart-money --type top_traders --category crypto` has convergence signals built in — worth using

## Action ranked
1. Swap `bullpen polymarket data leaderboard` → direct `lb-api.polymarket.com/profit` (30min fix)
2. Swap tracker signal source → `data-api.polymarket.com/trades` (fixes slug mismatch at root)
3. Isolate Hetzner's Bullpen account from browser
4. Mint CLOB API key as execution failover
5. Add decoy defense: require filled trades + convergence signal
6. File GH issues for $5 min + inactivity drop

Full 4500-word report + raw data saved to:
  docs/research/2026-04-20-bullpen-ecosystem-report-FULL.md
  /tmp/bullpen_docs_full.txt, /tmp/bullpen_issues.json, /tmp/pm_data_api.md
