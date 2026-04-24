// src/sim-engine.ts
// Evaluates each incoming signal against all MK version configs.
// Records per-version decisions to sim_results table.
// Maintains virtual portfolios per version — including sell handling and drawdown tracking.

import Database from "better-sqlite3";
import { VERSIONS, VersionConfig } from "./versions";
import { TradeSignal } from "./filters";
import { insertSimResult, insertSimPortfolioSnapshot } from "./db";

interface VirtualPortfolio {
  mk: number;
  cash: number;
  positions: Map<string, { shares: number; entry: number; amount: number; slug: string; outcome: string }>;
  dailySpend: Map<string, number>;
  signalsByHour: Map<string, number[]>;
  // Per-MK drawdown tracking — mirrors bot.ts circuit-breaker logic in paper.
  dailyHighWaterMark: number;
  lastDrawdownReset: string;
  circuitBreakerTripped: boolean;
}

const portfolios = new Map<number, VirtualPortfolio>();
const STARTING_CAPITAL = 250;

function getOrCreatePortfolio(mk: number): VirtualPortfolio {
  if (!portfolios.has(mk)) {
    portfolios.set(mk, {
      mk,
      cash: STARTING_CAPITAL,
      positions: new Map(),
      dailySpend: new Map(),
      signalsByHour: new Map(),
      dailyHighWaterMark: 0,
      lastDrawdownReset: "",
      circuitBreakerTripped: false,
    });
  }
  return portfolios.get(mk)!;
}

// Normalize a slug for fuzzy matching: lowercase + strip trailing -digits
// groups (Bullpen sometimes appends -NNN hashes). Mirrors bot.ts:313.
function normalizeSlug(s: string): string {
  return (s || "").replace(/-\d+(-\d+)*$/, "").toLowerCase();
}

// Current-day key for drawdown reset (4 AM ET = 8 AM UTC, matches bot.ts:576)
function currentDayKey(): string {
  const now = new Date();
  const resetHour = 8;
  const d = now.getUTCHours() >= resetHour
    ? now
    : new Date(now.getTime() - 86400000);
  return d.toISOString().split("T")[0];
}

// Update drawdown state and return whether circuit breaker is currently tripped.
function updateDrawdown(portfolio: VirtualPortfolio, version: VersionConfig): boolean {
  let positionsValue = 0;
  for (const pos of portfolio.positions.values()) positionsValue += pos.amount;
  const equity = portfolio.cash + positionsValue;

  const dayKey = currentDayKey();
  if (dayKey !== portfolio.lastDrawdownReset) {
    portfolio.lastDrawdownReset = dayKey;
    portfolio.dailyHighWaterMark = equity;
    portfolio.circuitBreakerTripped = false;
  }
  if (equity > portfolio.dailyHighWaterMark) portfolio.dailyHighWaterMark = equity;

  const drawdownFromHwm = portfolio.dailyHighWaterMark - equity;
  const maxDrawdown = (version.maxDrawdownPct / 100) * STARTING_CAPITAL;
  if (drawdownFromHwm > maxDrawdown && !portfolio.circuitBreakerTripped) {
    portfolio.circuitBreakerTripped = true;
  } else if (portfolio.circuitBreakerTripped && drawdownFromHwm <= maxDrawdown * 0.5) {
    portfolio.circuitBreakerTripped = false;
  }
  return portfolio.circuitBreakerTripped;
}

// Sell-match result. reason encodes match type for analysis.
type SellResult =
  | { sold: true; type: "exact" | "fuzzy"; shares: number; proceeds: number }
  | { sold: false; type: "no-position" | "miss" };

function tryMatchSell(
  portfolio: VirtualPortfolio,
  version: VersionConfig,
  signal: TradeSignal,
): SellResult {
  const exactKey = `${signal.slug}:${signal.outcome}`;
  const exact = portfolio.positions.get(exactKey);
  if (exact) {
    const proceeds = exact.shares * signal.price;
    portfolio.cash += proceeds;
    portfolio.positions.delete(exactKey);
    return { sold: true, type: "exact", shares: exact.shares, proceeds };
  }

  // Older MKs give up here — exact miss = no sell.
  if (!version.mirrorSellFuzzyMatch) {
    // Check if we have ANY position on this outcome with different slug.
    // If yes, MK21-fix would recover it; older MKs don't — record as miss.
    for (const [k, pos] of portfolio.positions.entries()) {
      if (pos.outcome === signal.outcome && normalizeSlug(pos.slug) === normalizeSlug(signal.slug)) {
        return { sold: false, type: "miss" };
      }
    }
    return { sold: false, type: "no-position" };
  }

  // MK21+: fuzzy match on normalized slug + outcome
  const normTarget = normalizeSlug(signal.slug);
  for (const [k, pos] of portfolio.positions.entries()) {
    if (pos.outcome !== signal.outcome) continue;
    if (normalizeSlug(pos.slug) === normTarget) {
      const proceeds = pos.shares * signal.price;
      portfolio.cash += proceeds;
      portfolio.positions.delete(k);
      return { sold: true, type: "fuzzy", shares: pos.shares, proceeds };
    }
  }
  return { sold: false, type: "no-position" };
}

function evaluateSignal(
  signal: TradeSignal,
  version: VersionConfig,
  portfolio: VirtualPortfolio,
  traderEv: Map<string, { expectedValue: number; confidence: string }>,
): { decision: "trade" | "skip"; reason: string; amount: number } {

  if (signal.side === "SELL") {
    // Sells are handled in simulateSignal via tryMatchSell; evaluateSignal just
    // records that a sell signal was processed — the action/reason is filled in
    // by the caller based on match outcome.
    return { decision: "trade", reason: "sell-pending-match", amount: 0 };
  }

  // Circuit-breaker check — blocks new buys when drawdown exceeds maxDrawdownPct.
  if (updateDrawdown(portfolio, version)) {
    return { decision: "skip", reason: "circuit-breaker: daily drawdown exceeded", amount: 0 };
  }

  const ev = traderEv.get(signal.traderName);
  const isElite = version.eliteTierEnabled && version.eliteTraders.includes(signal.traderName);
  const isProvenWinner = ev && ev.confidence !== "low" && parseFloat(String(ev.expectedValue)) > 0.1;

  if (signal.price < version.minPrice)
    return { decision: "skip", reason: `price ${signal.price} below min ${version.minPrice}`, amount: 0 };
  if (signal.price > version.maxPrice)
    return { decision: "skip", reason: `price ${signal.price} above max ${version.maxPrice}`, amount: 0 };

  if (signal.traderAmount < version.minTraderAmount)
    return { decision: "skip", reason: `trader amount $${signal.traderAmount} below min $${version.minTraderAmount}`, amount: 0 };

  if (version.maxSignalsPerHour > 0 && !isElite) {
    const hour = Math.floor(Date.now() / (60 * 60 * 1000));
    const hours = portfolio.signalsByHour.get(signal.traderName) || [];
    const thisHourCount = hours.filter(h => h === hour).length;
    const limit = (version.bypassNoiseForProvenWinners && isProvenWinner)
      ? version.maxSignalsPerHour * 3
      : version.maxSignalsPerHour;
    if (thisHourCount >= limit)
      return { decision: "skip", reason: `noise: ${signal.traderName} ${thisHourCount}/${limit} signals/hr`, amount: 0 };
  }

  const marketKey = `${signal.slug}:${signal.outcome}`;
  if (version.dedupAcrossTraders && portfolio.positions.has(marketKey)) {
    if (!(version.provenWinnerStacking && isProvenWinner))
      return { decision: "skip", reason: `dedup: already hold ${marketKey}`, amount: 0 };
  }

  let amount = version.tradeAmountUsd;
  if (version.adaptiveSizing && ev) {
    const mult = Math.max(0.5, Math.min(2.0, parseFloat(String(ev.expectedValue)) + 0.5));
    amount = version.tradeAmountUsd * mult;
  }

  const marketCap = (version.maxPerMarketPct / 100) * STARTING_CAPITAL;
  const currentMarketSpend = portfolio.positions.get(marketKey)?.amount || 0;
  if (currentMarketSpend + amount > marketCap)
    return { decision: "skip", reason: `per-market cap: $${(currentMarketSpend + amount).toFixed(0)} > $${marketCap.toFixed(0)}`, amount: 0 };

  const date = new Date().toISOString().split("T")[0];
  const daySpent = portfolio.dailySpend.get(date) || 0;
  const dailyLimit = (version.maxDailyExposurePct / 100) * STARTING_CAPITAL;
  const effectiveLimit = (version.bypassDailyCapForProvenWinners && isProvenWinner)
    ? dailyLimit * 2 : dailyLimit;
  if (daySpent + amount > effectiveLimit)
    return { decision: "skip", reason: `daily cap: $${(daySpent + amount).toFixed(0)}/$${effectiveLimit.toFixed(0)}`, amount: 0 };

  if (portfolio.cash < amount)
    return { decision: "skip", reason: `insufficient cash: $${portfolio.cash.toFixed(2)} < $${amount.toFixed(2)}`, amount: 0 };

  return { decision: "trade", reason: "passes all filters", amount };
}

export function simulateSignal(
  db: Database.Database,
  signalId: number,
  signal: TradeSignal,
  traderEv: Map<string, { expectedValue: number; confidence: string }>,
): void {
  for (const version of VERSIONS) {
    const portfolio = getOrCreatePortfolio(version.mk);

    // SELL handling — per-MK sell-match logic. This is where MK21's fuzzy match
    // actually differs from earlier MKs in the paper sim.
    if (signal.side === "SELL") {
      const sellResult = tryMatchSell(portfolio, version, signal);
      const reason = sellResult.sold
        ? `sold-${sellResult.type}:${sellResult.shares.toFixed(2)}sh@${signal.price}→$${sellResult.proceeds.toFixed(2)}`
        : `sell-${sellResult.type}`;
      insertSimResult(db, signalId, version.mk, "trade", reason,
        sellResult.sold ? -sellResult.proceeds : null,
        sellResult.sold ? -sellResult.shares : null);
      continue;
    }

    const result = evaluateSignal(signal, version, portfolio, traderEv);

    if (result.decision === "trade" && signal.side === "BUY" && result.amount > 0) {
      const marketKey = `${signal.slug}:${signal.outcome}`;
      const shares = result.amount / signal.price;
      portfolio.cash -= result.amount;
      const existing = portfolio.positions.get(marketKey);
      if (existing) {
        existing.shares += shares;
        existing.amount += result.amount;
      } else {
        portfolio.positions.set(marketKey, {
          shares, entry: signal.price, amount: result.amount,
          slug: signal.slug, outcome: signal.outcome,
        });
      }
      const date = new Date().toISOString().split("T")[0];
      portfolio.dailySpend.set(date, (portfolio.dailySpend.get(date) || 0) + result.amount);
    }

    if (signal.side === "BUY") {
      const hour = Math.floor(Date.now() / (60 * 60 * 1000));
      const hours = portfolio.signalsByHour.get(signal.traderName) || [];
      hours.push(hour);
      const cutoff = hour - 2;
      portfolio.signalsByHour.set(signal.traderName, hours.filter(h => h >= cutoff));
    }

    insertSimResult(db, signalId, version.mk, result.decision,
      result.decision === "skip" ? result.reason : null,
      result.decision === "trade" ? result.amount : null,
      result.decision === "trade" && signal.price > 0 ? result.amount / signal.price : null);
  }
}

export function applyResolutions(db: Database.Database): void {
  const resolutions = db.prepare(`SELECT slug, outcome, won FROM resolutions`).all() as any[];
  for (const version of VERSIONS) {
    const portfolio = getOrCreatePortfolio(version.mk);
    for (const res of resolutions) {
      const key = `${res.slug}:${res.outcome}`;
      const pos = portfolio.positions.get(key);
      if (pos) {
        if (res.won === 1) {
          portfolio.cash += pos.shares;
        }
        portfolio.positions.delete(key);
      }
    }
  }
}

export function savePortfolioSnapshots(db: Database.Database): void {
  for (const version of VERSIONS) {
    const portfolio = getOrCreatePortfolio(version.mk);
    let positionsValue = 0;
    for (const pos of portfolio.positions.values()) {
      positionsValue += pos.amount;
    }
    insertSimPortfolioSnapshot(db, version.mk, portfolio.cash, positionsValue, portfolio.positions.size);
  }
}
