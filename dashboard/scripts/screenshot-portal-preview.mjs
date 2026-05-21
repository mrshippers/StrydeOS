// Screenshot the portal-premium-uplift Vercel preview via CDP-attached Chrome.
// Demo-mode flow: load bypass URL -> click "Enter dashboard (demo)" -> SPA-navigate
// to each route via sidebar link. page.goto wipes the in-memory demo state since
// useAuth has no Firebase auth listener to re-hydrate from the cookie.
//
// Run from dashboard/: `node scripts/screenshot-portal-preview.mjs`
import { chromium } from "playwright";

const CDP = "http://localhost:9222";
const BASE = "https://strydeos-git-portal-premium-uplift-mrshippers.vercel.app";
const SHARE = process.env.VERCEL_SHARE_TOKEN ?? "HrW7jOa6JWYlrUBUJZyvZm0pGoREr5RX";
const ROOT = `${BASE}/?_vercel_share=${SHARE}`;

const SHOTS = {
  fallbackLight: "/Users/joa/Desktop/portal-uplift-fallback-light.png",
  fallbackDark: "/Users/joa/Desktop/portal-uplift-fallback-dark.png",
  dashboardLight: "/Users/joa/Desktop/portal-uplift-dashboard-light.png",
  dashboardDark: "/Users/joa/Desktop/portal-uplift-dashboard-dark.png",
  intelligenceLight: "/Users/joa/Desktop/portal-uplift-intelligence-light.png",
  intelligenceDark: "/Users/joa/Desktop/portal-uplift-intelligence-dark.png",
  receptionistLight: "/Users/joa/Desktop/portal-uplift-receptionist-light.png",
  continuityLight: "/Users/joa/Desktop/portal-uplift-continuity-light.png",
  settingsLight: "/Users/joa/Desktop/portal-uplift-settings-light.png",
};

const browser = await chromium.connectOverCDP(CDP);
const context = browser.contexts()[0];
const page = await context.newPage();

await page.setViewportSize({ width: 1440, height: 1024 });

const setMode = async (mode) => {
  await page.evaluate((m) => {
    const cls = document.documentElement.classList;
    if (m === "dark") cls.add("dark");
    else cls.remove("dark");
  }, mode);
  await page.waitForTimeout(700);
};

// Step 1: Load bypass URL + capture the No-Firebase-config fallback in both modes.
await page.goto(ROOT, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(2200);
await setMode("light");
await page.screenshot({ path: SHOTS.fallbackLight, fullPage: true });
await setMode("dark");
await page.screenshot({ path: SHOTS.fallbackDark, fullPage: true });
await setMode("light");

// Step 2: Enter demo mode by clicking the button (preserves SPA state).
const demoBtn = page.locator('button:has-text("Enter dashboard"), a:has-text("Enter dashboard"), button:has-text("Try demo")').first();
let landedDemo = false;
try {
  await demoBtn.waitFor({ state: "visible", timeout: 5_000 });
  await demoBtn.click();
  landedDemo = true;
  await page.waitForTimeout(3500);
} catch (e) {
  console.error("Could not find/click demo button:", e?.message);
}

// Step 3: /dashboard light + dark (owner-summary landing). We landed here after demo click.
const onDashboard = await page.evaluate(() => location.pathname).catch(() => "");
await setMode("light");
await page.screenshot({ path: SHOTS.dashboardLight, fullPage: true });
await setMode("dark");
await page.screenshot({ path: SHOTS.dashboardDark, fullPage: true });
await setMode("light");

// Step 4: Try clicking the Intelligence sidebar link to navigate via SPA.
const sidebarSelectors = [
  'a[href="/intelligence"]',
  'a[href*="/intelligence"]',
  'nav a:has-text("Intelligence")',
];
for (const sel of sidebarSelectors) {
  try {
    const link = page.locator(sel).first();
    if (await link.isVisible({ timeout: 1500 })) {
      await link.click();
      await page.waitForTimeout(2500);
      break;
    }
  } catch {/* try next */}
}
await page.screenshot({ path: SHOTS.intelligenceLight, fullPage: true });
await setMode("dark");
await page.screenshot({ path: SHOTS.intelligenceDark, fullPage: true });
await setMode("light");

// Step 5: receptionist (Ava module) + continuity (Pulse) + settings
const otherRoutes = [
  ["/receptionist", SHOTS.receptionistLight],
  ["/continuity", SHOTS.continuityLight],
  ["/settings", SHOTS.settingsLight],
];
for (const [href, file] of otherRoutes) {
  let clicked = false;
  for (const sel of [`a[href="${href}"]`, `a[href*="${href}"]`, `nav a:has-text("${href.replace("/", "")}")`]) {
    try {
      const link = page.locator(sel).first();
      if (await link.isVisible({ timeout: 1500 })) {
        await link.click();
        await page.waitForTimeout(2500);
        clicked = true;
        break;
      }
    } catch {/* next */}
  }
  if (!clicked) continue;
  await page.screenshot({ path: file, fullPage: true });
}

console.log(JSON.stringify({ landedDemo, onDashboard, shots: SHOTS }, null, 2));
await page.close();
// re-trigger preview build after env var sync 1779218155
