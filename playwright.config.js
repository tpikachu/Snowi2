// @ts-check
const { defineConfig } = require("@playwright/test");

/**
 * E2E harness: drives the real Electron app with Playwright.
 *
 * Tests run in development mode so the renderer comes from the Vite dev
 * server (started below if it is not already running) and every cache path
 * (Qdrant, models) matches what `npm run dev` uses — nothing production is
 * touched. Each test launches its own app instance against a throwaway
 * userData directory (see e2e/launch.js), so a run never reads or writes the
 * developer's own dev data.
 *
 * One worker on purpose: each test owns a full Electron app with global
 * hotkeys and sidecar processes; two at once would race over both.
 */
module.exports = defineConfig({
  testDir: "e2e",
  workers: 1,
  // An Electron boot spawns sidecars and waits for the dev server; give each
  // test room before calling it hung.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  webServer: {
    command: "npm run dev:renderer",
    url: "http://localhost:5183",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
