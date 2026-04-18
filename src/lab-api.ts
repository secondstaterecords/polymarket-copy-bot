// src/lab-api.ts
// API handlers for Suit Lab endpoints — versions, compare, sim signal, performance.

import Database from "better-sqlite3";
import { VERSIONS } from "./versions";

export interface VersionSummary {
  mk: number;
  codename: string;
  date: string;
  description: string;
  status: string;
  hypothesis: string;
  metrics: Record<string, { value: number; sampleSize: number; confidence: string }>;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function buildMetricsMap(
  db: Database.Database,
  mk: number
): Record<string, { value: number; sampleSize: number; confidence: string }> {
  const rows = db.prepare(
    "SELECT metric_name, metric_value, sample_size, confidence FROM sim_metrics WHERE mk = ?"
  ).all(mk) as { metric_name: string; metric_value: number; sample_size: number; confidence: string }[];

  const metrics: Record<string, { value: number; sampleSize: number; confidence: string }> = {};
  for (const r of rows) {
    metrics[r.metric_name] = {
      value: r.metric_value,
      sampleSize: r.sample_size ?? 0,
      confidence: r.confidence ?? "low",
    };
  }
  return metrics;
}

function buildVersionSummaries(db: Database.Database, mks?: number[]): VersionSummary[] {
  const rows = db.prepare("SELECT * FROM version_configs ORDER BY mk ASC").all() as {
    mk: number; codename: string; date: string; description: string;
    status: string; hypothesis: string; config_json: string;
  }[];

  return rows
    .filter(r => !mks || mks.includes(r.mk))
    .map(r => ({
      mk: r.mk,
      codename: r.codename,
      date: r.date,
      description: r.description,
      status: r.status,
      hypothesis: r.hypothesis ?? "",
      metrics: buildMetricsMap(db, r.mk),
    }));
}

// ── exported handlers ─────────────────────────────────────────────────────────

export function getVersions(db: Database.Database): VersionSummary[] {
  return buildVersionSummaries(db);
}

export function getCompare(db: Database.Database, mks: number[]): VersionSummary[] {
  return buildVersionSummaries(db, mks);
}

export function getLatestSimSignal(db: Database.Database): any[] {
  return db.prepare(`
    SELECT sr.signal_id, sr.mk, sr.decision, sr.skip_reason, sr.sim_amount,
           t.trader, t.slug, t.outcome, t.entry_price, t.timestamp
    FROM sim_results sr
    JOIN trades t ON t.id = sr.signal_id
    WHERE sr.signal_id = (SELECT MAX(signal_id) FROM sim_results)
    ORDER BY sr.mk ASC
  `).all();
}

export function getPublicPerformance(db: Database.Database): object {
  // Deployed version
  const deployedRow = db.prepare(
    "SELECT mk, codename FROM version_configs WHERE status = 'deployed' ORDER BY mk DESC LIMIT 1"
  ).get() as { mk: number; codename: string } | undefined;

  const deployedMk = deployedRow?.mk ?? 18;
  const deployedCodename = deployedRow?.codename ?? "Clockwork";

  // Version count
  const versionCount = (db.prepare("SELECT COUNT(*) as c FROM version_configs").get() as any)?.c ?? 0;

  // Win rates: deployed vs MK1
  const getWr = (mk: number): number => {
    const row = db.prepare(
      "SELECT metric_value FROM sim_metrics WHERE mk = ? AND metric_name = 'win_rate'"
    ).get(mk) as { metric_value: number } | undefined;
    return row?.metric_value ?? 0;
  };

  const deployedWr = getWr(deployedMk);
  const mk1Wr = getWr(1);
  const wrImprovement = parseFloat(((deployedWr - mk1Wr) * 100).toFixed(1));
  const currentWinRate = parseFloat((deployedWr * 100).toFixed(1));

  // Sharpe ratio
  const sharpeRow = db.prepare(
    "SELECT metric_value FROM sim_metrics WHERE mk = ? AND metric_name = 'sharpe_ratio'"
  ).get(deployedMk) as { metric_value: number } | undefined;
  const sharpeRatio = parseFloat((sharpeRow?.metric_value ?? 0).toFixed(3));

  // Resolved markets count
  const resolvedRow = db.prepare("SELECT COUNT(*) as c FROM resolutions").get() as any;
  const resolvedMarkets = resolvedRow?.c ?? 0;

  return {
    versionCount,
    deployedMk,
    deployedCodename,
    winRateImprovementPp: wrImprovement,
    currentWinRate,
    sharpeRatio,
    resolvedMarkets,
    generatedAt: new Date().toISOString(),
  };
}

export function getSubscriberPerformance(db: Database.Database): object {
  const pub = getPublicPerformance(db) as any;

  // Version history — all versions with aggregate metrics, no config details
  const versionHistory = buildVersionSummaries(db).map(v => ({
    mk: v.mk,
    codename: v.codename,
    date: v.date,
    description: v.description,
    status: v.status,
    hypothesis: v.hypothesis,
    winRate: v.metrics["win_rate"]?.value ?? null,
    sharpe: v.metrics["sharpe_ratio"]?.value ?? null,
    netPnl: v.metrics["net_pnl"]?.value ?? null,
    tradesPlaced: v.metrics["trades_placed"]?.value ?? null,
    sampleSize: v.metrics["win_rate"]?.sampleSize ?? 0,
    confidence: v.metrics["win_rate"]?.confidence ?? "low",
  }));

  // Anonymized trader leaderboard from deployed version
  const deployedMk = pub.deployedMk as number;
  const traderMetrics = db.prepare(
    "SELECT metric_name, metric_value, sample_size FROM sim_metrics WHERE mk = ? AND metric_name LIKE 'trader_wr_%' ORDER BY metric_value DESC"
  ).all(deployedMk) as { metric_name: string; metric_value: number; sample_size: number }[];

  // Deterministic real-name → WALLET-{A,B,...} mapping (alphabetical by suffix)
  const traderNames = traderMetrics.map(r => r.metric_name.slice("trader_wr_".length));
  const uniqueNames = [...new Set(traderNames)].sort();
  const nameMap = new Map<string, string>();
  uniqueNames.forEach((name, i) => {
    nameMap.set(name, `WALLET-${String.fromCharCode(65 + i)}`);
  });

  const traderLeaderboard = traderMetrics.map(r => {
    const safeName = r.metric_name.slice("trader_wr_".length);
    const alias = nameMap.get(safeName) ?? "WALLET-?";
    const pnlRow = db.prepare(
      "SELECT metric_value FROM sim_metrics WHERE mk = ? AND metric_name = ?"
    ).get(deployedMk, `trader_pnl_${safeName}`) as { metric_value: number } | undefined;
    return {
      wallet: alias,
      winRate: parseFloat((r.metric_value * 100).toFixed(1)),
      netPnl: parseFloat((pnlRow?.metric_value ?? 0).toFixed(2)),
      sampleSize: r.sample_size ?? 0,
    };
  });

  // Category performance from deployed version
  const catMetrics = db.prepare(
    "SELECT metric_name, metric_value, sample_size, confidence FROM sim_metrics WHERE mk = ? AND metric_name LIKE 'category_wr_%' ORDER BY metric_value DESC"
  ).all(deployedMk) as { metric_name: string; metric_value: number; sample_size: number; confidence: string }[];

  const categoryPerformance = catMetrics.map(r => ({
    category: r.metric_name.slice("category_wr_".length),
    winRate: parseFloat((r.metric_value * 100).toFixed(1)),
    sampleSize: r.sample_size ?? 0,
    confidence: r.confidence ?? "low",
  }));

  return {
    ...pub,
    versionHistory,
    traderLeaderboard,
    categoryPerformance,
  };
}
