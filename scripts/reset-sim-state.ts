#!/usr/bin/env tsx
// One-shot: wipes contaminated sim state from before the 2026-04-28 persistence fix.
// Run once after deploying the persistence fix to start MK metrics with a clean slate.
//
// Use with care — this drops sim_positions + sim_state. sim_results, sim_metrics,
// trades, and resolutions are NOT touched (history is preserved). New paper
// trades will start from STARTING_CAPITAL=$250 cleanly.
//
// Usage: `npx tsx scripts/reset-sim-state.ts`

import { createDb } from "../src/db";
import { resetAllPortfolios } from "../src/sim-engine";
import { loadConfig } from "../src/config";

const config = loadConfig();
const db = createDb(config.dataDir);
console.log("Resetting per-MK virtual portfolios to STARTING_CAPITAL=$250 with no positions...");
resetAllPortfolios(db);
console.log("Done. sim_positions cleared, sim_state seeded fresh for all MKs.");
console.log("sim_results / sim_metrics / trades / resolutions unchanged.");
db.close();
