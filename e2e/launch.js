// @ts-check
const path = require("path");
const { _electron: electron } = require("@playwright/test");

const PROJECT_ROOT = path.join(__dirname, "..");

/** How long to wait for the control panel window to exist and finish loading. */
const CONTROL_PANEL_TIMEOUT_MS = 60_000;

/**
 * Launches the real app the way `npm run dev` does, but against a throwaway
 * userData directory so the run looks like a fresh install and never touches
 * the developer's own dev data (see SNOWY_USER_DATA_DIR in main.js).
 *
 * @param {import("@playwright/test").TestInfo} testInfo
 * @returns {Promise<{ app: import("playwright").ElectronApplication, userDataDir: string }>}
 */
async function launchApp(testInfo) {
  const userDataDir = testInfo.outputPath("user-data");
  const env = {
    ...process.env,
    NODE_ENV: "development",
    SNOWY_CHANNEL: "development",
    SNOWY_USER_DATA_DIR: userDataDir,
  };
  // Inherited from a shell that ran electron-as-node (the better-sqlite3 ABI
  // check does), this turns the binary into plain Node and the launch dies on
  // "bad option: --remote-debugging-port".
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    // Resolved explicitly: from a plain Node process, require("electron")
    // returns the path to the binary the project has installed.
    executablePath: require("electron"),
    args: [PROJECT_ROOT],
    cwd: PROJECT_ROOT,
    env,
  });
  return { app, userDataDir };
}

/**
 * The window that carries the UI under test. The app opens several windows at
 * startup (the dictation overlay is the plain URL); the control panel is
 * tagged with ?panel=true in every build (see src/utils/windowContext.ts).
 *
 * Polled rather than event-driven: windows exist before their URL loads, so
 * a single "window" event can hand back about:blank.
 *
 * @param {import("playwright").ElectronApplication} app
 * @returns {Promise<import("playwright").Page>}
 */
async function controlPanelPage(app) {
  const deadline = Date.now() + CONTROL_PANEL_TIMEOUT_MS;
  for (;;) {
    for (const page of app.windows()) {
      if (page.url().includes("panel=true")) {
        await page.waitForLoadState("domcontentloaded");
        return page;
      }
    }
    if (Date.now() > deadline) {
      const urls = app.windows().map((page) => page.url());
      throw new Error(`Control panel window never appeared. Windows: ${JSON.stringify(urls)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/**
 * The assistant bar window (?agent=true) — the product's daily face. Same
 * polling rationale as controlPanelPage.
 *
 * @param {import("playwright").ElectronApplication} app
 * @returns {Promise<import("playwright").Page>}
 */
async function agentBarPage(app) {
  const deadline = Date.now() + CONTROL_PANEL_TIMEOUT_MS;
  for (;;) {
    for (const page of app.windows()) {
      if (page.url().includes("agent=true")) {
        await page.waitForLoadState("domcontentloaded");
        return page;
      }
    }
    if (Date.now() > deadline) {
      const urls = app.windows().map((page) => page.url());
      throw new Error(`Assistant bar window never appeared. Windows: ${JSON.stringify(urls)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/**
 * Marks the first-run flows — onboarding and the product tour — as already
 * done and reloads, landing the window on the control panel. Without the tour
 * flag its modal overlay swallows every click the tests try to make.
 *
 * Reloading also remounts ControlPanel, whose backfill notifies main that
 * onboarding is done — which is the edge that makes the assistant bar debut
 * without a relaunch.
 *
 * @param {import("playwright").Page} page
 */
async function skipOnboarding(page) {
  await page.evaluate(() => {
    localStorage.setItem("onboardingCompleted", "true");
    // TOUR_STORAGE_KEY in src/config/tourSteps.ts; completion is
    // "stored version >= current", so a high number survives version bumps.
    localStorage.setItem("tourCompletedVersion", "999");
  });
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
}

module.exports = { launchApp, controlPanelPage, agentBarPage, skipOnboarding };
