// Save Bullpen web session — run this ONCE on your Mac.
// Opens a real browser, you login with Google, then it saves
// the cookies/session to a file we can reuse on Hetzner.
//
// Usage: npx playwright test scripts/save-bullpen-session.ts
// Or:    npx tsx scripts/save-bullpen-session.ts

import { chromium } from "playwright";
import { join } from "path";

const STORAGE_PATH = join(__dirname, "..", "bullpen-session.json");

async function main() {
  console.log("Opening browser — log into Bullpen with Google...\n");

  const browser = await chromium.launch({ headless: false }); // VISIBLE browser
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://app.bullpen.fi");
  console.log("Bullpen loaded. Log in with your Google account.");
  console.log("Once you see the dashboard, come back here and press Enter.\n");

  // Wait for user to login — watch for the dashboard to appear
  try {
    await page.waitForURL("**/wallet**", { timeout: 300_000 }); // 5 min timeout
    console.log("Dashboard detected!");
  } catch {
    // If URL doesn't change, just wait for user
    console.log("Waiting for you to press Enter after logging in...");
    await new Promise<void>((resolve) => {
      process.stdin.once("data", () => resolve());
    });
  }

  // Save the session state (cookies, localStorage, etc.)
  await context.storageState({ path: STORAGE_PATH });
  console.log(`\nSession saved to: ${STORAGE_PATH}`);
  console.log("You can close this browser now.\n");
  console.log("Next: copy this file to Hetzner:");
  console.log(`  scp ${STORAGE_PATH} jarvis:/root/polymarket-copy-bot/bullpen-session.json`);

  await browser.close();
}

main().catch(console.error);
