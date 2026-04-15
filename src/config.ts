export interface TraderConfig {
  name: string;
  address: string;
  categories?: string[];
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

// Top 15 active traders this week by P&L (from bullpen polymarket data leaderboard --period week)
// Filtered: positive P&L, volume > $0 (actively trading)
// Last updated: 2026-04-10
export const DEFAULT_TRADERS: TraderConfig[] = [
  { name: "0x4924", address: "0x492442eab586f242b53bda933fd5de859c8a3782", categories: ["sports"] },
  { name: "beachboy4", address: "0xc2e7800b5af46e6093872b177b7a5e7f0563be51", categories: ["sports"] },
  { name: "Countryside", address: "0xbddf61af533ff524d27154e589d2d7a81510c684", categories: ["sports"] },
  { name: "RN1", address: "0x2005d16a84ceefa912d4e380cd32e7ff827875ea", categories: ["sports", "politics"] },
  { name: "sovereign2013", address: "0xee613b3fc183ee44f9da9c05f53e2da107e3debf", categories: ["politics"] },
  { name: "0x2a2c", address: "0x2a2c53bd278c04da9962fcf96490e17f3dfb9bc1", categories: ["sports"] },
  { name: "texaskid", address: "0xc8075693f48668a264b9fa313b47f52712fcc12b", categories: ["sports"] },
  { name: "swisstony", address: "0x204f72f35326db932158cba6adff0b9a1da95e14", categories: ["sports"] },
  { name: "mhh29", address: "0x63a51cbb37341837b873bc29d05f482bc2988e33" },
  { name: "JPMorgan101", address: "0xb6d6e99d3bfe055874a04279f659f009fd57be17" },
  { name: "elkmonkey", address: "0xead152b855effa6b5b5837f53b24c0756830c76a" },
  { name: "kch123", address: "0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee" },
  { name: "Mentallyillgambld", address: "0x2b3ff45c91540e46fae1e0c72f61f4b049453446", categories: ["sports"] },
  { name: "bcda", address: "0xb45a797faa52b0fd8adc56d30382022b7b12192c", categories: ["sports"] },
  { name: "weflyhigh", address: "0x03e8a544e97eeff5753bc1e90d46e5ef22af1697" },
];

export const DEFAULT_CONFIG: BotConfig = {
  pollIntervalMs: 30_000,
  bullpenPath: process.env.BULLPEN_PATH || `${process.env.HOME}/.local/bin/bullpen`,
  botPort: parseInt(process.env.BOT_PORT || "3847"),
  dashboardPort: parseInt(process.env.DASHBOARD_PORT || "3848"),
  dataDir: process.env.DATA_DIR || ".",
  traders: DEFAULT_TRADERS,
  filters: {
    minPrice: 0.10,
    maxPrice: 0.85,
    minTraderAmount: 10,
    maxDaysToResolution: 30,
    minHoursToResolution: 2,
    requireMultiWallet: false,
    multiWalletWindow: 30,
    newPositionsOnly: true,
    maxTraderSignalsPerHour: 20,  // Traders sending 20+ signals/hr are algorithmic noise
    dedupAcrossTraders: true,     // Only one position per market across all traders
  },
  risk: {
    tradeAmountUsd: 5,           // Fixed $5 per trade — small bets, more diversification
    maxPerMarketPct: 12,         // Max 12% of total capital on one market
    maxDailyExposurePct: 40,     // V2 gets 40% of total capital (safer bot gets more)
    maxDrawdownPct: 20,          // Circuit breaker at 20% drawdown from daily high
    fallbackCapital: 120,        // Fallback if balance check fails (your deposit amount)
    takeProfitPct: 900,          // Auto-sell when position is up 900%+ (10x the buy-in — safety net only)
  },
  paperMode: false,  // LIVE TRADING — real money
  useTracker: false,  // Disabled: tracker trades hangs (auth issue). Using individual polling instead.
};

export function loadConfig(): BotConfig {
  return { ...DEFAULT_CONFIG };
}
