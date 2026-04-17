// Hetzner auto-reauth — runs on the server, uses saved Playwright session
// to auto-approve Bullpen device codes when auth dies. No laptop needed.
//
// Requires: bullpen-session.json (from save-bullpen-session.ts)
// Install: npx playwright install chromium (on Hetzner)
// Run as systemd service or: npx tsx scripts/hetzner-auto-reauth.ts

import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

// Stealth plugin makes headless Chromium look like a real browser
// to bypass Vercel's bot detection on app.bullpen.fi
chromium.use(StealthPlugin());

const BULLPEN = process.env.BULLPEN_PATH || "/root/.bullpen/bin/bullpen";
const SESSION_PATH = join(__dirname, "..", "bullpen-session.json");
const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8739531411:AAFqW3s4KbsH8Xe9jv1U9adof4h95OMwavs";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8421700693";

function log(msg: string) {
  console.log(`${new Date().toISOString()} [REAUTH] ${msg}`);
}

function sendTelegram(msg: string) {
  try {
    execSync(`curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" -d chat_id="${TELEGRAM_CHAT_ID}" -d text="${msg}" -d parse_mode="Markdown" > /dev/null 2>&1`, { timeout: 10000 });
  } catch {}
}

function isAuthAlive(): boolean {
  try {
    const out = execSync(`${BULLPEN} status 2>&1`, { encoding: "utf-8", timeout: 15000 });
    // Must match exact "Logged in" not "Not logged in"
    return out.includes("Status:           Logged in");
  } catch {
    return false;
  }
}

function generateDeviceCode(): string | null {
  try {
    // Kill any stale login processes
    try { execSync("killall bullpen 2>/dev/null", { timeout: 3000 }); } catch {}

    // Start login in background
    execSync(`nohup ${BULLPEN} login --no-browser > /tmp/pw-reauth.log 2>&1 &`, {
      timeout: 5000, shell: "/bin/bash",
    });

    // Wait for code to appear
    for (let i = 0; i < 10; i++) {
      try {
        const logContent = execSync("cat /tmp/pw-reauth.log 2>/dev/null", {
          encoding: "utf-8", timeout: 3000,
        });
        const match = logContent.match(/([A-Z]{4}-[A-Z]{4})/);
        if (match) return match[1];
      } catch {}
      execSync("sleep 1");
    }
  } catch (err: any) {
    log(`Code generation failed: ${err.message}`);
  }
  return null;
}

async function approveCode(code: string): Promise<boolean> {
  if (!existsSync(SESSION_PATH)) {
    log("ERROR: bullpen-session.json not found. Run save-bullpen-session.ts first.");
    return false;
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: SESSION_PATH });
    const page = await context.newPage();

    log(`Navigating to device auth page...`);
    await page.goto("https://app.bullpen.fi/device", { timeout: 60000, waitUntil: "networkidle" });
    // Wait for Vercel checkpoint + app hydration
    await page.waitForTimeout(10000);

    // Find the code input field and enter the code
    // The device page has an input for the 8-char code
    const input = page.locator('input[type="text"], input[placeholder*="code"], input[placeholder*="Code"]').first();
    if (await input.isVisible({ timeout: 5000 })) {
      await input.fill(code);
      log(`Entered code: ${code}`);
      await page.waitForTimeout(1000);

      // Look for submit/verify button
      const button = page.locator('button:has-text("Verify"), button:has-text("Submit"), button:has-text("Confirm"), button[type="submit"]').first();
      if (await button.isVisible({ timeout: 3000 })) {
        await button.click();
        log("Clicked submit button");
      } else {
        // Try pressing Enter
        await input.press("Enter");
        log("Pressed Enter");
      }

      await page.waitForTimeout(5000);

      // Save updated session state (cookies may have refreshed)
      await context.storageState({ path: SESSION_PATH });
      log("Session state updated");

      await browser.close();
      return true;
    } else {
      // Try typing the code character by character (some UIs use separate inputs)
      log("No single input found, trying character-by-character...");
      const inputs = page.locator("input");
      const count = await inputs.count();
      if (count >= 8) {
        const chars = code.replace("-", "").split("");
        for (let i = 0; i < Math.min(chars.length, count); i++) {
          await inputs.nth(i).fill(chars[i]);
        }
        log(`Entered code across ${count} inputs`);
        await page.waitForTimeout(2000);

        const button = page.locator('button:has-text("Verify"), button:has-text("Submit"), button:has-text("Confirm"), button[type="submit"]').first();
        if (await button.isVisible({ timeout: 3000 })) {
          await button.click();
        }
        await page.waitForTimeout(5000);
        await context.storageState({ path: SESSION_PATH });
        await browser.close();
        return true;
      }

      log("Could not find code input on page");
      // Take screenshot for debugging
      await page.screenshot({ path: "/tmp/reauth-debug.png" });
      log("Debug screenshot saved to /tmp/reauth-debug.png");
      await browser.close();
      return false;
    }
  } catch (err: any) {
    log(`Browser error: ${err.message}`);
    if (browser) await browser.close().catch(() => {});
    return false;
  }
}

async function main() {
  log("Hetzner auto-reauth started");
  log(`Session file: ${SESSION_PATH} (exists: ${existsSync(SESSION_PATH)})`);

  while (true) {
    if (!isAuthAlive()) {
      log("Auth dead — starting auto-reauth");

      const code = generateDeviceCode();
      if (!code) {
        log("Failed to generate code, will retry next cycle");
        sendTelegram("⚠️ Auto-reauth: failed to generate code. Will retry in 5 min.");
        await new Promise(r => setTimeout(r, CHECK_INTERVAL));
        continue;
      }

      log(`Got code: ${code} — approving via Playwright...`);
      const success = await approveCode(code);

      // Wait for login to complete
      await new Promise(r => setTimeout(r, 10000));

      if (success && isAuthAlive()) {
        log("SUCCESS — auth restored via Playwright");
        sendTelegram("✅ *Auto-reauth succeeded* (Playwright on Hetzner)\\nBot resuming.");
        // Restart bot to pick up fresh creds
        try { execSync("systemctl restart polymarket-bot", { timeout: 10000 }); } catch {}
        log("Bot restarted");
      } else {
        log("FAIL — Playwright approval didn't restore auth");
        sendTelegram("❌ *Auto-reauth failed* — manual login needed.\\n\\nRun: `bullpen login`");
      }
    } else {
      log("Auth OK");
    }

    await new Promise(r => setTimeout(r, CHECK_INTERVAL));
  }
}

main().catch(console.error);
