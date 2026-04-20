import { defineConfig } from "@playwright/test";

// Root-level Playwright config dedicated to the demo recording spec.
// The dashboard package has its own config at dashboard/playwright.config.ts
// for localhost E2E — this one targets the live production portal and
// is scoped via testMatch so it never picks up unrelated specs.
export default defineConfig({
  testDir: "./scripts",
  testMatch: /record-demo\.spec\.ts$/,
  timeout: 90_000,
  workers: 1,
  reporter: "list",
  use: {
    headless: false,
    viewport: { width: 1920, height: 1080 },
    video: "on",
  },
});
