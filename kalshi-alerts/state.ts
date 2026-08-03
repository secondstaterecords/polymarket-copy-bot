// Tiny SQLite state store (better-sqlite3 + WAL), matching src/db.ts conventions.
// Tracks who we're watching + which trades we've already alerted on (dedup across restarts).

import Database from "better-sqlite3";
import { join } from "path";
import { mkdirSync } from "fs";
import type { RankedTrader } from "./ranker";

export function openState(dataDir: string): Database.Database {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dataDir, "kalshi-alerts.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracked_traders (
      user_id      TEXT PRIMARY KEY,
      username     TEXT NOT NULL,
      pct_metric   REAL NOT NULL,
      profit_usd   REAL NOT NULL,
      volume_usd   REAL NOT NULL,
      rank         INTEGER NOT NULL,
      updated_at   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS seen_trades (
      trade_id  TEXT PRIMARY KEY,
      user_id   TEXT NOT NULL,
      ts        INTEGER NOT NULL,
      seen_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_seen_user ON seen_trades(user_id);
  `);
  return db;
}

/** Replace the tracked set with the new top-N; return the added + dropped traders. */
export function updateTrackedSet(
  db: Database.Database,
  ranked: RankedTrader[],
  nowIso: string,
): { added: RankedTrader[]; dropped: { userId: string; username: string }[] } {
  const prevRows = db.prepare("SELECT user_id, username FROM tracked_traders").all() as any[];
  const prev = new Set<string>(prevRows.map((r) => r.user_id));
  const nextIds = new Set(ranked.map((r) => r.userId));

  const upsert = db.prepare(`
    INSERT INTO tracked_traders (user_id, username, pct_metric, profit_usd, volume_usd, rank, updated_at)
    VALUES (@userId, @username, @pctMetric, @profitUsd, @volumeUsd, @rank, @updatedAt)
    ON CONFLICT(user_id) DO UPDATE SET
      username=@username, pct_metric=@pctMetric, profit_usd=@profitUsd,
      volume_usd=@volumeUsd, rank=@rank, updated_at=@updatedAt
  `);
  const del = db.prepare("DELETE FROM tracked_traders WHERE user_id = ?");

  const tx = db.transaction(() => {
    for (const r of ranked) {
      upsert.run({ ...r, updatedAt: nowIso });
    }
    for (const id of prev) {
      if (!nextIds.has(id)) del.run(id);
    }
  });
  tx();

  const added = ranked.filter((r) => !prev.has(r.userId));
  const dropped = prevRows
    .filter((r) => !nextIds.has(r.user_id))
    .map((r) => ({ userId: r.user_id, username: r.username }));
  return { added, dropped };
}

export function getTracked(db: Database.Database): RankedTrader[] {
  return (db.prepare("SELECT * FROM tracked_traders ORDER BY pct_metric DESC").all() as any[]).map(
    (r) => ({
      userId: r.user_id,
      username: r.username,
      pctMetric: r.pct_metric,
      profitUsd: r.profit_usd,
      volumeUsd: r.volume_usd,
      settledTrades: 0,
      rank: r.rank,
    }),
  );
}

export function isTradeSeen(db: Database.Database, tradeId: string): boolean {
  return !!db.prepare("SELECT 1 FROM seen_trades WHERE trade_id = ?").get(tradeId);
}

export function markTradeSeen(
  db: Database.Database,
  tradeId: string,
  userId: string,
  ts: number,
  nowIso: string,
): void {
  db.prepare(
    "INSERT OR IGNORE INTO seen_trades (trade_id, user_id, ts, seen_at) VALUES (?, ?, ?, ?)",
  ).run(tradeId, userId, ts, nowIso);
}
