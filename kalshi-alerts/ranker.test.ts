import { describe, it, expect } from "vitest";
import { rankTraders, fmtPct } from "./ranker";
import type { LeaderboardEntry } from "./kalshi-client";

function entry(p: Partial<LeaderboardEntry>): LeaderboardEntry {
  return {
    userId: p.userId ?? "u",
    username: p.username ?? "user",
    profitUsd: p.profitUsd ?? 0,
    volumeUsd: p.volumeUsd ?? 0,
    settledTrades: p.settledTrades ?? 30,
    rank: p.rank ?? 1,
  };
}

const OPTS = { topN: 3, minVolumeUsd: 5000, minSettledTrades: 20 };

describe("rankTraders", () => {
  it("ranks by profit-per-dollar, not raw profit (whale loses to sharp)", () => {
    const whale = entry({ username: "whale", profitUsd: 178_781, volumeUsd: 5_000_000 }); // 3.6%
    const sharp = entry({ username: "sharp", profitUsd: 12_000, volumeUsd: 60_000 }); // 20%
    const [top] = rankTraders([whale, sharp], OPTS);
    expect(top.username).toBe("sharp");
  });

  it("filters out thin-sample flukes below the volume floor", () => {
    const fluke = entry({ username: "fluke", profitUsd: 50, volumeUsd: 50 }); // 100% but $50
    const real = entry({ username: "real", profitUsd: 800, volumeUsd: 10_000 }); // 8%
    const ranked = rankTraders([fluke, real], OPTS);
    expect(ranked.map((r) => r.username)).toEqual(["real"]);
  });

  it("filters out traders below the settled-trades floor", () => {
    const greenhorn = entry({ username: "greenhorn", profitUsd: 3000, volumeUsd: 20_000, settledTrades: 5 });
    const veteran = entry({ username: "veteran", profitUsd: 3000, volumeUsd: 20_000, settledTrades: 40 });
    const ranked = rankTraders([greenhorn, veteran], OPTS);
    expect(ranked.map((r) => r.username)).toEqual(["veteran"]);
  });

  it("excludes unprofitable traders entirely", () => {
    const loser = entry({ username: "loser", profitUsd: -5000, volumeUsd: 50_000 });
    expect(rankTraders([loser], OPTS)).toHaveLength(0);
  });

  it("returns at most topN, correctly ordered", () => {
    const traders = [
      entry({ username: "a", profitUsd: 1000, volumeUsd: 100_000 }), // 1%
      entry({ username: "b", profitUsd: 5000, volumeUsd: 100_000 }), // 5%
      entry({ username: "c", profitUsd: 9000, volumeUsd: 100_000 }), // 9%
      entry({ username: "d", profitUsd: 2000, volumeUsd: 100_000 }), // 2%
    ];
    const ranked = rankTraders(traders, OPTS);
    expect(ranked.map((r) => r.username)).toEqual(["c", "b", "d"]);
  });

  it("tolerates a leaderboard that omits settledTrades (reports 0)", () => {
    const t = entry({ username: "nostats", profitUsd: 4000, volumeUsd: 40_000, settledTrades: 0 });
    expect(rankTraders([t], OPTS)).toHaveLength(1);
  });
});

describe("fmtPct", () => {
  it("formats the metric as a percent", () => {
    expect(fmtPct(0.083)).toBe("8.3%");
  });
});
