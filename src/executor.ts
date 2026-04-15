import { execSync } from "child_process";
import { readFileSync } from "fs";
import https from "https";
import http from "http";

// ── Bullpen CLI (used for real trading only) ──────────────────────
const BULLPEN = process.env.BULLPEN_PATH || `${process.env.HOME}/.local/bin/bullpen`;
const CMD_TIMEOUT = 30_000;

// ── Polymarket API (used for data fetching — no Bullpen needed) ──
const DATA_API = "https://data-api.polymarket.com";
const GAMMA_API = "https://gamma-api.polymarket.com";

export interface BullpenResult {
  stdout: string;
  stderr: string;
  success: boolean;
  data: any | null;
  error: string | null;
}

function httpGet(url: string): any {
  try {
    const stdout = execSync(`curl -sS --max-time 15 '${url}'`, {
      encoding: "utf-8",
      timeout: 20_000,
    }).trim();
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

export function parseBullpenOutput(raw: string): any | null {
  const arrStart = raw.indexOf("[");
  const arrEnd = raw.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd > arrStart) {
    try { return JSON.parse(raw.substring(arrStart, arrEnd + 1)); } catch {}
  }
  const objStart = raw.indexOf("{");
  const objEnd = raw.lastIndexOf("}");
  if (objStart !== -1 && objEnd > objStart) {
    try { return JSON.parse(raw.substring(objStart, objEnd + 1)); } catch {}
  }
  return null;
}

export function parseBullpenError(stderr: string): string {
  const match = stderr.match(/Error:\s*(.+)/i);
  return match ? match[1].trim() : stderr.trim();
}

export function bullpenExec(args: string): BullpenResult {
  const stderrFile = `/tmp/bullpen-stderr-${process.pid}.txt`;
  try {
    const stdout = execSync(`${BULLPEN} ${args} 2>${stderrFile}`, {
      encoding: "utf-8",
      timeout: CMD_TIMEOUT,
    }).trim();
    let stderr = "";
    try { stderr = readFileSync(stderrFile, "utf-8").trim(); } catch {}
    return { stdout, stderr, success: true, data: parseBullpenOutput(stdout), error: null };
  } catch (err: any) {
    let stderr = "";
    try { stderr = readFileSync(stderrFile, "utf-8").trim(); } catch {}
    return {
      stdout: err.stdout?.toString() || "",
      stderr,
      success: false,
      data: null,
      error: stderr ? parseBullpenError(stderr) : (err.message || "Unknown error"),
    };
  }
}

// ── Activity polling via Polymarket Data API (no Bullpen needed) ──
export function getTraderActivity(address: string, limit = 10): any[] {
  try {
    const startSec = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
    const url = `${DATA_API}/activity?user=${address}&type=TRADE&limit=${limit}&sortBy=TIMESTAMP&sortDirection=DESC&start=${startSec}`;
    const data = httpGet(url);
    if (!Array.isArray(data)) return [];
    // Normalize field names to match what the bot expects
    return data.map((t: any) => {
      // Normalize epoch timestamps to ISO strings
      let ts = t.timestamp || t.created_at || new Date().toISOString();
      if (typeof ts === "number" || (typeof ts === "string" && /^\d+(\.\d+)?$/.test(ts))) {
        const n = Number(ts);
        ts = n > 1e12 ? new Date(n).toISOString() : new Date(n * 1000).toISOString();
      }
      return {
        proxy_wallet: t.proxy_wallet || t.user || address,
        timestamp: ts,
        slug: t.slug || t.market_slug || "",
        outcome: t.outcome || "",
        side: t.side || t.action || "BUY",
        price: t.price || t.avg_price || "0",
        usdc_size: t.usdc_size || t.size || "0",
        amount: t.amount || t.usdc_size || t.size || "0",
      };
    });
  } catch {
    return [];
  }
}

// ── Price fetching via Gamma API (no Bullpen needed) ──────────────
export function getPrice(slug: string): Map<string, number> {
  const prices = new Map<string, number>();
  try {
    // Try with closed=true to get resolved markets too
    let data = httpGet(`${GAMMA_API}/markets?slug=${slug}&closed=true`);
    if (!data || (Array.isArray(data) && data.length === 0)) {
      data = httpGet(`${GAMMA_API}/markets?slug=${slug}`);
    }
    if (!data) return prices;
    const markets = Array.isArray(data) ? data : [data];
    for (const m of markets) {
      if (m.outcomes && m.outcomePrices) {
        try {
          const outcomes = JSON.parse(m.outcomes);
          const outcomePrices = JSON.parse(m.outcomePrices);
          for (let i = 0; i < outcomes.length; i++) {
            prices.set(outcomes[i], parseFloat(outcomePrices[i]) || 0);
          }
        } catch {}
      }
    }
  } catch {}
  return prices;
}

// ── Balance check (Bullpen CLI) ──────────────────────────────────
export function getBalance(): number | null {
  const result = bullpenExec("polymarket preflight --output json");
  if (!result.success) return null;
  if (result.data) {
    const d = result.data;
    // balance_usd is "$32.82" format
    if (typeof d.balance_usd === "string") {
      const n = parseFloat(d.balance_usd.replace(/[^0-9.]/g, ""));
      if (!isNaN(n)) return n;
    }
    // balance is raw USDC units (6 decimals) as string
    if (d.balance) {
      const raw = parseFloat(d.balance);
      if (!isNaN(raw) && raw > 1000) return raw / 1e6; // raw units
      if (!isNaN(raw)) return raw;
    }
  }
  // Fallback: parse from stdout
  const match = result.stdout.match(/balance_usd["\s:]*"\$?([\d.]+)"/i);
  if (match) return parseFloat(match[1]);
  return null;
}

// ── Real trading functions (still need Bullpen CLI) ───────────────
export function getPositions(): any[] {
  const result = bullpenExec("polymarket positions --output json");
  if (!result.success) return [];
  const data = result.data;
  return data?.positions || (Array.isArray(data) ? data : []);
}

export function buyMarket(slug: string, outcome: string, amount: number): BullpenResult {
  const safeSlug = slug.replace(/'/g, "'\\''");
  const safeOutcome = outcome.replace(/'/g, "'\\''");
  return bullpenExec(`polymarket buy '${safeSlug}' '${safeOutcome}' ${amount} --yes --output json`);
}

export function sellMarket(slug: string, outcome: string, shares: number): BullpenResult {
  const safeSlug = slug.replace(/'/g, "'\\''");
  const safeOutcome = outcome.replace(/'/g, "'\\''");
  return bullpenExec(`polymarket sell '${safeSlug}' '${safeOutcome}' ${shares} --yes --output json`);
}

// ── Tracker functions (Bullpen-dependent, not needed for core bot) ─
export function getTrackerTrades(limit = 20, page = 1): any[] {
  const result = bullpenExec(`tracker trades --output json --limit ${limit} --page ${page}`);
  return Array.isArray(result.data) ? result.data : [];
}

export function followTrader(address: string, tradeThreshold = 10): BullpenResult {
  return bullpenExec(`tracker follow ${address} --notify-trades true --trade-threshold ${tradeThreshold} --output json`);
}

export function getFollowing(): any[] {
  const result = bullpenExec("tracker following --output json");
  return Array.isArray(result.data) ? result.data : [];
}

export function getLeaderboard(period = "week", limit = 25): any[] {
  const result = bullpenExec(`polymarket data leaderboard --period ${period} --limit ${limit} --output json`);
  return Array.isArray(result.data) ? result.data : [];
}

export function getTraderProfile(address: string): any | null {
  const result = bullpenExec(`polymarket data profile ${address} --trades --output json`);
  return result.data;
}

export function redeemResolved(): string | null {
  const result = bullpenExec("polymarket redeem --yes --output json");
  if (result.success && result.stdout && !result.stdout.includes("nothing")) return result.stdout;
  return null;
}
