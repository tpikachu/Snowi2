// @ts-check
/* global window -- browser global used inside page.evaluate callbacks */
const { test, expect } = require("@playwright/test");
const { launchApp, controlPanelPage, agentBarPage, skipOnboarding } = require("./launch");

/**
 * The assistant bar — the product's daily face. These cover the promises the
 * bar makes on its own: it is there after onboarding and stays on top, its
 * warning icon leads to the Home setup guide, and download progress published
 * by the control panel shows up on it. Like app.spec.js, assertions lean on
 * user-visible copy from src/locales/en so a copy change updates them
 * knowingly.
 */

/** @type {import("playwright").ElectronApplication | null} */
let app = null;

test.afterEach(async () => {
  if (app) {
    await app.close().catch(() => {});
    app = null;
  }
});

/** The agent BrowserWindow's state, read from the main process. */
async function agentWindowState(application) {
  return application.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("agent=true")
    );
    return win ? { visible: win.isVisible(), alwaysOnTop: win.isAlwaysOnTop() } : null;
  });
}

test("past onboarding, the bar is on screen, on top, and offers Start meeting", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);

  // The reload remounts ControlPanel, whose backfill tells main onboarding is
  // done — the edge that makes the bar debut without a relaunch.
  const bar = await agentBarPage(app);
  await expect(bar.getByRole("button", { name: "Start meeting" })).toBeVisible({
    timeout: 30_000,
  });

  await expect(async () => {
    const state = await agentWindowState(app);
    expect(state).not.toBeNull();
    expect(state?.visible).toBe(true);
    // "Stays on top of the app" is a window-level promise, checked at the
    // window level.
    expect(state?.alwaysOnTop).toBe(true);
  }).toPass({ timeout: 15_000 });
});

test("the bar's setup warning opens Home with the capabilities card forced open", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);
  // Collapse the card deliberately: the warning's click must reopen it, or
  // the trip lands on guidance folded shut.
  await page.evaluate(() => {
    localStorage.setItem("homeCapabilitiesCollapsed", "true");
  });
  await page.reload();

  const bar = await agentBarPage(app);
  // On a fresh profile no AI model is configured, so the pulsing warning is
  // up; its accessible name lists every gap — write-ups and chat share one
  // model now, so they share one line.
  const warning = bar.getByLabel(/write-ups and chat need an AI model/i);
  await expect(warning).toBeVisible({ timeout: 30_000 });

  await warning.click();

  await expect(page.getByText("What Snowy can do right now")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Needs setup").first()).toBeVisible();
});

test("global chat offers no speed chooser, on the bar or in the app", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);
  const bar = await agentBarPage(app);
  await expect(bar.getByRole("button", { name: "Start meeting" })).toBeVisible({
    timeout: 30_000,
  });

  // Global chat covers every meeting and note, so every ask gets the full
  // chat model — a Fast/Thinking chip here only offered a worse answer. The
  // chooser survives solely inside a live meeting's cue card.
  await expect(bar.getByRole("radiogroup", { name: "Answer speed" })).toHaveCount(0);

  // Same rule in the app chat: wait for the input so the absence check runs
  // against a rendered surface, not a blank one.
  await page.locator('[data-tour="nav-chat"]').click();
  await expect(page.getByPlaceholder("Type a message...")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("radiogroup", { name: "Answer speed" })).toHaveCount(0);
});

test("clicking the ask field opens the palette, filters, and deep-links Settings", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);
  const bar = await agentBarPage(app);
  await expect(bar.getByRole("button", { name: "Start meeting" })).toBeVisible({
    timeout: 30_000,
  });

  // Focusing the field reveals the app's map: actions, then every Settings
  // destination.
  await bar.getByPlaceholder("Ask or search anything").click();
  await expect(bar.getByRole("button", { name: "Preferences" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Hotkeys" })).toBeVisible();
  // The window grows to palette height asynchronously; give the resize a
  // beat so the screenshot shows the whole menu.
  await bar.waitForTimeout(500);
  await bar.screenshot({ path: test.info().outputPath("bar-palette.png") });

  // Typing filters the rows; Enter with text would still ask the agent.
  await bar.getByPlaceholder("Ask or search anything").fill("hotk");
  await expect(bar.getByRole("button", { name: "Preferences" })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Hotkeys" })).toBeVisible();

  // A settings row lands the control panel's Settings modal on that section —
  // the keybinds page renders its keycaps.
  await bar.getByRole("button", { name: "Hotkeys" }).click();
  await expect(page.locator("kbd").first()).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: test.info().outputPath("palette-deep-link.png") });
});

test("the palette folds on Escape, on its dismiss button, and on focus loss", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);
  const bar = await agentBarPage(app);
  await expect(bar.getByRole("button", { name: "Start meeting" })).toBeVisible({
    timeout: 30_000,
  });
  const askField = bar.getByPlaceholder("Ask or search anything");
  const paletteRow = bar.getByRole("button", { name: "Preferences" });

  // The palette folds on ANY focus loss — which means a stray OS focus
  // change on the machine running this suite folds it too. Each open
  // retries, so the test asserts the behavior without demanding a desktop
  // where nothing else ever takes focus.
  const openPalette = () =>
    expect(async () => {
      await askField.click();
      await expect(paletteRow).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });

  // One Escape peels the palette only — the bar is still on screen.
  await openPalette();
  await bar.keyboard.press("Escape");
  await expect(paletteRow).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Start meeting" })).toBeVisible();

  // The dropdown carries its own dismiss button.
  await openPalette();
  await bar.getByRole("button", { name: "Dismiss" }).click();
  await expect(paletteRow).toHaveCount(0);

  // Losing focus collapses it automatically.
  await openPalette();
  await askField.blur();
  await expect(paletteRow).toHaveCount(0);
});

test("a speech-model download published by the control panel shows on the bar", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);
  const bar = await agentBarPage(app);
  await expect(bar.getByRole("button", { name: "Start meeting" })).toBeVisible({
    timeout: 30_000,
  });

  // Injected through the real channel (renderer → main cache → bar), the same
  // path useBarStatusPublisher uses — only the numbers are synthetic.
  const publish = (download, blocks) =>
    page.evaluate(
      ([d, b]) =>
        window.electronAPI?.publishBarStatus?.({
          speechOk: true,
          actionsOk: true,
          chatOk: true,
          downloadBlocksMeetingStart: b,
          download: d,
        }),
      [download, blocks]
    );

  // Blocking: the meeting's own model is still arriving, so Start meeting
  // becomes the progress readout and refuses the click.
  await publish({ displayName: "Parakeet v3", percentage: 42, isInstalling: false }, true);
  const downloadButton = bar.getByRole("button", { name: "Downloading… 42%" });
  await expect(downloadButton).toBeVisible({ timeout: 15_000 });
  await expect(downloadButton).toBeDisabled();

  // Non-blocking: a different model downloading shows as a quiet percent
  // pill while Start meeting stays live.
  await publish({ displayName: "Whisper base", percentage: 87, isInstalling: false }, false);
  await expect(bar.getByText("87%")).toBeVisible({ timeout: 15_000 });
  await expect(bar.getByRole("button", { name: "Start meeting" })).toBeEnabled();

  // Done: everything clears.
  await publish(null, false);
  await expect(bar.getByText("87%")).toHaveCount(0);
});
