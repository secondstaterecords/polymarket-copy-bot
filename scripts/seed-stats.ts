// One-shot script to run resolution scan + recompute all trader stats.
// Run with: npx tsx scripts/seed-stats.ts

import { createDb } from "../src/db";
import { scanAndRecordResolutions } from "../src/resolution-tracker";
import { recomputeAllTraderStats } from "../src/trader-stats";
import { join } from "path";

const dataDir = process.env.DATA_DIR || join(__dirname, "..");
const db = createDb(dataDir);

console.log("Scanning for resolved markets...");
let totalResolved = 0;
// Run in batches so we check everything
for (let i = 0; i < 5; i++) {
  const result = scanAndRecordResolutions(db, 40);
  console.log(`  Batch ${i + 1}: checked ${result.checked}, newly resolved ${result.newlyResolved}`);
  totalResolved += result.newlyResolved;
  if (result.checked < 40) break; // no more to check
}
console.log(`Total newly resolved: ${totalResolved}`);

console.log("\nRecomputing trader stats...");
const stats = recomputeAllTraderStats(db);
for (const s of stats) {
  if (s.resolvedTrades === 0) continue;
  console.log(
    `  ${s.trader.padEnd(20)} ` +
    `trades=${s.totalTrades}/${s.resolvedTrades} ` +
    `WR=${(s.winRate * 100).toFixed(0)}% ` +
    `avgRet=${s.avgReturnPct >= 0 ? "+" : ""}${s.avgReturnPct.toFixed(0)}% ` +
    `EV=${s.expectedValue.toFixed(2)} ` +
    `size=${s.sizeMultiplier.toFixed(2)}x ` +
    `(${s.confidence})`
  );
}

db.close();
console.log("\nDone.");
