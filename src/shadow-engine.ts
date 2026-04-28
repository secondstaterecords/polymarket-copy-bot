// src/shadow-engine.ts
// Single shadow portfolio for the deployed MK, hydrated from real Bullpen state
// on bot startup. Cash-aware paper buys + MK21-fix sell matcher (always on).
// This is the 1:1 verification surface for the live flip — drift trend in
// shadow_balance_snapshots is the go/no-go signal. Spec: docs/shadow-live-mode-spec.md.

import Database from "better-sqlite3";
import { VersionConfig } from "./versions";
import { TradeSignal } from "./filters";
import { insertShadowTrade, insertShadowSnapshot } from "./db";
import { getBalance, getPositions } from "./executor";

interface ShadowPortfolio {
  cash: number;
  positions: Map<string, { shares: number; entry: number; amount: number; slug: string; outcome: string }>;
  initialized: boolean;
  initializedAt: string;
  // paperMode at init time. Used to decide whether reconciliation drift is
  // even meaningful (drift in paperMode reflects shadow's hypothetical P&L
  // vs a static real wallet — not a live-flip readiness signal).
  paperModeAtInit: boolean;
  // Resolutions already processed by applyResolutionsShadow — guards against
  // re-crediting the same resolved win on every 30-min scan (review F2).
  processedResolutions: Set<string>;
}

const portfolio: ShadowPortfolio = {
  cash: 0,
  positions: new Map(),
  initialized: false,
  initializedAt: "",
  paperModeAtInit: true,
  processedResolutions: new Set(),
};

// $1 buffer on BUY cash check, mirrors handleBuy in bot.ts (live path requires
// usdcBalance >= amount + 1). Keeping shadow's threshold identical avoids a
// silent paper-vs-live divergence after the eventual flip (review F4).
const BUY_CASH_BUFFER_USD = 1;

function log(tag: string, msg: string): void {
  console.log(`${new Date().toISOString()} [SHADOW:${tag}] ${msg}`);
}

// Mirrors bot.ts:313 — strip Bullpen's trailing -NNN hash groups for fuzzy match.
function normalizeSlug(s: string): string {
  return (s || "").replace(/-\d+(-\d+)*$/, "").toLowerCase();
}

export function isShadowReady(): boolean {
  return portfolio.initialized;
}

export function getShadowSnapshot(): {
  cash: number;
  positionsValue: number;
  positionCount: number;
  initializedAt: string;
} {
  let positionsValue = 0;
  for (const p of portfolio.positions.values()) positionsValue += p.amount;
  return {
    cash: portfolio.cash,
    positionsValue,
    positionCount: portfolio.positions.size,
    initializedAt: portfolio.initializedAt,
  };
}

// Hydrate from real Bullpen state. Bullpen is the source of truth for the
// wallet cash — never restore from DB; the shadow_trades audit log is the
// durable record.
//
// In paperMode (current state): skip seeding open positions. Real Bullpen's
// 5 pre-existing positions are NOT from the bot — including them would mean
// shadow expects to "sell" positions it didn't buy, and would credit
// resolutions for redemptions that already happened on the real wallet.
// Shadow starts empty-positions and accumulates only what the bot's signal
// pipeline buys. This makes shadow == "what would the bot have done with
// this wallet's cash starting now." (Review F3.)
//
// In live mode: hydrate positions too — at that point the bot owns the wallet
// state and we want shadow ↔ bullpen 1:1.
//
// If Bullpen auth is broken, leave portfolio uninitialized so
// processSignalShadow no-ops rather than fabricating state. Reconcile path
// retries init each cycle so a mid-session auth recovery brings shadow back
// online without a restart (review F8).
export async function initShadow(opts?: { paperMode?: boolean; resolutionsTable?: Database.Database }): Promise<void> {
  try {
    const bal = getBalance();
    if (bal === null) {
      log("INIT", "WARN: Bullpen balance returned null (auth?) — shadow uninitialized; reconcile cron will retry");
      portfolio.initialized = false;
      return;
    }
    portfolio.cash = bal;
    portfolio.positions.clear();
    portfolio.processedResolutions.clear();
    portfolio.paperModeAtInit = opts?.paperMode ?? true;

    let totalPosValue = 0;
    let skippedResolved = 0;
    if (!portfolio.paperModeAtInit) {
      const positions = getPositions();
      // Pre-load the resolutions table so we can skip positions that already
      // resolved on the real wallet (their redemption credit landed in
      // bullpenCash, not as a position).
      const resolvedKeys = new Set<string>();
      if (opts?.resolutionsTable) {
        try {
          const rows = opts.resolutionsTable
            .prepare(`SELECT slug, outcome FROM resolutions`)
            .all() as any[];
          for (const r of rows) resolvedKeys.add(`${r.slug}:${r.outcome}`);
        } catch {}
      }
      for (const p of positions || []) {
        const slug = p.slug || "";
        const outcome = p.outcome || "";
        if (!slug || !outcome) continue;
        const key = `${slug}:${outcome}`;
        if (resolvedKeys.has(key)) {
          skippedResolved++;
          // Mark as processed so applyResolutionsShadow never double-credits.
          portfolio.processedResolutions.add(key);
          continue;
        }
        const shares = parseFloat(String(p.shares ?? p.size ?? "0"));
        const entry = parseFloat(String(p.avg_price ?? p.entry_price ?? "0"));
        const investedRaw = p.invested_usd ?? p.amount_usd ?? (shares * entry).toString();
        const invested = parseFloat(String(investedRaw));
        if (!isFinite(shares) || shares <= 0) continue;
        portfolio.positions.set(key, {
          shares,
          entry: isFinite(entry) ? entry : 0,
          amount: isFinite(invested) ? invested : 0,
          slug,
          outcome,
        });
        totalPosValue += isFinite(invested) ? invested : 0;
      }
    }
    portfolio.initialized = true;
    portfolio.initializedAt = new Date().toISOString();
    const mode = portfolio.paperModeAtInit ? "paperMode" : "live";
    log(
      "INIT",
      `[${mode}] Hydrated cash=$${portfolio.cash.toFixed(2)}, positions=${portfolio.positions.size} ($${totalPosValue.toFixed(2)} invested, ${skippedResolved} already-resolved skipped)`,
    );
  } catch (err: any) {
    log("INIT", `Init failed: ${err.message} — shadow will no-op`);
    portfolio.initialized = false;
  }
}

// Process a signal that has already passed the deployed MK's filters in
// processSignal. SELL always uses fuzzy match (the MK21 fix path) regardless
// of deployed.mirrorSellFuzzyMatch — shadow exists specifically to verify
// that fix in paper-mode while the live bot can't run it (paperMode gate).
export function processSignalShadow(
  db: Database.Database,
  signalId: number,
  signal: TradeSignal,
  deployed: VersionConfig,
): void {
  if (!portfolio.initialized) return;

  const cashBefore = portfolio.cash;
  const now = new Date().toISOString();

  if (signal.side === "SELL") {
    const exactKey = `${signal.slug}:${signal.outcome}`;
    let matched = portfolio.positions.get(exactKey);
    let matchType: "exact" | "fuzzy" | null = matched ? "exact" : null;
    let matchedKey: string | null = matched ? exactKey : null;
    if (!matched) {
      // Match strategies in priority order, mirroring handleSell at bot.ts:309-316:
      // (1) event_slug match — Bullpen sometimes returns event_slug as the
      //     position's slug while the tracker signal carries the market_slug,
      //     or vice versa. (Review F9.)
      // (2) fuzzy normalized slug — strip trailing -NNN hash groups.
      const target = normalizeSlug(signal.slug);
      for (const [k, p] of portfolio.positions.entries()) {
        if (p.outcome !== signal.outcome) continue;
        if ((p as any).event_slug === signal.slug || normalizeSlug(p.slug) === target) {
          matched = p;
          matchType = "fuzzy";
          matchedKey = k;
          break;
        }
      }
    }
    if (matched && matchedKey) {
      const proceeds = matched.shares * signal.price;
      portfolio.cash += proceeds;
      const sharesSold = matched.shares;
      portfolio.positions.delete(matchedKey);
      insertShadowTrade(db, {
        signalId,
        timestamp: now,
        trader: signal.traderName,
        slug: signal.slug,
        outcome: signal.outcome,
        side: "SELL",
        decision: "executed",
        reason: `sold ${sharesSold.toFixed(2)}sh @ ${signal.price} → $${proceeds.toFixed(2)} (${matchType})`,
        amountUsd: proceeds,
        shares: sharesSold,
        price: signal.price,
        shadowCashBefore: cashBefore,
        shadowCashAfter: portfolio.cash,
        matchType,
      });
    } else {
      insertShadowTrade(db, {
        signalId,
        timestamp: now,
        trader: signal.traderName,
        slug: signal.slug,
        outcome: signal.outcome,
        side: "SELL",
        decision: "sell-miss",
        reason: "no shadow position (exact or fuzzy)",
        amountUsd: null,
        shares: null,
        price: signal.price,
        shadowCashBefore: cashBefore,
        shadowCashAfter: portfolio.cash,
        matchType: null,
      });
    }
    return;
  }

  // BUY: cash-aware. Refuse if shadow_cash < amount + buffer (mirrors bot.ts:235).
  const amount = deployed.tradeAmountUsd;
  if (portfolio.cash < amount + BUY_CASH_BUFFER_USD) {
    insertShadowTrade(db, {
      signalId,
      timestamp: now,
      trader: signal.traderName,
      slug: signal.slug,
      outcome: signal.outcome,
      side: "BUY",
      decision: "skipped",
      reason: `insufficient shadow cash: $${portfolio.cash.toFixed(2)} < $${(amount + BUY_CASH_BUFFER_USD).toFixed(2)}`,
      amountUsd: amount,
      shares: null,
      price: signal.price,
      shadowCashBefore: cashBefore,
      shadowCashAfter: portfolio.cash,
      matchType: null,
    });
    return;
  }
  if (!(signal.price > 0)) {
    insertShadowTrade(db, {
      signalId,
      timestamp: now,
      trader: signal.traderName,
      slug: signal.slug,
      outcome: signal.outcome,
      side: "BUY",
      decision: "skipped",
      reason: `invalid price for share calc: ${signal.price}`,
      amountUsd: amount,
      shares: 0,
      price: signal.price,
      shadowCashBefore: cashBefore,
      shadowCashAfter: portfolio.cash,
      matchType: null,
    });
    return;
  }
  const shares = amount / signal.price;
  portfolio.cash -= amount;
  const key = `${signal.slug}:${signal.outcome}`;
  const existing = portfolio.positions.get(key);
  if (existing) {
    // Weighted-average entry on stack-buy so partial-sell proceeds compute
    // sensibly. Without this, entry stays pinned at first-buy price and any
    // future MTM logic mis-prices the position. (Review F12.)
    const totalShares = existing.shares + shares;
    const totalAmount = existing.amount + amount;
    existing.entry = totalShares > 0 ? totalAmount / totalShares : existing.entry;
    existing.shares = totalShares;
    existing.amount = totalAmount;
  } else {
    portfolio.positions.set(key, {
      shares,
      entry: signal.price,
      amount,
      slug: signal.slug,
      outcome: signal.outcome,
    });
  }
  insertShadowTrade(db, {
    signalId,
    timestamp: now,
    trader: signal.traderName,
    slug: signal.slug,
    outcome: signal.outcome,
    side: "BUY",
    decision: "executed",
    reason: `bought ${shares.toFixed(2)}sh @ ${signal.price} for $${amount.toFixed(2)}`,
    amountUsd: amount,
    shares,
    price: signal.price,
    shadowCashBefore: cashBefore,
    shadowCashAfter: portfolio.cash,
    matchType: null,
  });
}

// Process resolutions in shadow: for each newly-resolved (slug, outcome), if
// shadow holds it, credit cash on win (shares * $1) and delete the position.
// Idempotent via processedResolutions set — review F2 caught that without
// this, every 30-min scan re-credited held positions. Also: positions
// hydrated from real Bullpen at init that were ALREADY resolved are
// pre-marked in processedResolutions during initShadow, so their redemption
// (which already landed in bullpen cash before bot startup) never gets
// double-counted by shadow.
export function applyResolutionsShadow(db: Database.Database): void {
  if (!portfolio.initialized) return;
  const resolutions = db.prepare(`SELECT slug, outcome, won FROM resolutions`).all() as any[];
  for (const res of resolutions) {
    const key = `${res.slug}:${res.outcome}`;
    if (portfolio.processedResolutions.has(key)) continue;
    portfolio.processedResolutions.add(key);
    const pos = portfolio.positions.get(key);
    if (pos) {
      if (res.won === 1) portfolio.cash += pos.shares;
      portfolio.positions.delete(key);
    }
  }
}

// Insert a row into shadow_balance_snapshots: shadow vs real Bullpen. WARN log
// on drift > $10. Called every 5 min from bot.ts setInterval. If shadow is
// uninitialized (e.g., Bullpen auth was broken at startup), retry init here so
// the shadow recovers automatically once auth is restored — without this
// shadow stays dead until the next bot restart (review F8).
export async function reconcileShadow(
  db: Database.Database,
  opts?: { paperMode?: boolean },
): Promise<void> {
  if (!portfolio.initialized) {
    await initShadow({ paperMode: opts?.paperMode, resolutionsTable: db });
    if (!portfolio.initialized) return;
  }
  const snap = getShadowSnapshot();
  let bullpenCash: number | null = null;
  let bullpenPositionsValue: number | null = null;
  try {
    const bal = getBalance();
    if (bal !== null) bullpenCash = bal;
    const positions = getPositions();
    let posValue = 0;
    for (const p of positions || []) {
      const inv = parseFloat(String(p.invested_usd ?? p.amount_usd ?? "0"));
      if (isFinite(inv)) posValue += inv;
    }
    bullpenPositionsValue = posValue;
  } catch (err: any) {
    log("RECON", `Bullpen fetch failed: ${err.message}`);
  }
  let drift: number | null = null;
  if (bullpenCash !== null && bullpenPositionsValue !== null) {
    const shadowEquity = snap.cash + snap.positionsValue;
    const bullpenEquity = bullpenCash + bullpenPositionsValue;
    drift = shadowEquity - bullpenEquity;
    if (Math.abs(drift) > 10) {
      log(
        "RECON",
        `WARN drift $${drift.toFixed(2)} (shadow=$${shadowEquity.toFixed(2)} bullpen=$${bullpenEquity.toFixed(2)})`,
      );
    }
  }
  insertShadowSnapshot(db, {
    shadowCash: snap.cash,
    shadowPositionsValue: snap.positionsValue,
    bullpenCash,
    bullpenPositionsValue,
    driftUsd: drift,
  });
}
