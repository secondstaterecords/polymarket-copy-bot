import { describe, it, expect } from "vitest";
import { shouldCopyTrade } from "../src/filters";
import { DEFAULT_CONFIG } from "../src/config";

const baseSignal = {
  traderName: "TestTrader",
  traderAddress: "0xabc",
  side: "BUY" as const,
  slug: "test-market",
  outcome: "Yes",
  price: 0.50,
  traderAmount: 100,
  timestamp: new Date().toISOString(),
};

const emptyState = {
  marketExposure: new Map(),
  dailyExposure: 0,
  seenPositions: new Set<string>(),
  recentSignals: [],
};

describe("shouldCopyTrade", () => {
  it("passes valid trade", () => {
    expect(shouldCopyTrade(baseSignal, DEFAULT_CONFIG, emptyState).pass).toBe(true);
  });
  it("rejects low price", () => {
    const r = shouldCopyTrade({ ...baseSignal, price: 0.05 }, DEFAULT_CONFIG, emptyState);
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("price");
  });
  it("rejects high price", () => {
    const r = shouldCopyTrade({ ...baseSignal, price: 0.92 }, DEFAULT_CONFIG, emptyState);
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("price");
  });
  it("rejects small trader amount", () => {
    const r = shouldCopyTrade({ ...baseSignal, traderAmount: 3 }, DEFAULT_CONFIG, emptyState);
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("amount");
  });
  it("rejects exceeded market cap", () => {
    const state = { ...emptyState, marketExposure: new Map([["test-market:Yes", 25]]) };
    const r = shouldCopyTrade(baseSignal, DEFAULT_CONFIG, state);
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("market cap");
  });
  it("rejects exceeded daily cap", () => {
    const state = { ...emptyState, dailyExposure: 200 };
    const r = shouldCopyTrade(baseSignal, DEFAULT_CONFIG, state);
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("daily");
  });
  it("rejects duplicate position", () => {
    const state = { ...emptyState, seenPositions: new Set(["TestTrader:test-market:Yes"]) };
    const r = shouldCopyTrade(baseSignal, DEFAULT_CONFIG, state);
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("already holds");
  });
  it("always passes SELL signals", () => {
    const r = shouldCopyTrade({ ...baseSignal, side: "SELL", price: 0.05 }, DEFAULT_CONFIG, emptyState);
    expect(r.pass).toBe(true);
  });
});
