import "dotenv/config";
import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests against a running app with the demo data loaded (`npm run db:seed`).
 * Uses the Microsoft Edge already installed on Windows, so no browser download is needed.
 * Set E2E_CHANNEL=chrome (or leave empty after `npx playwright install chromium`) on other machines.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  // The flows share one database, so they run one after the other.
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    channel: process.env.E2E_CHANNEL === undefined ? "msedge" : process.env.E2E_CHANNEL || undefined,
    locale: "es-AR",
    timezoneId: "America/Argentina/Cordoba",
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: baseURL, reuseExistingServer: true, timeout: 180_000 },
});
