// @ts-check
/* global window -- browser global used inside page.evaluate callbacks */
const { test, expect } = require("@playwright/test");
const {
  launchApp,
  controlPanelPage,
  agentBarPage,
  cueCardPage,
  skipOnboarding,
} = require("./launch");

/**
 * The assistant dot — the product's daily face, one circle (ASSISTANT_DOT).
 * These cover the promises the dot makes on its own: it is there after
 * onboarding and stays on top, it offers Start meeting, a gap in setup shows
 * on it, download progress published by the control panel rides its arc,
 * and a recording lights it up and opens the cue card beside it. Like
 * app.spec.js, assertions lean on user-visible copy from src/locales/en so
 * a copy change updates them knowingly.
 */

/** @type {import("playwright").ElectronApplication | null} */
let app = null;

test.afterEach(async () => {
  if (app) {
    await app.close().catch(() => {});
    app = null;
  }
});

/** A window's state, read from the main process, by its URL flag. */
async function windowState(application, flag) {
  return application.evaluate(({ BrowserWindow }, urlFlag) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes(urlFlag));
    return win
      ? { visible: win.isVisible(), alwaysOnTop: win.isAlwaysOnTop(), bounds: win.getBounds() }
      : null;
  }, flag);
}

test("past onboarding, the dot is on screen, on top, and offers Start meeting", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);

  // The reload remounts ControlPanel, whose backfill tells main onboarding is
  // done — the edge that makes the dot debut without a relaunch.
  const dot = await agentBarPage(app);
  const button = dot.getByRole("button", { name: "Start meeting" });
  await expect(button).toBeVisible({ timeout: 30_000 });
  await expect(button).not.toHaveAttribute("data-recording", "true");

  await expect(async () => {
    const state = await windowState(app, "agent=true");
    expect(state).not.toBeNull();
    expect(state?.visible).toBe(true);
    // "Stays on top of the app" is a window-level promise, checked at the
    // window level; and the dot is a small square, not a bar.
    expect(state?.alwaysOnTop).toBe(true);
    expect(state?.bounds.width).toBeLessThanOrEqual(120);
    expect(state?.bounds.height).toBeLessThanOrEqual(120);
  }).toPass({ timeout: 15_000 });
  await dot.screenshot({ path: test.info().outputPath("dot-idle.png"), omitBackground: true });
});

test("setup still missing shows as a badge on the dot, with the gap in its tooltip", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);

  const dot = await agentBarPage(app);
  const button = dot.getByRole("button", { name: "Start meeting" });
  await expect(button).toBeVisible({ timeout: 30_000 });
  // On a fresh profile no AI model is configured: the amber badge is up and
  // the tooltip names the gap — write-ups and chat share one model now, so
  // they share one line. Start meeting stays offered: transcription alone
  // is a meeting worth recording.
  await expect(dot.locator("[data-setup-missing]")).toBeVisible({ timeout: 30_000 });
  await expect(button).toHaveAttribute("title", /Write-ups and chat need an AI model/);
});

test("global chat offers no speed chooser in the app", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);

  // Global chat covers every meeting and note, so every ask gets the full
  // chat model — a Fast/Thinking chip here only offered a worse answer. The
  // chooser survives solely inside a live meeting's cue card. Wait for the
  // input so the absence check runs against a rendered surface.
  await page.locator('[data-tour="nav-chat"]').click();
  await expect(page.getByPlaceholder("Type a message...")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("radiogroup", { name: "Answer speed" })).toHaveCount(0);
});

test("a speech-model download published by the control panel rides the dot's arc", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);
  const dot = await agentBarPage(app);
  await expect(dot.getByRole("button", { name: "Start meeting" })).toBeVisible({
    timeout: 30_000,
  });

  // Injected through the real channel (renderer → main cache → dot), the same
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

  // Blocking: the meeting's own model is still arriving, so the dot reads
  // as the progress and the arc shows how far along.
  await publish({ displayName: "Parakeet v3", percentage: 42, isInstalling: false }, true);
  await expect(dot.getByRole("button", { name: "Downloading… 42%" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(dot.locator('[data-download="42"]')).toBeVisible();

  // Non-blocking: a different model downloading keeps Start meeting offered,
  // with the arc still answering "is it done yet".
  await publish({ displayName: "Whisper base", percentage: 87, isInstalling: false }, false);
  await expect(dot.locator('[data-download="87"]')).toBeVisible({ timeout: 15_000 });
  await expect(dot.getByRole("button", { name: "Start meeting" })).toBeEnabled();

  // Done: everything clears.
  await publish(null, false);
  await expect(dot.locator("[data-download]")).toHaveCount(0);
});

test("a recording lights the dot and opens the cue card beside it; the meeting's end puts both back", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);
  const dot = await agentBarPage(app);
  await expect(dot.getByRole("button", { name: "Start meeting" })).toBeVisible({
    timeout: 30_000,
  });

  // A meeting needs no microphone to light the dot: it reads the snapshot
  // the control panel publishes, the same one the cue card reads.
  await page.evaluate(() => {
    /** @type {any} */ (window).electronAPI.meetingPanelPublish({
      isRecording: true,
      isPaused: false,
      noteId: 1,
      title: "Product roadmap sync",
      micStatus: "active",
      systemAudio: true,
      capturedMs: 12 * 60 * 1000 + 34 * 1000,
      capturedAt: Date.now(),
    });
  });
  const recording = dot.getByRole("button", { name: /Recording · 12:3\d · click to end/ });
  await expect(recording).toBeVisible({ timeout: 15_000 });
  await expect(recording).toHaveAttribute("data-recording", "true");
  await dot.screenshot({ path: test.info().outputPath("dot-recording.png"), omitBackground: true });

  // The cue card came up in its own window, beside the dot, without focus.
  // (No AI model on a fresh profile, so its ask field says so; the toolbar
  // and the card's own X are what this test reads.)
  const card = await cueCardPage(app);
  await expect(card.getByRole("button", { name: "Stop", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(async () => {
    const dotState = await windowState(app, "agent=true");
    const cardState = await windowState(app, "meeting-panel=true");
    expect(cardState?.visible).toBe(true);
    expect(cardState?.alwaysOnTop).toBe(true);
    // Right edges aligned with the visible circle (24px inset in the 96px window).
    const dotRight = (dotState?.bounds.x ?? 0) + (dotState?.bounds.width ?? 0) - 24;
    const cardRight = (cardState?.bounds.x ?? 0) + (cardState?.bounds.width ?? 0);
    expect(Math.abs(cardRight - dotRight)).toBeLessThanOrEqual(2);
  }).toPass({ timeout: 15_000 });

  // The card's own X puts the card away; the dot keeps glowing.
  await card.getByRole("button", { name: "Hide the cue card" }).click();
  await expect(async () => {
    expect((await windowState(app, "meeting-panel=true"))?.visible).toBe(false);
  }).toPass({ timeout: 10_000 });
  await expect(recording).toHaveAttribute("data-recording", "true");

  // The meeting's end: the dot goes idle.
  await page.evaluate(() => {
    /** @type {any} */ (window).electronAPI.meetingPanelPublish(null);
  });
  await expect(dot.getByRole("button", { name: "Start meeting" })).toBeVisible({
    timeout: 15_000,
  });
});
