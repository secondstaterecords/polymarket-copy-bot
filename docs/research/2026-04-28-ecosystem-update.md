# Polymarket Copy-Trading Ecosystem Update — 2026-04-22

**Window covered:** 2026-04-08 through 2026-04-22 (with forward look at the April 22 + April 28 cutovers)
**Author context:** Max is going live with a Bullpen-CLI-based copy bot + a custom paper-trading sim. This report tells him what changed and what he might be missing.

---

## TL;DR

The single most important thing happening in this window is **the Polymarket V2 cutover**. There are actually **two** sequential cutovers, not one:

- **April 22, 2026 (~11:00 UTC)** — CTF Exchange V2 contracts go live. ~1 hour downtime, all open limit orders cancelled. Adds EIP-1271 smart-contract-wallet signing, new Exchange domain (verifyingContract addresses change), simplified order struct.
- **April 28, 2026 (~11:00 UTC)** — CLOB V2 backend takes over `clob.polymarket.com`. Another ~1 hour of downtime, all open orders wiped again. **Legacy `@polymarket/clob-client` and `py-clob-client` stop working.**

If Bullpen CLI is not on the V2 SDK by April 28, the bot **stops trading**. The Bullpen team has shipped four point releases (v0.1.65 → v0.1.68) in the past two weeks but **none of the public release notes mention V2**, and the only logged change is "add usage section to README" repeated four times. That is suspicious — the public `bullpen-cli-releases` repo is just a tag-mirror with hidden internal commits.

---

## 1. Confirmed changes (with sources)

### 1a. Polymarket protocol-level

- **CTF Exchange V2 contracts go live April 22** ([Crypto Times](https://www.cryptotimes.io/2026/04/18/polymarket-announces-v2-upgrades-to-go-live-on-april-22/)). New verifyingContract addresses:
  - Standard: `0xE111180000d2663C0091e4f400237545B87B996B`
  - Negative-Risk: `0xe2222d279d744050d28e00520010520000310F59`
  - Exchange EIP-712 domain version bumps from `"1"` → `"2"`. ClobAuthDomain stays `"1"` (so L1 API auth code does NOT need to change).
- **CLOB V2 backend cutover April 28 (~11:00 UTC)** ([Polymarket Help Center](https://help.polymarket.com/en/articles/14762452-polymarket-exchange-upgrade-april-28-2026), [docs.polymarket.com/v2-migration](https://docs.polymarket.com/v2-migration)). ~1h downtime, all open orders wiped.
- **Legacy SDKs deprecated.** `@polymarket/clob-client` and `py-clob-client` will stop working post-cutover. Replacements: [`@polymarket/clob-client-v2`](https://github.com/Polymarket/clob-client-v2), [`py-clob-client-v2`](https://github.com/Polymarket/py-clob-client-v2). Constructor switched to options-object; `chainId` → `chain`; `tickSizeTtlMs` removed.
- **EIP-712 Order struct rewritten.** Dropped: `taker`, `expiration`, `nonce`, `feeRateBps`. Added: `timestamp` (ms — replaces nonce as uniqueness key), `metadata` (bytes32), `builder` (bytes32, optional). Means: **every signing path in our codebase needs to be regenerated.**
- **Builder auth model rewritten.** `@polymarket/builder-signing-sdk` removed. `POLY_BUILDER_API_KEY/SECRET/PASSPHRASE/SIGNATURE` headers gone. New flow: a single `builderCode` (bytes32) from your Builder Profile attached to each order. Public on-chain. ([Builder Program docs](https://docs.polymarket.com/builders/overview))
- **pUSD launched April 6** as the new collateral token ([news.bitcoin.com](https://news.bitcoin.com/polymarkets-april-2026-upgrade-new-stablecoin-faster-order-matching-smart-contract-wallet-support/)). Standard ERC-20 on Polygon, USDC-backed onchain. UI auto-wraps; **API-only traders must call `wrap()` on the Collateral Onramp** to convert their USDC.e to pUSD.
- **Smart-contract wallet support (EIP-1271)** in V2 ([cryptotimes.io](https://www.cryptotimes.io/2026/04/07/polymarket-announces-ctf-exchange-v2-in-major-protocol-upgrade/)). Safe / Coinbase Agentic Wallets / timelocks become first-class signers — useful if we ever want to run the bot from a multisig.
- **Dynamic taker fees on 15-min crypto markets** ([Finance Magnates](https://www.financemagnates.com/cryptocurrency/polymarket-introduces-dynamic-fees-to-curb-latency-arbitrage-in-short-term-crypto-markets/)). Fee scales with proximity to 50¢ (peak ~3.15% on a 50¢ contract). Designed to kill latency-arb bots; redirects fees into Maker Rebates Program.
- **Fee schedule expanded March 30, 2026** ([PokerNews](https://www.pokernews.com/prediction-markets/news/2026/04/polymarket-blunder-prompts-quick-u-turn-new-polymarket-fees-50947.htm)). Categories now charged: Finance, Politics, Economics, Culture, Weather, Tech, Mentions, Other. Sports 0.75% max, Crypto 1.80% max, Geopolitics still free. Taker fee coeff = 0.05; maker rebate coeff = 0.0125. Promotional 50% taker rebate runs through April 30.

### 1b. Bullpen CLI (public repo signal)

- 4 releases (v0.1.65 → v0.1.68) shipped April 19–28. Public changelog only shows "add usage section to README". Real commits are private — the GitHub repo is just a release-tag mirror.
- 7 open issues, most filed April 7–15 ([issues](https://github.com/BullpenFi/bullpen-cli-releases/issues)):
  - `#2` Wallet init fails after login on macOS
  - `#3` Deposit is missing
  - `#5` `bullpen portfolio balances` errors
  - `#6` Wallet setup `unique_user_id_name` constraint violation
  - `#8` `bullpen polymarket clob create-api-key` hangs indefinitely (Turnkey signing never completes; primary-wallet override ignored)
  - `#12` JWT auto-refresh failing with 401 on refresh token (despite "auto-refreshes" claim) — forces manual `bullpen login`
  - `#13` Redemption blocked after CLI restart, "invalid authorization" on winnings
- 5 closed issues around April 13. Pattern: closed in clusters, suggesting batched server-side or release-coupled fixes. **No public detail on what was fixed.**

### 1c. Copy-trading meta

- **Stand.Trade COPYCAT launch coverage April 24** ([news.polymarket.com/p/copycat](https://news.polymarket.com/p/copycat)). Stand has tracked >1500 wallets and 5000 strategies in 2 months. Direct competitor to what Max is building, but they're a SaaS terminal, not an installable bot.
- **COPYTRADE WARS post on Polymarket Oracle** ([news.polymarket.com/p/copytrade-wars](https://news.polymarket.com/p/copytrade-wars)). Confirms whales actively running multi-wallet schemes and "iceberging" small orders to evade copy bots. Sharp traders have **told researchers directly** that public accounts ≠ full book.
- **Wallet-basket strategy** trending ([Phemex](https://phemex.com/news/article/innovative-strategy-emerges-for-polymarket-copy-trading-50622)). Topic-grouped baskets; trigger only when >80% of basket enters same outcome inside a tight price band. This is the consensus convergence pattern.
- **GitHub copy-bot landscape:** Most repos are SEO spam — same description repeated dozens of times, same code copy-pasted. Active genuine projects: `GiordanoSouza/polymarket-copy-trading-bot` (Python+Supabase), `gamma-trade-lab/polymarket-copy-trading-bot` (Rust, low-latency focus), `LNLUTS/polymarket-copy-trading-bot` (polling+GTC mirror), `Drakkar-Software/OctoBot-Prediction-Market` (open source, broader prediction-market reach).

---

## 2. Likely changes (hinted, not confirmed)

- **Bullpen v0.1.65–v0.1.68 almost certainly contains V2 prep work** even though release notes are silent. Timing matches the April 22 + April 28 cutover schedule perfectly. Recommend: treat any unannounced bullpen release between now and April 30 as critical and pin to a known-good version after each successful trade.
- **Bullpen JWT auto-refresh is broken** for some users (issue #12). May or may not have been silently fixed in v0.1.66+. Worth testing before going live.
- **Polymarket data-api / lb-api endpoints likely change format post-cutover** to match V2 order struct (timestamp instead of nonce, builder field). Not confirmed in any doc Max can rely on yet — assume it'll change and add a parser-level abstraction.
- **Decoy-wallet detection may become a service.** Stand.Trade is in best position to ship it. If Max wants to compete, the wedge is "score wallets by independence from related wallets."

---

## 3. Things to adopt (ranked by leverage)

### Tier 1 — must-do before going live

1. **Pin Bullpen CLI version + add an upgrade gate.** Before April 28, run `bullpen --version`. If on <0.1.68, stop. If on ≥0.1.68, snapshot binary and bypass auto-upgrade until you've verified V2 trades end-to-end on a small float. Cost: 10 minutes. Source: Bullpen issues + V2 cutover date.
2. **Smoke-test post-cutover on April 28 between 12:00–14:00 UTC** with $5–10 of pUSD on a Geopolitics market (still zero-fee). Don't run the full copy bot until smoke passes. Cost: 30 min.
3. **Wrap any leftover USDC.e to pUSD manually** if Bullpen UI doesn't auto-handle it. Check via Polymarket UI first — UI does it for you. API-only path needs `Collateral Onramp.wrap()`. Cost: 1 tx + gas.
4. **Add nonce → timestamp parser shim** in any custom code that reads order signatures from the data-api. Old code keying off `nonce` will silently break. Cost: 1–2 hrs. [docs.polymarket.com/v2-migration](https://docs.polymarket.com/v2-migration)
5. **Register a Builder Profile and put `builderCode` on every order.** Free volume tracking + qualifies for the $1M Builders Program grants. Cost: 5 min sign-up at [polymarket.com/settings?tab=builder](https://polymarket.com/settings?tab=builder). Source: [Builder Program docs](https://docs.polymarket.com/builders/overview).

### Tier 2 — competitive moat

6. **Wallet-basket consensus signal** before sizing up. Don't copy a single whale — wait for ≥80% of a topic basket. Solves the decoy problem at architecture level rather than chasing every new alias. Cost: 1–2 days to build a basket DB. ([Phemex piece](https://phemex.com/news/article/innovative-strategy-emerges-for-polymarket-copy-trading-50622))
7. **Iceberg detection.** Whales accumulate in tiny orders over time. Add a rolling-sum view per wallet per market and trigger off cumulative position delta, not single-order size. Reuses your existing trade ingestion. Cost: half-day.
8. **Builder-code sweepstakes.** With the 50% taker rebate running through April 30, if you trade through your own builder profile you can stack: builder volume credit + maker rebate (when applicable) + taker rebate. Cost: zero — same trades, more revenue.

### Tier 3 — nice to have

9. **Move toward Safe (EIP-1271) custody** once V2 is stable. Cleaner key management, easier to give a friend read-only signing power without sharing seed. Cost: 1 day.
10. **Build for the new $8B/month volume floor** ([AgentBets](https://agentbets.ai/prediction-markets/polymarket/)). Polymarket processes that much in monthly volume; we should optimize for thicker books and tighter slippage caps now that they exist.

---

## 4. Things to ignore (dead-ends)

- **Most "polymarket copy trading bot" GitHub repos are SEO farms** — identical READMEs, same description string repeated 30 times. Don't waste time scraping their code.
- **The 15-min crypto-market dynamic-fee story.** Fascinating to read, but it doesn't hit our use case (we copy event-based whales, not 15-min latency arb). Skip the deep dive unless we pivot.
- **Coinbase Agentic Wallets / account-abstraction custody.** Cool, but premature for a bot Max is running solo. Note it for v2 of the product.
- **AI-driven prediction-market signal services.** Lots of breathless 2026 thinkpieces, no concrete tools that beat human whale-following yet. Skip.
- **Bullpen referral chasing.** Max is already on the @gilded-vole 40% T1 line. Don't re-enroll, don't switch.
- **Polymarket US.** US-specific docs/fee schedule are different — only relevant if Max ever bridges to US users (consultation product). Bookmark, don't read now.

---

## Next 7 days — concrete checklist

- [ ] Today: confirm Bullpen CLI version, snapshot binary
- [ ] April 22 12:00 UTC: monitor #2 Bullpen issue for post-CTF-V2 reports
- [ ] April 25: dry-run a $5 trade through the Bullpen path
- [ ] April 28 13:00 UTC: smoke test post-CLOB-V2-cutover before running full bot
- [ ] April 30: re-evaluate fee math now that 50% taker rebate ends
- [ ] Add basket-consensus + iceberg-detection to the v2 self-improving roadmap

---

## Source list

- https://help.polymarket.com/en/articles/14762452-polymarket-exchange-upgrade-april-28-2026
- https://docs.polymarket.com/v2-migration
- https://docs.polymarket.com/builders/overview
- https://docs.polymarket.com/advanced/neg-risk
- https://github.com/Polymarket/clob-client-v2
- https://github.com/Polymarket/py-clob-client-v2
- https://github.com/Polymarket/ctf-exchange-v2
- https://github.com/BullpenFi/bullpen-cli-releases/issues
- https://news.polymarket.com/p/copycat
- https://news.polymarket.com/p/copytrade-wars
- https://www.cryptotimes.io/2026/04/18/polymarket-announces-v2-upgrades-to-go-live-on-april-22/
- https://www.cryptotimes.io/2026/04/07/polymarket-announces-ctf-exchange-v2-in-major-protocol-upgrade/
- https://news.bitcoin.com/polymarkets-april-2026-upgrade-new-stablecoin-faster-order-matching-smart-contract-wallet-support/
- https://www.financemagnates.com/cryptocurrency/polymarket-introduces-dynamic-fees-to-curb-latency-arbitrage-in-short-term-crypto-markets/
- https://www.pokernews.com/prediction-markets/news/2026/04/polymarket-blunder-prompts-quick-u-turn-new-polymarket-fees-50947.htm
- https://phemex.com/news/article/innovative-strategy-emerges-for-polymarket-copy-trading-50622
- https://polymarket.com/settings?tab=builder
