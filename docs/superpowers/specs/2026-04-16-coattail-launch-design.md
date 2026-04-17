# Coattail Launch — Master Design Spec

**Date:** 2026-04-16
**Author:** Max + Claude
**Status:** Draft → pending approval

---

## 1. Overview

Coattail is a prediction-market copy-trading desk. The bot is built and trading live. This spec covers everything needed to go from "working bot" to "paying customers" — legal foundation, payment processing, customer onboarding, community/support, and marketing.

**Goal:** First paying customer by end of week. 10 customers by end of month.

---

## 2. Legal Foundation

### 2.1 Entity structure
- **Recommendation:** Do NOT form an LLC yet. Operate as sole proprietor until revenue exceeds ~$5K/month. LLC costs money and time that's better spent shipping.
- **Why:** You're selling access to software, not managing customer funds. Customers trade with their own accounts. Your liability exposure is limited to "your bot gave bad signals" which the TOS disclaims.

### 2.2 Terms of Service (TOS)
Key clauses:
- **No financial advice.** Coattail provides automated trade-mirroring software. Not a broker, not an advisor, not a fund.
- **No guarantee of returns.** Past performance is not indicative of future results. Prediction markets carry real risk of loss.
- **Customer assumes all risk.** Trades execute on customer's own account with their own funds. Coattail never has custody.
- **No refunds** on monthly subscriptions. Cancel anytime, access ends at billing cycle.
- **Disclaimer of liability.** Coattail not liable for losses, missed trades, downtime, auth failures, or platform (Polymarket/Bullpen) issues.
- **Age requirement.** Must be 18+ and in a jurisdiction where prediction-market trading is legal.
- **Confidentiality.** Customer shall not reverse-engineer, redistribute, or resell access. Wallet addresses and strategy details are proprietary.
- **Termination.** We can terminate access for any reason with 30 days notice.

### 2.3 Privacy Policy
- We collect: email, payment info (via Stripe, we never see card numbers), Discord username.
- We do NOT collect: wallet addresses (customer connects their own), trading data from customer accounts.
- Data stored: Stripe (payments), SendGrid (email), Discord (support).

### 2.4 Risk Disclaimer (on landing page, already present)
Keep the current disclosure block. Add link to full TOS page.

### 2.5 Jurisdiction notes
- Polymarket is available in 40+ countries but NOT in the US for certain market types (CFTC regulated). Sports betting markets on Polymarket are available to US users via the prediction-market exemption.
- Coattail does not operate in jurisdictions where prediction markets are prohibited.
- Add: "Check your local laws before subscribing."

---

## 3. Payment Processing (Stripe)

### 3.1 Products
- **Tier I — Passenger:** $29/month recurring
- **Tier II — Operator:** $99/month recurring
- **Free coupon:** Code `FRIEND` = 100% off forever (for beta users, friends, promotions)

### 3.2 Implementation
- Create two Stripe Products with monthly Price objects
- Generate Payment Links for each (no custom checkout needed)
- Embed Payment Link URLs in landing page buttons
- Stripe Student Pack: first $1K in revenue = waived transaction fees

### 3.3 Post-payment flow
- Stripe sends webhook to a serverless function (Netlify Function or Hetzner endpoint)
- Function sends welcome email via SendGrid with:
  - Install instructions (Tier I: copy-trade setup, Tier II: full bot install)
  - Bullpen referral link (bullpen.fi/@gilded-vole)
  - Discord invite link
  - Support contact

### 3.4 Access management (v1 — manual)
- Customer pays → Max gets Stripe notification → manually adds to Discord role + sends wallet address
- This is fine for first 10-20 customers. Automate later.

---

## 4. Customer Onboarding

### 4.1 Tier I — Passenger (copy my wallet)
Post-payment email contains:
1. "Install Bullpen CLI" — one-liner: `curl -fsSL https://cli.bullpen.fi/install.sh | bash`
2. "Create account" — `bullpen login` → sign up using referral link
3. "Approve trading" — `bullpen polymarket approve --yes`
4. "Fund account" — deposit USDC at app.bullpen.fi/wallet
5. "Start copying" — `bullpen tracker copy start 0x1023C11A242905BF9C1F25f199B8107047EBe18c --preset recommended --amount 5 --execution-mode auto --exit-behavior mirror_sells`
6. Done. Trades auto-mirror.

**Auth issues for Tier I customers:** They use Bullpen's native `tracker copy` feature, which runs server-side on Bullpen's infrastructure. They do NOT run our bot locally. **No auth refresh issues** — Bullpen handles the session for their own copy-trade feature. This is a major selling point.

### 4.2 Tier II — Operator (full bot)
Post-payment email contains:
1. GitHub repo access (or public repo + license key)
2. Server setup guide (Hetzner $4/mo recommended)
3. Concierge deploy session (we SSH in and configure for them)
4. Ongoing: `git pull && systemctl restart` for updates

### 4.3 Free tier (coupon FRIEND)
Same flow as Tier I but Stripe charges $0. Email still sends. Discord still grants access.

---

## 5. Discord Server

### 5.1 Server structure
```
#welcome          — rules, TOS link, how it works
#announcements    — bot updates, new features, performance recaps
#general          — community chat
#support          — AI-powered auto-responder + escalation
#winning-trades   — auto-posted winning trade screenshots from bot
#performance      — weekly recap posts with anonymized stats
```

### 5.2 Roles
- `@Founder` — Max
- `@Passenger` — Tier I subscribers (granted on payment)
- `@Operator` — Tier II subscribers
- `@Beta` — free coupon users
- `@Bot` — Coattail support bot

### 5.3 Gating
- Server is invite-only (link in post-payment email)
- #support and #winning-trades visible to all roles
- #general visible to all paying roles

### 5.4 AI Support Bot (Option C — fully autonomous)
- **Stack:** Discord.js bot → Claude API (Haiku for cost) → responds in #support
- **Context:** Loaded with complete knowledge base:
  - Install instructions (both tiers)
  - Known issues (Bullpen auth expiry, DNS propagation, etc.)
  - FAQ (pricing, refunds, how it works, what markets we trade)
  - Troubleshooting flowcharts
- **Behavior:**
  - Responds to any message in #support within 30 seconds
  - Can answer: install help, billing questions, "is it working?", performance questions
  - Escalates to Max (DM + Telegram push) when: billing dispute, technical bug it can't solve, angry customer
  - Tone: helpful, concise, slightly technical. Not cringe-corporate.
- **Cost:** Claude Haiku at ~100 msgs/day = ~$3-5/month
- **Privacy:** Bot never reveals wallet addresses, strategy internals, or other customers' data

---

## 6. Marketing & Distribution

### 6.1 LinkedIn strategy
**Framing:** Technical achievement, not gambling. You built an autonomous trading system with statistical confidence scoring.

**Post structure:**
- Hook: "I built a system that copies prediction-market sharps in real-time."
- Technical depth: adaptive EV-based position sizing, CLV tracking, resolution analytics
- Results: mention win rates, but frame as "the system identified wallets with 92% resolution accuracy"
- CTA: "Accepting a few beta testers. Link in comments."
- Hashtags: #fintech #quanttrading #predictionmarkets #automation #sideproject

**Timing:** Post Tuesday or Wednesday morning (highest LinkedIn engagement). One post, not a campaign. Let it grow organically.

**Tone:** Humble builder sharing a side project, not hustler promoting a scheme.

### 6.2 Instagram strategy
**Target:** UVA students, friends, sports betting crowd

**Content:**
- Story: screenshot of Telegram trade alerts (green $$ flowing in)
- Post: clean screenshot of the landing page with "Built this. DM for access."
- Reel (optional): 30-sec screen recording of dashboard + trade flow

**Tone:** More casual, less technical. "Copy the sharps, skip the research."

### 6.3 School Instagram
- Same content as personal but posted in any UVA entrepreneurship/business groups
- Tag relevant UVA orgs (Entrepreneurship Club, Finance Club, etc.)

### 6.4 Growth mechanics
- **Referral rebate:** Every customer gets their own Bullpen referral code. If their friends sign up under them → they earn fee rebates. Viral loop built into the platform.
- **Discord community:** satisfied customers post winning trades → social proof → organic growth
- **Word of mouth:** at $29/mo with real returns, this sells itself if it works

### 6.5 What NOT to do
- Don't spam DMs
- Don't promise specific returns ("you'll make $X/month")
- Don't use urgency scarcity tactics ("only 5 spots left!")
- Don't post on crypto Twitter (wrong audience, attracts scammers)

---

## 7. Technical Implementation Order

1. **Legal pages** — /terms and /privacy routes on landing (static content)
2. **Stripe products** — create via Stripe MCP or dashboard
3. **Payment links** — embed in landing page buttons
4. **Welcome email template** — SendGrid with install instructions
5. **Discord server** — create, structure channels, set roles
6. **Discord AI bot** — Claude-powered support responder
7. **LinkedIn post** — draft, review, publish
8. **Instagram content** — create, post
9. **Auto-post winning trades** — bot → Discord #winning-trades channel

---

## 8. Success Metrics

- **Week 1:** 3-5 paying customers (friends + UVA network)
- **Month 1:** 10-20 customers, $500-1000 MRR
- **Month 2:** 30+ customers via referrals + organic, $1500+ MRR
- **Break-even:** Revenue covers Hetzner ($4) + domain ($0) + Claude API (~$5) + time

---

## 9. Open Questions

- Should Tier II include source code access (GitHub) or just managed deployment?
- Price sensitivity: is $29 too high for college students? Consider $19 intro price.
- Should we cap Tier I at N customers? (Copy-trading a small wallet = limited liquidity)
