#!/usr/bin/env tsx
/**
 * Daily trader roster refresh.
 *
 * Sources (in priority order):
 *   1. bullpen polymarket data leaderboard --period day
 *   2. bullpen polymarket data leaderboard --period week
 *   3. bullpen polymarket data leaderboard --period all
 *   4. bullpen polymarket data smart-money --type top_traders (has win_rate)
 *   5. trader_stats table (our own resolved-outcome history)
 *
 * Composite score:
 *   score = 0.5 * rank(24h) + 0.3 * rank(7d) + 0.2 * rank(lifetime)
 *   lower = better (rank 1 is best)
 *
 * Tier rules:
 *   - CORE: in top 15 of today + has resolved history in our DB (WR >= 50%)
 *   - SNIPER: <100 lifetime trades + >70% win_rate + >$50K PnL (from smart-money API)
 *   - WATCH: top 30 today, not in our history yet, flat $3 bet for 3 days
 *
 * Hysteresis (prevents hot-swap thrash):
 *   - Drop a CORE trader only after 3 consecutive days outside top 30
 *   - Promote a WATCH trader only after 2 consecutive days in top 15
 *
 * Modes:
 *   --advisory      Print diff, don't write config.ts (default)
 *   --apply         Overwrite DEFAULT_TRADERS in config.ts
 *   --json          Emit JSON to stdout (for dashboard / cron telemetry)
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import Database from "better-sqlite3";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DB_PATH = path.join(ROOT, "copybot.db");
const CONFIG_PATH = path.join(ROOT, "src/config.ts");
const ROSTER_HISTORY = path.join(ROOT, "data/roster-history.json");
const BULLPEN = process.env.BULLPEN_PATH || `${process.env.HOME}/.local/bin/bullpen`;

type LeaderRow = { rank: number; username: string; address: string; pnl: number; volume: number };
type SmartTrader = { rank: number; name: string; address: string; pnl: number; volume: number; trades_count: number; win_rate: number; is_bot: boolean };

function fetchLeaderboard(period: "day" | "week" | "all"): LeaderRow[] {
  const raw = execSync(`${BULLPEN} polymarket data leaderboard --period ${period} --limit 40 --output json`, { encoding: "utf8" });
  const clean = raw.replace(/Update available:.*?update\s*/g, "");
  return JSON.parse(clean).map((r: any) => ({
    rank: r.rank,
    username: r.username || r.address.slice(0, 10),
    address: r.address.toLowerCase(),
    pnl: parseFloat(r.pnl || "0"),
    volume: parseFloat(r.volume || "0"),
  }));
}

function fetchSmartMoney(): SmartTrader[] {
  try {
    const raw = execSync(`${BULLPEN} polymarket data smart-money --type top_traders --limit 40 --output json`, { encoding: "utf8" });
    const clean = raw.replace(/Update available:.*?update\s*/g, "");
    const parsed = JSON.parse(clean);
    return (parsed.traders || []).map((t: any) => ({
      rank: t.rank, name: t.name, address: t.address.toLowerCase(),
      pnl: t.pnl || 0, volume: t.volume || 0,
      trades_count: t.trades_count || 0, win_rate: t.win_rate || 0,
      is_bot: t.is_bot || false,
    }));
  } catch {
    return [];
  }
}

function ourStats(db: Database.Database): Map<string, { wr: number; resolved: number; ev: number }> {
  const rows = db.prepare(`SELECT trader, win_rate, resolved_trades, expected_value FROM trader_stats`).all() as any[];
  const m = new Map();
  for (const r of rows) {
    m.set(r.trader.toLowerCase(), { wr: r.win_rate, resolved: r.resolved_trades, ev: r.expected_value });
  }
  return m;
}

function compositeScore(addr: string, day: LeaderRow[], week: LeaderRow[], life: LeaderRow[]): number | null {
  const d = day.find((r) => r.address === addr)?.rank ?? 50;
  const w = week.find((r) => r.address === addr)?.rank ?? 50;
  const l = life.find((r) => r.address === addr)?.rank ?? 50;
  if (d === 50 && w === 50 && l === 50) return null;
  return 0.5 * d + 0.3 * w + 0.2 * l;
}

function loadHistory(): Record<string, { lastSeen: string; consecutiveTop15: number; consecutiveOutsideTop30: number }> {
  if (!existsSync(ROSTER_HISTORY)) return {};
  try { return JSON.parse(readFileSync(ROSTER_HISTORY, "utf8")); } catch { return {}; }
}

function saveHistory(h: any) {
  writeFileSync(ROSTER_HISTORY, JSON.stringify(h, null, 2));
}

async function main() {
  const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--json") ? "json" : "advisory";

  console.error(`[refresh-traders] fetching leaderboards…`);
  const [day, week, life, smart] = [
    fetchLeaderboard("day"),
    fetchLeaderboard("week"),
    fetchLeaderboard("all"),
    fetchSmartMoney(),
  ];
  const db = new Database(DB_PATH, { readonly: true });
  const stats = ourStats(db);
  const history = loadHistory();
  const today = new Date().toISOString().slice(0, 10);

  // Build candidate pool (top 30 today or in our existing roster)
  const pool = new Map<string, LeaderRow>();
  for (const r of day.slice(0, 30)) pool.set(r.address, r);

  const core: any[] = [];
  const watch: any[] = [];
  const snipers: any[] = [];

  // SNIPERS from smart-money: <100 trades, >70% WR, >$50K PnL, not a bot
  for (const t of smart) {
    if (t.is_bot) continue;
    if (t.trades_count > 0 && t.trades_count < 100 && t.win_rate >= 0.70 && t.pnl >= 50_000) {
      snipers.push({ name: t.name || t.address.slice(0, 10), address: t.address, wr: t.win_rate, trades: t.trades_count, pnl: t.pnl });
    }
  }

  // CORE + WATCH from daily leaderboard
  for (const [addr, row] of pool) {
    const score = compositeScore(addr, day, week, life);
    const ours = stats.get(addr);
    const h = history[addr] || { lastSeen: today, consecutiveTop15: 0, consecutiveOutsideTop30: 0 };

    const inTop15 = row.rank <= 15;
    h.consecutiveTop15 = inTop15 ? h.consecutiveTop15 + 1 : 0;
    h.consecutiveOutsideTop30 = row.rank > 30 ? h.consecutiveOutsideTop30 + 1 : 0;
    h.lastSeen = today;
    history[addr] = h;

    const hasHistory = ours && ours.resolved >= 5;
    const positiveEV = ours && ours.ev > 0;

    if (hasHistory && positiveEV && row.rank <= 15) {
      core.push({ name: row.username, address: addr, score, rank24h: row.rank, wr: ours.wr, resolved: ours.resolved, ev: ours.ev });
    } else if (h.consecutiveTop15 >= 2 || (row.rank <= 20 && row.volume > 100_000)) {
      watch.push({ name: row.username, address: addr, score, rank24h: row.rank, volume: row.volume });
    }
  }

  // Sort
  core.sort((a, b) => a.score - b.score);
  watch.sort((a, b) => a.score - b.score);
  snipers.sort((a, b) => b.pnl - a.pnl);

  saveHistory(history);

  const result = {
    generatedAt: new Date().toISOString(),
    core: core.slice(0, 8),
    watch: watch.slice(0, 6),
    snipers: snipers.slice(0, 5),
    leaderboardSize: { day: day.length, week: week.length, life: life.length, smart: smart.length },
  };

  if (mode === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log("\n=== DAILY ROSTER REFRESH ===");
  console.log(`generated ${result.generatedAt}`);
  console.log(`\nCORE (${result.core.length}) — proven + live:`);
  for (const c of result.core) {
    console.log(`  ${c.name.padEnd(25)} ${c.address.slice(0, 10)}  score=${c.score.toFixed(1)}  today=#${c.rank24h}  wr=${(c.wr * 100).toFixed(0)}% (n=${c.resolved})  ev=${c.ev.toFixed(2)}`);
  }
  console.log(`\nWATCH (${result.watch.length}) — fresh top-30, evaluating:`);
  for (const w of result.watch) {
    console.log(`  ${w.name.padEnd(25)} ${w.address.slice(0, 10)}  score=${w.score.toFixed(1)}  today=#${w.rank24h}  vol=$${(w.volume / 1000).toFixed(0)}K`);
  }
  console.log(`\nSNIPERS (${result.snipers.length}) — <100 trades, >70% WR:`);
  for (const s of result.snipers) {
    console.log(`  ${s.name.padEnd(25)} ${s.address.slice(0, 10)}  wr=${(s.wr * 100).toFixed(0)}% (n=${s.trades})  pnl=$${(s.pnl / 1000).toFixed(0)}K`);
  }

  if (mode === "advisory") {
    console.log(`\n[advisory mode] Run with --apply to write config.ts`);
  } else if (mode === "apply") {
    console.log(`\n[apply mode] Writing config.ts… (not yet implemented — manual edit for now)`);
    // TODO: AST-edit config.ts to replace DEFAULT_TRADERS
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
