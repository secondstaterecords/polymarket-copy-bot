import Database from "better-sqlite3";
import { join } from "path";

export function createDb(dataDir: string): Database.Database {
  const db = new Database(join(dataDir, "copybot.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      trader TEXT NOT NULL,
      trader_address TEXT NOT NULL,
      action TEXT NOT NULL,
      market TEXT,
      slug TEXT NOT NULL,
      outcome TEXT NOT NULL,
      trader_amount REAL,
      our_amount REAL,
      entry_price REAL,
      paper_shares REAL,
      status TEXT NOT NULL,
      error TEXT,
      result TEXT,
      is_real INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_trades_slug ON trades(slug, outcome);
    CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
    CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp);

    -- Resolution tracking: one row per slug:outcome once Polymarket resolves it
    CREATE TABLE IF NOT EXISTS resolutions (
      slug TEXT NOT NULL,
      outcome TEXT NOT NULL,
      resolved_at TEXT NOT NULL,
      resolved_price REAL NOT NULL,
      won INTEGER NOT NULL,
      category TEXT,
      checked_at TEXT NOT NULL,
      PRIMARY KEY (slug, outcome)
    );
    CREATE INDEX IF NOT EXISTS idx_resolutions_resolved_at ON resolutions(resolved_at);

    -- Per-trader rolling stats — updated by trader-stats.ts
    CREATE TABLE IF NOT EXISTS trader_stats (
      trader TEXT PRIMARY KEY,
      total_trades INTEGER NOT NULL DEFAULT 0,
      resolved_trades INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      win_rate REAL NOT NULL DEFAULT 0,
      avg_return_pct REAL NOT NULL DEFAULT 0,
      avg_clv_pct REAL NOT NULL DEFAULT 0,
      expected_value REAL NOT NULL DEFAULT 0,
      best_category TEXT,
      best_category_wr REAL,
      size_multiplier REAL NOT NULL DEFAULT 1.0,
      updated_at TEXT NOT NULL
    );
  `);
  // Migrations for existing DBs
  try { db.exec("ALTER TABLE trader_stats ADD COLUMN avg_clv_pct REAL NOT NULL DEFAULT 0"); } catch {}
  return db;
}

export function insertTrade(db: Database.Database, trade: {
  timestamp: string; trader: string; traderAddress: string; action: string;
  market: string; slug: string; outcome: string; traderAmount: number;
  ourAmount: number; entryPrice: number; paperShares: number; status: string;
  error?: string; result?: string; isReal: boolean;
}): void {
  db.prepare(`
    INSERT INTO trades (timestamp, trader, trader_address, action, market, slug, outcome,
      trader_amount, our_amount, entry_price, paper_shares, status, error, result, is_real)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(trade.timestamp, trade.trader, trade.traderAddress, trade.action,
    trade.market, trade.slug, trade.outcome, trade.traderAmount,
    trade.ourAmount, trade.entryPrice, trade.paperShares, trade.status,
    trade.error || null, trade.result || null, trade.isReal ? 1 : 0);
}

export function getTrades(db: Database.Database, opts?: {
  limit?: number; status?: string; isReal?: boolean;
}): any[] {
  let sql = "SELECT * FROM trades WHERE 1=1";
  const params: any[] = [];
  if (opts?.status) { sql += " AND status = ?"; params.push(opts.status); }
  if (opts?.isReal !== undefined) { sql += " AND is_real = ?"; params.push(opts.isReal ? 1 : 0); }
  sql += " ORDER BY id DESC";
  if (opts?.limit) { sql += " LIMIT ?"; params.push(opts.limit); }
  return db.prepare(sql).all(...params);
}

export function getMarketExposure(db: Database.Database): Map<string, number> {
  const rows = db.prepare(`
    SELECT slug || ':' || outcome AS key,
      SUM(CASE WHEN action = 'BUY' THEN our_amount ELSE 0 END) -
      SUM(CASE WHEN action = 'SELL' THEN our_amount ELSE 0 END) AS exposure
    FROM trades WHERE status IN ('success', 'paper')
    GROUP BY slug, outcome
  `).all() as any[];
  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.exposure > 0) map.set(row.key, row.exposure);
  }
  return map;
}

export function getActiveMarkets(db: Database.Database): Set<string> {
  // Only include markets where we have buys but NO corresponding sells
  const rows = db.prepare(`
    SELECT slug || ':' || outcome AS key
    FROM trades WHERE status IN ('success', 'paper')
    GROUP BY slug, outcome
    HAVING SUM(CASE WHEN action = 'BUY' THEN 1 ELSE 0 END) > SUM(CASE WHEN action = 'SELL' THEN 1 ELSE 0 END)
  `).all() as any[];
  return new Set(rows.map(r => r.key));
}

export function getDailyExposure(db: Database.Database): number {
  const today = new Date().toISOString().split("T")[0];
  const buys = db.prepare(`
    SELECT COALESCE(SUM(our_amount), 0) AS total
    FROM trades WHERE action = 'BUY' AND status IN ('success', 'paper') AND timestamp >= ?
  `).get(today + "T00:00:00.000Z") as any;
  const sells = db.prepare(`
    SELECT COALESCE(SUM(our_amount), 0) AS total
    FROM trades WHERE action = 'SELL' AND status IN ('success', 'paper') AND timestamp >= ?
  `).get(today + "T00:00:00.000Z") as any;
  return Math.max(0, (buys?.total || 0) - (sells?.total || 0));
}
