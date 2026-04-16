// Resolution tracker — queries Polymarket Gamma API for each market we've traded
// and records the final outcome so we can compute win rate, P&L, and trader stats.

import Database from "better-sqlite3";
import { execSync } from "child_process";

const GAMMA_API = "https://gamma-api.polymarket.com";

function httpGet(url: string): any {
  try {
    const stdout = execSync(`curl -sS --max-time 15 '${url}'`, {
      encoding: "utf-8", timeout: 20_000,
    }).trim();
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

export interface MarketResolution {
  slug: string;
  outcome: string;
  resolved: boolean;
  resolvedPrice: number; // final price (1.0 for winner, 0.0 for loser)
  won: boolean;
  category: string;
}

// Polymarket slugs usually start with league code — nba-xxx, nhl-xxx, mlb-xxx, etc.
export function inferCategory(slug: string): string {
  const first = slug.split("-")[0].toLowerCase();
  const knownSports = [
    "nba", "nhl", "mlb", "nfl", "ncaam", "ncaaf",
    "atp", "wta", "ucl", "epl", "mls", "lol", "lib", "sud", "col",
    "fifwc", "uel", "gtm", "lal", "sel", "hl", "tur"
  ];
  if (knownSports.includes(first)) return first;
  if (slug.includes("-election") || slug.includes("-trump") || slug.includes("-biden")) return "politics";
  return "other";
}

export function checkMarketResolution(slug: string, outcome: string): MarketResolution | null {
  // Query Gamma for this specific market (with closed=true to include resolved)
  const data = httpGet(`${GAMMA_API}/markets?slug=${encodeURIComponent(slug)}&closed=true`);
  if (!data) return null;
  const markets = Array.isArray(data) ? data : [data];

  for (const m of markets) {
    // Not closed yet — skip
    if (!m.closed) continue;
    // Parse outcomes and prices
    let outcomes: string[] = [];
    let outcomePrices: string[] = [];
    try {
      outcomes = JSON.parse(m.outcomes);
      outcomePrices = JSON.parse(m.outcomePrices);
    } catch { continue; }

    // Find the outcome we bet on
    const idx = outcomes.findIndex(o => o === outcome);
    if (idx === -1) continue;

    const price = parseFloat(outcomePrices[idx]);
    if (isNaN(price)) continue;

    // Polymarket resolves to 1.0 (won) or 0.0 (lost)
    const won = price >= 0.99;
    return {
      slug,
      outcome,
      resolved: true,
      resolvedPrice: price,
      won,
      category: inferCategory(slug),
    };
  }
  return null;
}

// Scan our database for trades with markets that need resolution checks
export function scanAndRecordResolutions(db: Database.Database, maxPerRun = 40): {
  checked: number;
  newlyResolved: number;
} {
  // Find unique slug:outcome combos we've traded but never resolved.
  // Order by earliest trade — older markets are more likely resolved.
  const rows = db.prepare(`
    SELECT t.slug, t.outcome, MIN(t.timestamp) as first_seen
    FROM trades t
    LEFT JOIN resolutions r ON r.slug = t.slug AND r.outcome = t.outcome
    WHERE r.slug IS NULL AND t.action = 'BUY'
    GROUP BY t.slug, t.outcome
    ORDER BY first_seen ASC
    LIMIT ?
  `).all(maxPerRun) as { slug: string; outcome: string; first_seen: string }[];

  let newlyResolved = 0;
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO resolutions (slug, outcome, resolved_at, resolved_price, won, category, checked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();

  for (const { slug, outcome } of rows) {
    const res = checkMarketResolution(slug, outcome);
    if (res && res.resolved) {
      insertStmt.run(slug, outcome, now, res.resolvedPrice, res.won ? 1 : 0, res.category, now);
      newlyResolved++;
    }
    // Be nice to the API
    execSync("sleep 0.2");
  }

  return { checked: rows.length, newlyResolved };
}

// Get win rate for a specific slug:outcome (returns null if not resolved)
export function getResolution(db: Database.Database, slug: string, outcome: string): any {
  return db.prepare(`SELECT * FROM resolutions WHERE slug = ? AND outcome = ?`).get(slug, outcome);
}
