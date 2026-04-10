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
  `);
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
    SELECT slug || ':' || outcome AS key, SUM(our_amount) AS exposure
    FROM trades WHERE action = 'BUY' AND status IN ('success', 'paper')
    GROUP BY slug, outcome
  `).all() as any[];
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.key, row.exposure);
  return map;
}

export function getDailyExposure(db: Database.Database): number {
  const today = new Date().toISOString().split("T")[0];
  const row = db.prepare(`
    SELECT COALESCE(SUM(our_amount), 0) AS total
    FROM trades WHERE action = 'BUY' AND status IN ('success', 'paper') AND timestamp >= ?
  `).get(today + "T00:00:00.000Z") as any;
  return row?.total || 0;
}
