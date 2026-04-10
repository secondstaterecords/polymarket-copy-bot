import { describe, it, expect } from "vitest";
import { computePaperPnl, computeRealPnl } from "../src/tracker";

describe("computePaperPnl", () => {
  it("calculates positive P&L", () => {
    const trades = [{ action: "BUY", entry_price: 0.30, paper_shares: 16.67, slug: "test", outcome: "Yes", our_amount: 5 }];
    const prices = new Map([["test", new Map([["Yes", 0.50]])]]);
    const r = computePaperPnl(trades, prices);
    expect(r.pnl).toBeCloseTo(3.33, 1);
    expect(r.invested).toBe(5);
  });
  it("calculates negative P&L", () => {
    const trades = [{ action: "BUY", entry_price: 0.70, paper_shares: 7.14, slug: "test", outcome: "Yes", our_amount: 5 }];
    const prices = new Map([["test", new Map([["Yes", 0.30]])]]);
    expect(computePaperPnl(trades, prices).pnl).toBeCloseTo(-2.86, 1);
  });
});

describe("computeRealPnl", () => {
  it("returns zero for no real trades", () => {
    const r = computeRealPnl([], new Map());
    expect(r.pnl).toBe(0);
  });
  it("only includes real successful trades", () => {
    const trades = [
      { action: "BUY", entry_price: 0.40, paper_shares: 12.5, slug: "t", outcome: "Y", our_amount: 5, status: "success", is_real: 1 },
      { action: "BUY", entry_price: 0.40, paper_shares: 12.5, slug: "t", outcome: "Y", our_amount: 5, status: "paper", is_real: 0 },
    ];
    const prices = new Map([["t", new Map([["Y", 0.60]])]]);
    const r = computeRealPnl(trades, prices);
    expect(r.pnl).toBeCloseTo(2.50, 1);
    expect(r.invested).toBe(5);
  });
});
