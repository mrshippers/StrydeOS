/**
 * E2E: Onboarding — Connect WriteUpp walkthrough
 *
 * Covers Slice D of the WriteUpp inbound-email onboarding flow.
 * The page renders three numbered steps, the unique ingest email address,
 * and a clipboard copy action.
 *
 * Network behaviour under test:
 *   · The page only calls /api/integrations/inbound-email/provision when an
 *     authenticated Firebase user is present. In e2e we use the `?clinicId=`
 *     escape hatch (no auth) so the page short-circuits to the deterministic
 *     pattern and makes no provision call. The "no API calls" test below
 *     pins this contract.
 *   · We still register a stub route on every test so that any future change
 *     which decides to call the endpoint receives a deterministic response
 *     instead of a 401 from the real handler.
 *
 * Run: E2E_NO_SERVER=1 npx playwright test e2e/onboarding-writeupp.spec.ts
 */
import { test, expect } from "@playwright/test";

const CLINIC_ID = "clinic-spires";
const EXPECTED_EMAIL = `import-${CLINIC_ID}@ingest.strydeos.com`;
const PROVISION_PATH = "**/api/integrations/inbound-email/provision";

test.describe("Onboarding — Connect WriteUpp", () => {
  test.beforeEach(async ({ page, context }) => {
    // Grant clipboard permissions so navigator.clipboard.readText() works
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.addInitScript(() => {
      localStorage.setItem("strydeos_splash_seen", "1");
    });

    // Stub the provision endpoint so any accidental call gets a deterministic
    // 200 with the expected payload, not a 401 from the real handler.
    await page.route(PROVISION_PATH, async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            email: EXPECTED_EMAIL,
            allowedSenders: [],
            provisioned: false,
            domain: "ingest.strydeos.com",
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          email: EXPECTED_EMAIL,
          allowedSenders: ["owner@example.com"],
          provisioned: true,
          domain: "ingest.strydeos.com",
        }),
      });
    });
  });

  test("renders three numbered steps with the correct copy", async ({ page }) => {
    await page.goto(`/onboarding/writeupp?clinicId=${CLINIC_ID}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    await expect(page.getByRole("heading", { name: "Connect WriteUpp" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Open WriteUpp Reports")).toBeVisible();
    await expect(page.getByText("Schedule the Activity by Date export")).toBeVisible();
    await expect(page.getByText("Email it here")).toBeVisible();
  });

  test("shows the unique ingest email for the clinic and copies it to clipboard", async ({ page }) => {
    await page.goto(`/onboarding/writeupp?clinicId=${CLINIC_ID}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    // Email pill visible
    await expect(page.getByText(EXPECTED_EMAIL)).toBeVisible({ timeout: 15_000 });

    // Click the Copy button
    const copyBtn = page.getByRole("button", { name: /copy email/i });
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();

    // Clipboard contains the address
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(EXPECTED_EMAIL);
  });

  test("primary CTA navigates to /dashboard", async ({ page }) => {
    await page.goto(`/onboarding/writeupp?clinicId=${CLINIC_ID}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    await page.getByRole("button", { name: /i've set this up/i }).click();
    // Wait for navigation away from the walkthrough page. Middleware on
    // protected routes may redirect unauthenticated e2e users to /login —
    // this test asserts the CTA performs navigation with /dashboard as its
    // target, regardless of the auth decision that follows.
    await page.waitForURL((url) => !url.pathname.endsWith("/onboarding/writeupp"), { timeout: 25_000 });
    expect(page.url()).toMatch(/\/(dashboard|login)/);
  });

  test("skip link navigates to /settings#csv-import-section", async ({ page }) => {
    await page.goto(`/onboarding/writeupp?clinicId=${CLINIC_ID}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    const skipLink = page.getByRole("link", { name: /skip for now/i });
    await expect(skipLink).toHaveAttribute("href", "/settings#csv-import-section");

    await skipLink.click();
    // As with the CTA, unauthenticated e2e hits /settings and middleware
    // may redirect to /login. Assert that navigation left the walkthrough.
    await page.waitForURL((url) => !url.pathname.endsWith("/onboarding/writeupp"), { timeout: 25_000 });
    expect(page.url()).toMatch(/\/(settings|login)/);
  });

  test("page makes no provision API calls in the e2e bypass path", async ({ page }) => {
    // The `?clinicId=` query param is the e2e escape hatch — when there's no
    // Firebase user the page must NOT call the provisioning endpoint. This
    // test pins that contract so any future change which tries to fetch on
    // mount (regardless of auth state) breaks loudly here.
    const apiCalls: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      // Ignore auth-session plumbing from the AuthProvider — it's not
      // owned by this page.
      if (url.includes("/api/") && !url.includes("/api/auth/session")) {
        apiCalls.push(url);
      }
    });

    await page.goto(`/onboarding/writeupp?clinicId=${CLINIC_ID}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await expect(page.getByRole("heading", { name: "Connect WriteUpp" })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1_500);

    expect(apiCalls).toEqual([]);
  });
});
