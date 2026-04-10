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
}

export interface RiskConfig {
  tradeAmountUsd: number;
  maxPerMarket: number;
  maxDailyExposure: number;
  maxDrawdownPct: number;
  maxBalancePct: number;
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
}

export const DEFAULT_TRADERS: TraderConfig[] = [
  { name: "0x4924", address: "0x492442eab586f242b53bda933fd5de859c8a3782", categories: ["sports"] },
  { name: "beachboy4", address: "0xc2e7800b5af46e6093872b177b7a5e7f0563be51", categories: ["sports"] },
  { name: "0x2a2c", address: "0x2a2c53bd278c04da9962fcf96490e17f3dfb9bc1", categories: ["sports"] },
  { name: "Countryside", address: "0xbddf61af533ff524d27154e589d2d7a81510c684", categories: ["sports"] },
  { name: "RN1", address: "0x2005d16a84ceefa912d4e380cd32e7ff827875ea", categories: ["sports", "politics"] },
  { name: "sovereign2013", address: "0xee613b3fc183ee44f9da9c05f53e2da107e3debf", categories: ["politics"] },
  { name: "swisstony", address: "0x204f72f35326db932158cba6adff0b9a1da95e14", categories: ["sports"] },
  { name: "Mentallyillgambld", address: "0x2b3ff45c91540e46fae1e0c72f61f4b049453446", categories: ["sports"] },
  { name: "bcda", address: "0xb45a797faa52b0fd8adc56d30382022b7b12192c", categories: ["sports"] },
  { name: "texaskid", address: "0xc8075693f48668a264b9fa313b47f52712fcc12b", categories: ["sports"] },
];

export const DEFAULT_CONFIG: BotConfig = {
  pollIntervalMs: 30_000,
  bullpenPath: process.env.BULLPEN_PATH || "bullpen",
  botPort: parseInt(process.env.BOT_PORT || "3847"),
  dashboardPort: parseInt(process.env.DASHBOARD_PORT || "3848"),
  dataDir: process.env.DATA_DIR || ".",
  traders: DEFAULT_TRADERS,
  filters: {
    minPrice: 0.10,
    maxPrice: 0.85,
    minTraderAmount: 50,
    maxDaysToResolution: 30,
    minHoursToResolution: 2,
    requireMultiWallet: false,
    multiWalletWindow: 30,
    newPositionsOnly: true,
  },
  risk: {
    tradeAmountUsd: 5,
    maxPerMarket: 25,
    maxDailyExposure: 200,
    maxDrawdownPct: 20,
    maxBalancePct: 5,
  },
  paperMode: true,
};

export function loadConfig(): BotConfig {
  return { ...DEFAULT_CONFIG };
}
