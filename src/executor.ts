import { execSync } from "child_process";
import { readFileSync } from "fs";

const BULLPEN = process.env.BULLPEN_PATH || "bullpen";
const CMD_TIMEOUT = 30_000;

export interface BullpenResult {
  stdout: string;
  stderr: string;
  success: boolean;
  data: any | null;
  error: string | null;
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

export function getTraderActivity(address: string, limit = 10): any[] {
  const result = bullpenExec(`polymarket activity --address ${address} --type trade --limit ${limit} --output json`);
  return Array.isArray(result.data) ? result.data : [];
}

export function getPositions(): any[] {
  const result = bullpenExec("polymarket positions --output json");
  if (!result.success) return [];
  const data = result.data;
  return data?.positions || (Array.isArray(data) ? data : []);
}

export function buyMarket(slug: string, outcome: string, amount: number): BullpenResult {
  return bullpenExec(`polymarket buy ${slug} "${outcome}" ${amount} --yes --output json`);
}

export function sellMarket(slug: string, outcome: string, shares: number): BullpenResult {
  return bullpenExec(`polymarket sell ${slug} "${outcome}" ${shares} --yes --output json`);
}

export function getPrice(slug: string): Map<string, number> {
  const prices = new Map<string, number>();
  const result = bullpenExec(`polymarket price ${slug} --output json`);
  if (!result.success || !result.data) return prices;
  // data might be the outcomes array directly, or an object with .outcomes
  const outcomes = Array.isArray(result.data) ? result.data : (result.data.outcomes || []);
  for (const o of outcomes) {
    prices.set(o.outcome, parseFloat(o.midpoint || o.last_trade || "0"));
  }
  return prices;
}

// ── Tracker-based detection (Sharbel approach) ─────────────────────
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

// ── Leaderboard ────────────────────────────────────────────────────
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
