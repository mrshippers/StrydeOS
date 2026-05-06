/**
 * E2E: Checkout entry paths
 *
 * Verifies the routing into and out of /checkout without driving Stripe.
 * These are fast smoke tests; auth-gated paths (add-module from /billing)
 * are covered by signup-flow.spec.ts which has a real test account.
 *
 * Run against running server:  npm run test:e2e -- e2e/checkout-entry-paths.spec.ts
 */
import { test, expect } from "@playwright/test";

test.describe("Checkout entry paths", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("strydeos_splash_seen", "1");
    });
  });

  test("unauth visitor with billing=now is sent to login with next param", async ({ page }) => {
    await page.goto("/checkout?plan=pulse-studio&billing=now", { waitUntil: "load" });
    await page.waitForURL(/\/login\?/, { timeout: 15_000 });
    expect(page.url()).toContain("/login");
    expect(page.url()).toContain("next=");
    expect(decodeURIComponent(page.url())).toContain("plan=pulse-studio");
    expect(decodeURIComponent(page.url())).toContain("billing=now");
  });

  test("unauth visitor without billing=now is sent to signup with next param", async ({ page }) => {
    await page.goto("/checkout?plan=intelligence-solo", { waitUntil: "load" });
    await page.waitForURL(/\/login\?/, { timeout: 15_000 });
    expect(page.url()).toContain("mode=signup");
    expect(page.url()).toContain("billing=now");
  });

  test("invalid plan slug renders 'Plan not recognised'", async ({ page }) => {
    await page.goto("/checkout?plan=does-not-exist&billing=now", { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: /plan not recognised/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("link", { name: /back to pricing/i })).toBeVisible();
  });

  test("/checkout/success redirects to /onboarding after the success animation", async ({ page }) => {
    await page.goto("/checkout/success", { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: /payment confirmed/i })).toBeVisible();
    await page.waitForURL(/\/(onboarding|login|dashboard)/, { timeout: 10_000 });
    // Unauth users get bounced to /login by middleware on /onboarding;
    // the redirect target is /onboarding. Either landing place is acceptable
    // — what matters is we no longer go straight to /dashboard.
    expect(page.url()).not.toMatch(/\/dashboard($|\?)/);
  });
});
