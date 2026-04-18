// src/versions.ts
// All 18 MK version configs — snapshots of filter/sizing logic at each iteration.
// Each config must exactly match the bot's behavior at that commit.

export interface VersionConfig {
  mk: number;
  codename: string;
  commit: string;
  date: string;
  hypothesis: string;
  description: string;
  status: "retired" | "deployed" | "testing" | "concept";
  tradeAmountUsd: number;
  maxPerMarketPct: number;
  maxDailyExposurePct: number;
  maxSignalsPerHour: number;
  bypassNoiseForProvenWinners: boolean;
  bypassDailyCapForProvenWinners: boolean;
  adaptiveSizing: boolean;
  dedupAcrossTraders: boolean;
  minPrice: number;
  maxPrice: number;
  minTraderAmount: number;
  maxDrawdownPct: number;
  eliteTierEnabled: boolean;
  eliteTraders: string[];
  splitBuyEnabled: boolean;
  provenWinnerStacking: boolean;
  trackedTraderCount: number;
}

const BASE: Omit<VersionConfig, "mk" | "codename" | "commit" | "date" | "hypothesis" | "description" | "status" | "trackedTraderCount"> = {
  tradeAmountUsd: 5,
  maxPerMarketPct: 12,
  maxDailyExposurePct: 40,
  maxSignalsPerHour: 0,
  bypassNoiseForProvenWinners: false,
  bypassDailyCapForProvenWinners: false,
  adaptiveSizing: false,
  dedupAcrossTraders: false,
  minPrice: 0.10,
  maxPrice: 0.85,
  minTraderAmount: 10,
  maxDrawdownPct: 20,
  eliteTierEnabled: false,
  eliteTraders: [],
  splitBuyEnabled: false,
  provenWinnerStacking: false,
};

export const VERSIONS: VersionConfig[] = [
  {
    ...BASE, mk: 1, codename: "Genesis", commit: "3b3a2b7", date: "2026-04-09",
    hypothesis: "Can we detect and replay sharp wallet trades fast enough?",
    description: "Paper trading, basic dashboard, no filters",
    status: "retired", trackedTraderCount: 5,
  },
  {
    ...BASE, mk: 2, codename: "Foundation", commit: "c0c1e79", date: "2026-04-10",
    hypothesis: "Modular architecture enables rapid iteration",
    description: "V2 architecture — executor, config, filters, db, tracker modules",
    status: "retired", trackedTraderCount: 5,
  },
  {
    ...BASE, mk: 3, codename: "Tracker", commit: "cae8821", date: "2026-04-10",
    hypothesis: "More traders = more signals = better coverage",
    description: "Tracker-based detection (Sharbel approach), expand to 15 traders",
    status: "retired", trackedTraderCount: 15,
  },
  {
    ...BASE, mk: 4, codename: "Sentinel", commit: "679d659", date: "2026-04-10",
    hypothesis: "Real-time alerts improve reaction time to issues",
    description: "Telegram alerts for trades and P&L summaries. Same trading logic as MK3.",
    status: "retired", trackedTraderCount: 15,
  },
  {
    ...BASE, mk: 5, codename: "Guardian", commit: "0f420bb", date: "2026-04-15",
    dedupAcrossTraders: true,
    hypothesis: "Limiting exposure reduces drawdown without killing returns",
    description: "Loss-based pause, both-sides dedup, daily cap 40%. First risk controls.",
    status: "retired", trackedTraderCount: 15,
  },
  {
    ...BASE, mk: 6, codename: "Shield", commit: "d3aa599", date: "2026-04-15",
    dedupAcrossTraders: true,
    hypothesis: "Pre-trade balance check prevents failed orders",
    description: "Balance check before real trades, prevent failed trade spam",
    status: "retired", trackedTraderCount: 15,
  },
  {
    ...BASE, mk: 7, codename: "Cashflow", commit: "192c276", date: "2026-04-15",
    dedupAcrossTraders: true,
    hypothesis: "Alerting on cash recovery enables faster response",
    description: "Telegram alert when cash balance recovers. Same trading logic as MK6.",
    status: "retired", trackedTraderCount: 15,
  },
  {
    ...BASE, mk: 8, codename: "Watchdog", commit: "58b222d", date: "2026-04-16",
    dedupAcrossTraders: true,
    hypothesis: "Detecting auth failures prevents silent downtime",
    description: "Detect Bullpen auth expiry and alert via Telegram. Same trading logic as MK6.",
    status: "retired", trackedTraderCount: 15,
  },
  {
    ...BASE, mk: 9, codename: "Oracle", commit: "0e1be38", date: "2026-04-16",
    dedupAcrossTraders: true, adaptiveSizing: true, maxSignalsPerHour: 20,
    hypothesis: "Tracking resolutions + adaptive sizing improves risk-adjusted returns",
    description: "Resolution tracking, per-trader stats, adaptive sizing, 20/hr noise filter",
    status: "retired", trackedTraderCount: 15,
  },
  {
    ...BASE, mk: 10, codename: "Expansion", commit: "dbd686e", date: "2026-04-16",
    dedupAcrossTraders: true, adaptiveSizing: true, maxSignalsPerHour: 20,
    hypothesis: "More high-quality traders = more signal diversity",
    description: "Expand from 15 to 22 traders, top-30 leaderboard picks",
    status: "retired", trackedTraderCount: 22,
  },
  {
    ...BASE, mk: 11, codename: "Vanguard", commit: "55bd9a1", date: "2026-04-16",
    dedupAcrossTraders: true, adaptiveSizing: true, maxSignalsPerHour: 20,
    maxPerMarketPct: 5, bypassNoiseForProvenWinners: true,
    hypothesis: "Proven winners should bypass noise filters — their signals are real",
    description: "Exempt proven-winner traders from noise filter, CLV tracking, safer 5% per-market",
    status: "retired", trackedTraderCount: 22,
  },
  {
    ...BASE, mk: 12, codename: "Uncapped", commit: "263c1a3", date: "2026-04-16",
    dedupAcrossTraders: true, adaptiveSizing: true, maxSignalsPerHour: 20,
    maxPerMarketPct: 5, bypassNoiseForProvenWinners: true,
    maxDailyExposurePct: 75, bypassDailyCapForProvenWinners: true,
    hypothesis: "Higher daily cap + proven winner bypass captures more profitable signals",
    description: "Daily cap 40%→75%, 2x bypass for proven winners",
    status: "retired", trackedTraderCount: 22,
  },
  {
    ...BASE, mk: 13, codename: "Stacker", commit: "96be751", date: "2026-04-16",
    dedupAcrossTraders: true, adaptiveSizing: true, maxSignalsPerHour: 20,
    maxPerMarketPct: 5, bypassNoiseForProvenWinners: true,
    maxDailyExposurePct: 75, bypassDailyCapForProvenWinners: true,
    provenWinnerStacking: true,
    hypothesis: "Allowing proven winners to add to existing positions compounds edge",
    description: "Let proven winners stack into existing positions",
    status: "retired", trackedTraderCount: 22,
  },
  {
    ...BASE, mk: 14, codename: "Elite", commit: "82b3534", date: "2026-04-17",
    dedupAcrossTraders: true, adaptiveSizing: true, maxSignalsPerHour: 20,
    maxPerMarketPct: 5, bypassNoiseForProvenWinners: true,
    maxDailyExposurePct: 75, bypassDailyCapForProvenWinners: true,
    provenWinnerStacking: true,
    eliteTierEnabled: true, eliteTraders: ["0x2a2c"],
    hypothesis: "92%+ win rate traders deserve zero noise filtering + 3x sizing",
    description: "Elite tier — 3x sizing + zero noise filter for 92%+ traders",
    status: "retired", trackedTraderCount: 22,
  },
  {
    ...BASE, mk: 15, codename: "Splitfire", commit: "ceaa2b6", date: "2026-04-17",
    dedupAcrossTraders: true, adaptiveSizing: true, maxSignalsPerHour: 20,
    maxPerMarketPct: 5, bypassNoiseForProvenWinners: true,
    maxDailyExposurePct: 75, bypassDailyCapForProvenWinners: true,
    provenWinnerStacking: true,
    eliteTierEnabled: true, eliteTraders: ["0x2a2c"],
    splitBuyEnabled: true,
    hypothesis: "3x multiplier as 3 separate $5 buys reduces slippage vs 1x $15",
    description: "Split-buy: 3x multiplier = 3 separate $5 buys, not 1x $15",
    status: "retired", trackedTraderCount: 22,
  },
  {
    ...BASE, mk: 16, codename: "Spread", commit: "1bd2a2f", date: "2026-04-17",
    dedupAcrossTraders: true, adaptiveSizing: true, maxSignalsPerHour: 20,
    maxPerMarketPct: 5, bypassNoiseForProvenWinners: true,
    maxDailyExposurePct: 75, bypassDailyCapForProvenWinners: true,
    provenWinnerStacking: true,
    eliteTierEnabled: true, eliteTraders: ["0x2a2c"],
    splitBuyEnabled: false,
    hypothesis: "Spreading across markets is better than stacking same market",
    description: "Revert split-buy, spread across unique markets instead of stacking",
    status: "retired", trackedTraderCount: 22,
  },
  {
    ...BASE, mk: 17, codename: "Sovereign", commit: "78c7b97", date: "2026-04-17",
    dedupAcrossTraders: true, adaptiveSizing: true, maxSignalsPerHour: 20,
    maxPerMarketPct: 5, bypassNoiseForProvenWinners: true,
    maxDailyExposurePct: 75, bypassDailyCapForProvenWinners: true,
    provenWinnerStacking: true,
    eliteTierEnabled: true, eliteTraders: ["0x2a2c", "sovereign2013"],
    hypothesis: "sovereign2013 earned elite tier — 73% WR, +144% avg return",
    description: "sovereign2013 joins elite tier — noise filter removed for both top wallets",
    status: "retired", trackedTraderCount: 22,
  },
  {
    ...BASE, mk: 18, codename: "Clockwork", commit: "2814494", date: "2026-04-18",
    dedupAcrossTraders: true, adaptiveSizing: true, maxSignalsPerHour: 20,
    maxPerMarketPct: 5, bypassNoiseForProvenWinners: true,
    maxDailyExposurePct: 75, bypassDailyCapForProvenWinners: true,
    provenWinnerStacking: true,
    eliteTierEnabled: true, eliteTraders: ["0x2a2c", "sovereign2013"],
    hypothesis: "Circuit breaker reset at 4 AM ET aligns with US sports schedule",
    description: "Circuit breaker resets at 4 AM ET instead of midnight UTC",
    status: "deployed", trackedTraderCount: 22,
  },
];

export function getVersion(mk: number): VersionConfig | undefined {
  return VERSIONS.find(v => v.mk === mk);
}

export function getDeployedVersion(): VersionConfig {
  return VERSIONS.find(v => v.status === "deployed") || VERSIONS[VERSIONS.length - 1];
}
