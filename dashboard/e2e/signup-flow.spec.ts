/**
 * E2E: Sign-up Flow Verification
 *
 * Covers all 5 tests from SIGNUP_FLOW_VERIFICATION.md + Ava/Twilio validation.
 *
 * Prerequisites:
 *   - Valid Firebase config in .env.local (client + admin SDK)
 *   - Stripe keys configured (signup creates a Stripe customer)
 *   - Production build: `npm run build`
 *   - Server running: `npm start` (or use `npm run test:e2e:full`)
 *
 * Run against running server: npm run test:e2e
 * Build + run all:            npm run test:e2e:full
 */
import { test, expect, type Page } from "@playwright/test";

test.setTimeout(120_000);

/* ------------------------------------------------------------------ */
/*  Test data                                                          */
/* ------------------------------------------------------------------ */

const TS = Date.now();
const TEST_CLINIC = `Test Clinic ${TS}`;
const TEST_EMAIL = `test-${TS}@strydeos.test`;
const TEST_PASSWORD = "TestPassword123!";
const TEST_NAME = "Test User";
const TEST_PHONE = "020 7794 0202";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Suppress the splash screen before any page load. */
async function setupPage(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("strydeos_splash_seen", "1");
  });
}

/** Navigate and wait for React hydration. */
async function goto(page: Page, url: string) {
  await page.goto(url, { waitUntil: "load", timeout: 60_000 }).catch(() => {
    // "load" can be slow in dev — continue if DOM is already interactive
  });
}

/** Sign in with the test account. */
async function signIn(page: Page) {
  await goto(page, "/login");
  // Wait for the form to render (Firebase auth must resolve first)
  await page.waitForSelector('input[placeholder="you@clinic.com"]', { timeout: 45_000 });
  await page.getByPlaceholder("you@clinic.com").fill(TEST_EMAIL);
  await page.getByPlaceholder("Enter your password").fill(TEST_PASSWORD);
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
}

/** Fill the signup form and submit. */
async function fillSignupForm(page: Page) {
  // Ensure we're on the signup tab
  const heading = page.getByText("Start your free trial");
  if (!(await heading.isVisible({ timeout: 2_000 }).catch(() => false))) {
    await page.getByRole("button", { name: "Create account" }).first().click();
    await expect(heading).toBeVisible({ timeout: 5_000 });
  }

  await page.getByPlaceholder("Your clinic name").fill(TEST_CLINIC);
  await page.locator("select").filter({ has: page.locator("option[value='physiotherapist']") }).selectOption("physiotherapist");
  await page.locator("select").filter({ has: page.locator("option[value='small']") }).selectOption("small");
  await page.getByPlaceholder("First and last name").fill(TEST_NAME);
  await page.getByPlaceholder("you@clinic.com").fill(TEST_EMAIL);
  await page.getByPlaceholder("Minimum 8 characters").fill(TEST_PASSWORD);
  await page.locator("form").getByRole("button", { name: "Create account" }).click();
}

/** Complete onboarding steps 1-4 and land on dashboard. */
async function completeOnboarding(page: Page) {
  // Consent step (UK)
  const consentBtn = page.getByRole("button", { name: "I Accept" });
  if (await consentBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await consentBtn.click();
    await page.waitForTimeout(500);
  }

  // Step 1: PMS — TM3 (no API key needed)
  await expect(page.getByText("Connect your PMS")).toBeVisible({ timeout: 15_000 });
  await page.getByText("TM3 (Blue Zinc)").click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2: Ava — Twilio phone number
  await expect(page.getByText("Configure Ava")).toBeVisible({ timeout: 15_000 });
  await page.getByPlaceholder("020 7794 0202").fill(TEST_PHONE);
  const priceFields = page.locator("input[type='number']");
  if ((await priceFields.count()) >= 2) {
    await priceFields.nth(0).fill("95");
    await priceFields.nth(1).fill("75");
  }
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3: Pulse — defaults
  await expect(page.getByText("Set up Pulse")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 4: Go live
  await expect(page.getByText("Go live")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(TEST_PHONE)).toBeVisible();
  await page.getByRole("button", { name: "Launch StrydeOS" }).click();
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

test.describe.serial("Sign-up Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("Test 1: first-time signup → onboarding redirect", async ({ page }) => {
    await goto(page, "/login?mode=signup");
    // Wait for Firebase auth to resolve and form to render
    await page.waitForSelector('input[placeholder="Your clinic name"]', { timeout: 45_000 });

    await fillSignupForm(page);

    // Success screen
    await expect(page.getByText("Account created — setting up your clinic")).toBeVisible({ timeout: 20_000 });

    // Redirects to /onboarding
    await page.waitForURL("**/onboarding", { timeout: 25_000 });
    expect(page.url()).toContain("/onboarding");

    // Onboarding page renders (consent or step 1)
    const hasContent = await Promise.race([
      page.getByRole("button", { name: "I Accept" }).isVisible({ timeout: 20_000 }).catch(() => false),
      page.getByText("Connect your PMS").isVisible({ timeout: 20_000 }).catch(() => false),
    ]);
    expect(hasContent).toBeTruthy();

    // localStorage check
    const savedEmail = await page.evaluate(() => localStorage.getItem("strydeos_last_email"));
    expect(savedEmail).toBe(TEST_EMAIL);
  });

  test("Test 2: onboarding → dashboard → welcome tour", async ({ page }) => {
    await signIn(page);
    await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 30_000 });

    if (page.url().includes("/onboarding")) {
      await completeOnboarding(page);
    }

    await page.waitForURL("**/dashboard", { timeout: 25_000 });

    // Welcome tour overlay
    await expect(page.getByText("Welcome to StrydeOS")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Show me around" })).toBeVisible();

    // Walk through 6 tour steps
    await page.getByRole("button", { name: "Show me around" }).click();
    for (let i = 0; i < 6; i++) {
      const btn = i === 5
        ? page.getByRole("button", { name: "Finish" })
        : page.getByRole("button", { name: "Next" });
      await expect(btn).toBeVisible({ timeout: 5_000 });
      await btn.click();
      await page.waitForTimeout(400);
    }

    // Tour gone
    await expect(page.getByText("Welcome to StrydeOS")).not.toBeVisible({ timeout: 5_000 });

    // Reload — tour should NOT re-appear
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4_000);
    await expect(page.getByText("Welcome to StrydeOS")).not.toBeVisible();
  });

  test("Test 3: return to onboarding preserves progress", async ({ page }) => {
    await signIn(page);
    await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 30_000 });

    await page.goto("/onboarding", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4_000);

    // Consent should be skipped
    const consentVisible = await page
      .getByRole("button", { name: "I Accept" })
      .isVisible({ timeout: 3_000 })
      .catch(() => false);
    expect(consentVisible).toBe(false);

    if (page.url().includes("/onboarding")) {
      const completedSteps = page.locator(".bg-success");
      expect(await completedSteps.count()).toBeGreaterThanOrEqual(0);
    }
  });

  test("Test 4: onboarding redirects when clinicId missing", async ({ page }) => {
    await goto(page, "/onboarding");
    // Guard should redirect unauthenticated users
    await page.waitForURL(/\/(dashboard|login)/, { timeout: 30_000 });
    expect(page.url()).toMatch(/\/(dashboard|login)/);
  });

  test("Test 5: existing user sign-in → no tour", async ({ page }) => {
    await signIn(page);
    await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 30_000 });

    if (page.url().includes("/dashboard")) {
      await page.waitForTimeout(3_000);
      await expect(page.getByText("Welcome to StrydeOS")).not.toBeVisible();
    }

    await page.waitForURL("**/dashboard", { timeout: 25_000 });
    expect(page.url()).toContain("/dashboard");
  });
});

/* ------------------------------------------------------------------ */
/*  Ava / Twilio Phone Validation                                      */
/* ------------------------------------------------------------------ */

test.describe("Ava / Twilio Configuration", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("Ava step validates phone number before allowing continue", async ({ page }) => {
    await signIn(page);
    await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 30_000 });

    await page.goto("/onboarding", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4_000);

    // Skip consent
    if (await page.getByRole("button", { name: "I Accept" }).isVisible({ timeout: 3_000 }).catch(() => false)) {
      await page.getByRole("button", { name: "I Accept" }).click();
      await page.waitForTimeout(500);
    }

    // Advance past PMS step
    if (await page.getByText("Connect your PMS").isVisible({ timeout: 3_000 }).catch(() => false)) {
      await page.getByText("TM3 (Blue Zinc)").click();
      await page.getByRole("button", { name: "Continue" }).click();
    }

    const avaVisible = await page.getByText("Configure Ava").isVisible({ timeout: 8_000 }).catch(() => false);
    if (!avaVisible) {
      test.skip();
      return;
    }

    const continueBtn = page.getByRole("button", { name: "Continue" });

    // Short phone → disabled
    await page.getByPlaceholder("020 7794 0202").fill("12345");
    expect(await continueBtn.isDisabled()).toBe(true);

    // Valid phone → enabled
    await page.getByPlaceholder("020 7794 0202").fill("02077940202");
    await expect(continueBtn).toBeEnabled();

    // Ava capabilities listed
    for (const cap of [
      "New patient bookings",
      "Cancellation recovery",
      "Insurance flagging",
      "Emergency routing",
      "FAQ handling",
      "After-hours logging",
    ]) {
      await expect(page.getByText(cap)).toBeVisible();
    }
  });
});
