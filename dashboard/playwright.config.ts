import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env.local") });

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "html",
  timeout: 120_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /*
   * Use production build for E2E (dev mode has flaky hydration).
   * Run `npm run build` first, then the webServer starts `npm start`.
   * Set E2E_NO_SERVER=1 if you already have a server running.
   */
  ...(process.env.E2E_NO_SERVER
    ? {}
    : {
        webServer: {
          command: "npm start",
          url: "http://localhost:3000",
          reuseExistingServer: true,
          timeout: 30_000,
        },
      }),
});
