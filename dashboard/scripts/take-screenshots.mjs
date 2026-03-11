/**
 * Quick screenshot script — captures billing/trial/locked pages in demo mode.
 * Run from dashboard dir: node scripts/take-screenshots.mjs
 */
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../screenshots");

const BASE = "http://localhost:3000";

async function shot(page, url, filename, { waitFor, action } = {}) {
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
  if (action) await action(page);
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${filename}`, fullPage: false });
  console.log("✓", filename);
}

(async () => {
  const { mkdirSync } = await import("fs");
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Enter demo mode via login page
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  // Click "Continue with demo" button if present
  const demoBtn = page.locator("button", { hasText: /demo/i }).first();
  if (await demoBtn.isVisible().catch(() => false)) {
    await demoBtn.click();
    await page.waitForURL(/dashboard/, { timeout: 8000 }).catch(() => {});
  }

  await page.waitForTimeout(1000);

  // 1. Dashboard (with trial banner)
  await shot(page, "/dashboard", "01-dashboard-trial-banner.png");

  // 2. Billing page
  await shot(page, "/billing", "02-billing.png");

  // 3. Intelligence (should be unlocked during trial)
  await shot(page, "/intelligence", "03-intelligence-unlocked.png");

  // 4. Pulse
  await shot(page, "/pulse", "04-pulse-unlocked.png");

  // 5. Receptionist / Ava
  await shot(page, "/receptionist", "05-ava-unlocked.png");

  // 6. Admin page
  await shot(page, "/admin", "06-admin.png");

  // Now simulate a locked state by overriding localStorage/sessionStorage isn't straightforward
  // Instead, navigate directly to a locked module URL and show the LockedModulePage by
  // temporarily evaluating JS to make useEntitlements return false — not easy without mocking.
  // Best we can do is show the LockedModulePage component by hitting /billing with no trial.

  await browser.close();
  console.log("\nScreenshots saved to:", OUT);
})();
