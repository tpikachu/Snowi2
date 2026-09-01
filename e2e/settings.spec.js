// @ts-check
const { test, expect } = require("@playwright/test");
const { launchApp, controlPanelPage, skipOnboarding } = require("./launch");

/**
 * The settings surfaces reworked in the Cluely pass: the keybinds page (a
 * reviewable keymap — caps on closed rows, editors behind a click) and the
 * text-size preference (renderer zoom on the control panel window only).
 * Assertions lean on user-visible copy from src/locales/en, so a copy change
 * updates them knowingly.
 */

/** @type {import("playwright").ElectronApplication | null} */
let app = null;

test.afterEach(async () => {
  if (app) {
    await app.close().catch(() => {});
    app = null;
  }
});

test("the keybinds page reads as caps, and opens an editor on click", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);

  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Hotkeys" }).first().click();

  // Meeting mode ships bound by default, so its row shows keycaps...
  await expect(page.locator("kbd").first()).toBeVisible({ timeout: 15_000 });
  // ...while the opt-in slots show their unbound state instead of an editor.
  await expect(page.getByText("Not set").first()).toBeVisible();

  await page.screenshot({ path: test.info().outputPath("keybinds-closed.png") });

  // A closed row hides its editor; clicking the row reveals it.
  const meetingRow = page.getByRole("button", { name: /Meeting mode/ }).first();
  await meetingRow.click();
  await expect(meetingRow).toHaveAttribute("aria-expanded", "true");
  await page.screenshot({ path: test.info().outputPath("keybinds-open.png") });
});

test("the text-size preference zooms the control panel window", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);

  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Preferences" }).first().click();

  await page.getByRole("button", { name: "Larger", exact: true }).click();

  // The zoom is a window-level fact; read it from the main process.
  await expect(async () => {
    const zoom = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes("panel=true")
      );
      return win ? win.webContents.zoomFactor : null;
    });
    expect(zoom).toBeCloseTo(1.25, 2);
  }).toPass({ timeout: 10_000 });

  await page.screenshot({ path: test.info().outputPath("textsize-larger.png") });

  // Back to default: the zoom follows.
  await page.getByRole("button", { name: "Default", exact: true }).click();
  await expect(async () => {
    const zoom = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes("panel=true")
      );
      return win ? win.webContents.zoomFactor : null;
    });
    expect(zoom).toBeCloseTo(1, 2);
  }).toPass({ timeout: 10_000 });
});
