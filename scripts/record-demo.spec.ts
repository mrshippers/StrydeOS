// Records a ~32-second walkthrough of the live StrydeOS demo portal.
// Scenes: Ava → Pulse → Intelligence. Output: 1920×1080 .webm in test-results/.
// Pacing is tuned for VO overlay in post — do not shorten the timeouts.
import { test } from "@playwright/test";

test.use({
  viewport: { width: 1920, height: 1080 },
  video: { mode: "on", size: { width: 1920, height: 1080 } },
});

test("strydeos demo — Ava, Pulse, Intelligence", async ({ page }) => {
  // The live SPA keeps Firestore sockets open, so `domcontentloaded`
  // resolves reliably where `networkidle` would stall.
  await page.goto("https://portal.strydeos.com/login");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1500);

  // Enter demo mode — no credentials required.
  await page.getByRole("button", { name: /try demo/i }).click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2500); // intro buffer while the dashboard hydrates

  // Scene 1 — Ava (10s hold for VO)
  await page.getByRole("link", { name: "Ava", exact: true }).click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(10_000);

  // Scene 2 — Pulse (10s hold for VO)
  await page.getByRole("link", { name: "Pulse", exact: true }).click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(10_000);

  // Scene 3 — Intelligence (8s hold for VO)
  await page.getByRole("link", { name: "Intelligence", exact: true }).click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(8_000);
});
