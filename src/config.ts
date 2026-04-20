export interface TraderConfig {
  name: string;
  address: string;
  categories?: string[];
  tier?: "core" | "sniper" | "watch"; // core = daily leaderboard + resolutions, sniper = low-vol high-WR rare, watch = evaluating
  sniperBetUsd?: number; // fixed $ per trade if tier=sniper (overrides tradeAmountUsd)
}

export interface FilterConfig {
  minPrice: number;
  maxPrice: number;
  minTraderAmount: number;
  maxDaysToResolution: number;
  minHoursToResolution: number;
  requireMultiWallet: boolean;
  multiWalletWindow: number;
  newPositionsOnly: boolean;
  // Anti-noise filters
  maxTraderSignalsPerHour: number; // Skip traders sending more than this per hour (0 = disabled)
  dedupAcrossTraders: boolean;    // Only take one position per market, regardless of trader
}

export interface RiskConfig {
  tradeAmountUsd: number;
  maxPerMarketPct: number;     // % of total capital per market
  maxDailyExposurePct: number; // % of total capital per day
  maxDrawdownPct: number;      // % of total capital before circuit breaker
  fallbackCapital: number;     // Fallback if balance check fails ($)
  takeProfitPct: number;       // Auto-sell when position return exceeds this % (0 = disabled)
}

export interface BotConfig {
  pollIntervalMs: number;
  bullpenPath: string;
  botPort: number;
  dashboardPort: number;
  dataDir: string;
  traders: TraderConfig[];
  filters: FilterConfig;
  risk: RiskConfig;
  paperMode: boolean;
  useTracker: boolean;  // Use 'bullpen tracker trades' instead of individual polling
}

// Trader roster — auto-refreshed daily by scripts/refresh-traders.ts
// Composite score = 0.5*(24h PnL rank) + 0.3*(7d PnL rank) + 0.2*(lifetime rank)
// Core = daily top-30 leaderboard + positive 7d WR in our DB
// Sniper = low volume (<$100K weekly), >70% WR in profile, rare entries — flat $5 bet
// Watch = new candidates, not yet trading, observing for 3 days before promoting
// Last refreshed: 2026-04-19 (manual reset after mk-version audit)
export const DEFAULT_TRADERS: TraderConfig[] = [
  // CORE — verified on today's leaderboard (24h) AND in trader_stats with resolutions
  { name: "0x2a2c", address: "0x2a2c53bd278c04da9962fcf96490e17f3dfb9bc1", categories: ["sports"], tier: "core" }, // lifetime #4, today #3, +$288K/24h
  { name: "elkmonkey", address: "0xead152b855effa6b5b5837f53b24c0756830c76a", tier: "core" }, // today #2, +$314K/24h, $1.8M vol
  { name: "RN1", address: "0x2005d16a84ceefa912d4e380cd32e7ff827875ea", categories: ["sports", "politics"], tier: "core" }, // today #12, +$136K/24h
  { name: "texaskid", address: "0xc8075693f48668a264b9fa313b47f52712fcc12b", categories: ["sports"], tier: "core" }, // today #5, +$246K/24h
  { name: "CarlosMC", address: "0x777d9f00c2b4f7b829c9de0049ca3e707db05143", categories: ["sports"], tier: "core" }, // today #4, +$272K/24h
  { name: "Countryside", address: "0xbddf61af533ff524d27154e589d2d7a81510c684", categories: ["sports"], tier: "core" }, // today #7, +$183K/24h

  // WATCH — fresh on today's leaderboard, no history in our DB, $5 flat bet for 3 days then promote/drop
  { name: "0xE16D3F2A", address: "0xe16d3f2a5807999b358affd9445c3a09e45e5e30", categories: ["sports"], tier: "watch", sniperBetUsd: 3 }, // today #6, +$204K, $1.3M vol
  { name: "JuicySlots", address: "0x47a83fb1debcd11cc93f3bbbf5aeb3a5caeb52f9", categories: ["sports"], tier: "watch", sniperBetUsd: 3 }, // today #9, +$144K
  { name: "elshark206", address: "0x0eb75bf6f54794a83bd26095811f30b530161f17", categories: ["sports"], tier: "watch", sniperBetUsd: 3 }, // today #11, +$137K
  { name: "CemeterySun", address: "0x37c1874a60d348903594a96703e0507c518fc53a", categories: ["sports"], tier: "watch", sniperBetUsd: 3 }, // today #18, $4.2M vol — consistent whale

  // SNIPERS — to be populated by scripts/refresh-traders.ts sniper-scan
  // Criteria: <100 trades lifetime, >70% WR, >$50K PnL, <$100K weekly volume
];

// Dropped (2026-04-19 reset): 0x4924, beachboy4, sovereign2013 (dormant 3d), swisstony,
// mhh29, JPMorgan101, kch123, Mentallyillgambld, bcda, weflyhigh, GamblingIsAllYouNeed
// (50 signals/hr noise), bossoskil1, denizz, Cannae, gatorr, SecondWindCapital
// Reason: either 0 resolutions in our DB, <50% recent WR, or dropped off top-30 leaderboard.

export const DEFAULT_CONFIG: BotConfig = {
  pollIntervalMs: 30_000,
  bullpenPath: process.env.BULLPEN_PATH || `${process.env.HOME}/.local/bin/bullpen`,
  botPort: parseInt(process.env.BOT_PORT || "3847"),
  dashboardPort: parseInt(process.env.DASHBOARD_PORT || "3848"),
  dataDir: process.env.DATA_DIR || ".",
  traders: DEFAULT_TRADERS,
  filters: {
    minPrice: 0.05,              // HARDENED 2026-04-19 — was 0.10 with a bypass that let 0.6¢ through on moonshots
    maxPrice: 0.85,
    minTraderAmount: 10,
    maxDaysToResolution: 7,      // TIGHTENED 2026-04-19 — was 30d, forces short-res markets for sell-signal observability
    minHoursToResolution: 2,
    requireMultiWallet: false,
    multiWalletWindow: 30,
    newPositionsOnly: true,
    maxTraderSignalsPerHour: 20, // Traders sending 20+/hr are noise
    dedupAcrossTraders: true,    // One position per market across all traders (MK13 — only confirmed-effective change)
  },
  risk: {
    tradeAmountUsd: 3,           // REDUCED 2026-04-19 — was $5, lowered while trust-rebuilding
    maxPerMarketPct: 3,          // REDUCED 2026-04-19 — was 5%
    maxDailyExposurePct: 30,     // REDUCED 2026-04-19 — was 75%, preserve dry powder
    maxDrawdownPct: 15,          // TIGHTENED — was 20%
    fallbackCapital: 120,
    takeProfitPct: 900,
  },
  paperMode: false,  // LIVE TRADING — real money
  useTracker: false,  // Disabled: tracker trades hangs (auth issue). Using individual polling instead.
};

export function loadConfig(): BotConfig {
  return { ...DEFAULT_CONFIG };
}
