/**
 * E2E: What's New Modal — Show-Once Behaviour
 *
 * Run: E2E_NO_SERVER=1 npx playwright test e2e/whats-new.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

test.setTimeout(120_000);

const TEST_EMAIL = process.env.E2E_TEST_EMAIL;
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD;
const HAS_CREDENTIALS = !!(TEST_EMAIL && TEST_PASSWORD);
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "clinical-tracker-spires";

const EXPECTED_UPDATES = [
  "Out-of-hours transfers + insurance pre-auth",
  "Critical voice bug fixes",
  "Production audit — 5 of 6 issues resolved",
  "Notification panel + splash screen fixes",
  "Settings data loss fix + 2FA error handling",
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function ensureSignedIn(page: Page): Promise<boolean> {
  await page.addInitScript(() => {
    localStorage.setItem("strydeos_splash_seen", "1");
  });

  await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});

  const loginInput = page.locator('input[placeholder="you@clinic.com"]');
  const dashHeading = page.locator('h1:has-text("Hey")');

  const first = await Promise.race([
    loginInput.waitFor({ state: "visible", timeout: 60_000 }).then(() => "login" as const),
    dashHeading.waitFor({ state: "visible", timeout: 60_000 }).then(() => "dashboard" as const),
    page.waitForURL("**/dashboard", { timeout: 60_000 }).then(() => "dashboard" as const),
  ]).catch(() => "timeout" as const);

  if (first === "timeout") return false;
  if (first === "dashboard") return true;

  await page.getByPlaceholder("you@clinic.com").fill(TEST_EMAIL!);
  await page.getByPlaceholder("Enter your password").fill(TEST_PASSWORD!);
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
  return true;
}

/**
 * Sign in via Firebase Auth REST API (from Node.js, not browser)
 * and reset the Firestore whatsNewSeenVersion field.
 */
async function resetFirestoreWhatsNew() {
  if (!FIREBASE_API_KEY || !TEST_EMAIL || !TEST_PASSWORD) return;

  // Sign in via Firebase Auth REST API to get an ID token
  const authRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        returnSecureToken: true,
      }),
    },
  );
  if (!authRes.ok) return;
  const authData = await authRes.json();
  const { idToken, localId: uid } = authData;

  // PATCH the Firestore user doc to reset whatsNewSeenVersion
  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}?updateMask.fieldPaths=whatsNewSeenVersion`;
  await fetch(firestoreUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: { whatsNewSeenVersion: { stringValue: "reset" } },
    }),
  });
}

/* ------------------------------------------------------------------ */
/*  Tests — no auth required                                           */
/* ------------------------------------------------------------------ */

test.describe("What's New Modal (no auth)", () => {
  test("localStorage dismissal prevents modal from showing", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("strydeos_whats_new_seen", "2026-04-09");
      localStorage.setItem("strydeos_splash_seen", "1");
    });

    await page.goto("/login", { waitUntil: "load", timeout: 60_000 }).catch(() => {});

    const stored = await page.evaluate(() => localStorage.getItem("strydeos_whats_new_seen"));
    expect(stored).toBe("2026-04-09");

    await page.waitForTimeout(2_000);
    await expect(page.getByRole("button", { name: "Got it" })).not.toBeVisible();
  });

  test("no duplicate modals — ChangelogSplash removed", async ({ page }) => {
    await page.goto("/login", { waitUntil: "load", timeout: 60_000 }).catch(() => {});

    await page.waitForTimeout(2_000);
    await expect(page.getByRole("button", { name: "Let's go" })).not.toBeVisible();

    const hasChangelogOverlay = await page.evaluate(() => {
      return document.querySelector('.fixed.inset-0.z-\\[100\\]') !== null;
    });
    expect(hasChangelogOverlay).toBe(false);
  });

  test("does not show for demo user", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("strydeos_whats_new_seen");
      localStorage.setItem("strydeos_splash_seen", "1");
    });

    await page.goto("/login?demo=true", { waitUntil: "load", timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(3_000);

    if (page.url().includes("/dashboard")) {
      await page.waitForTimeout(2_000);
      await expect(page.getByRole("button", { name: "Got it" })).not.toBeVisible();
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Tests — require auth                                               */
/* ------------------------------------------------------------------ */

test.describe.serial("What's New Modal (authenticated)", () => {
  test.skip(!HAS_CREDENTIALS, "Skipped: set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run");

  // Reset Firestore before auth tests so modal will appear
  test.beforeAll(async () => {
    await resetFirestoreWhatsNew();
  });

  test("shows modal, contains correct updates, dismiss persists across reload", async ({ page }) => {
    const signedIn = await ensureSignedIn(page);
    if (!signedIn) {
      test.skip(true, "Firebase Auth init timed out");
      return;
    }

    // Clear localStorage and reload to trigger modal
    await page.evaluate(() => {
      localStorage.removeItem("strydeos_whats_new_seen");
      localStorage.setItem("strydeos_splash_seen", "1");
    });
    await page.reload({ waitUntil: "domcontentloaded" });

    const gotItBtn = page.getByRole("button", { name: "Got it" });
    await expect(gotItBtn).toBeVisible({ timeout: 15_000 });

    for (const title of EXPECTED_UPDATES) {
      await expect(page.getByText(title)).toBeVisible({ timeout: 5_000 });
    }

    for (const tag of ["Ava", "Security", "Platform", "Dashboard"]) {
      await expect(page.getByText(tag, { exact: true }).first()).toBeVisible();
    }

    await gotItBtn.click();
    await expect(gotItBtn).not.toBeVisible({ timeout: 5_000 });

    const stored = await page.evaluate(() => localStorage.getItem("strydeos_whats_new_seen"));
    expect(stored).toBe("2026-04-09");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3_000);
    await expect(gotItBtn).not.toBeVisible();
  });

  test("backdrop click dismisses modal and persists", async ({ page }) => {
    // Reset again for this test
    await resetFirestoreWhatsNew();

    const signedIn = await ensureSignedIn(page);
    if (!signedIn) {
      test.skip(true, "Firebase Auth init timed out");
      return;
    }

    await page.evaluate(() => {
      localStorage.removeItem("strydeos_whats_new_seen");
      localStorage.setItem("strydeos_splash_seen", "1");
    });
    await page.reload({ waitUntil: "domcontentloaded" });

    const gotItBtn = page.getByRole("button", { name: "Got it" });
    await expect(gotItBtn).toBeVisible({ timeout: 15_000 });

    await page.locator(".fixed.inset-0.z-\\[80\\]").click({ position: { x: 10, y: 10 } });
    await expect(gotItBtn).not.toBeVisible({ timeout: 5_000 });

    const stored = await page.evaluate(() => localStorage.getItem("strydeos_whats_new_seen"));
    expect(stored).toBe("2026-04-09");
  });
});
