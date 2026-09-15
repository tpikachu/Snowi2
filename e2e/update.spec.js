// @ts-check
const { test, expect } = require("@playwright/test");
const { launchApp, controlPanelPage, skipOnboarding } = require("./launch");

/**
 * The update banner. An unpackaged app has no feed, so the run is driven by
 * the dev-only fake-release hook (SNOWY_FAKE_UPDATE_VERSION in src/updater.js):
 * main announces that version after startup and fakes its download.
 * Assertions lean on user-visible copy from src/locales/en.
 */

/** @type {import("playwright").ElectronApplication | null} */
let app = null;

test.afterEach(async () => {
  if (app) {
    await app.close().catch(() => {});
    app = null;
  }
});

test("a new version shows a banner that stays until acted on, and Later snoozes it for the day", async () => {
  ({ app } = await launchApp(test.info(), { env: { SNOWY_FAKE_UPDATE_VERSION: "0.1.0-rc99" } }));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);

  const banner = page.getByTestId("update-banner");
  await expect(banner).toContainText("Snowy 0.1.0-rc99 is available.", { timeout: 20_000 });
  await page.screenshot({ path: test.info().outputPath("update-banner-available.png") });

  // The corner card is the other half of the announcement: its own window.
  await expect
    .poll(() => app?.windows().some((w) => w.url().includes("update-notification=true")), {
      timeout: 10_000,
    })
    .toBe(true);

  // Download runs in the strip and ends on the restart offer.
  await banner.getByRole("button", { name: "Download" }).click();
  await expect(banner).toContainText("is ready to install", { timeout: 15_000 });
  await expect(banner.getByRole("button", { name: "Restart to update" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("update-banner-ready.png") });

  // Later hides it, and the choice survives a reload.
  await banner.getByRole("button", { name: "Later" }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("button", { name: "Settings" }).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("update-banner")).toHaveCount(0);
});
