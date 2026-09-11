// @ts-check
/* global window -- browser global used inside page.evaluate callbacks */
const { test, expect } = require("@playwright/test");
const { launchApp, controlPanelPage, agentBarPage, skipOnboarding } = require("./launch");

/**
 * The meeting cue card — the bar's other face.
 *
 * A meeting needs no microphone to be rendered: the card is a view over state
 * the control panel publishes (useMeetingPanelBridge), so the test publishes
 * a snapshot and an assist thread through the same preload calls and reads
 * the card in the bar window. Assertions lean on user-visible copy from
 * src/locales/en, like the other specs.
 */

/** @type {import("playwright").ElectronApplication | null} */
let app = null;

test.afterEach(async () => {
  if (app) {
    await app.close().catch(() => {});
    app = null;
  }
});

const SNAPSHOT = {
  isRecording: true,
  isPaused: false,
  noteId: 1,
  title: "Product roadmap sync",
  micStatus: "active",
  systemAudio: true,
  capturedMs: 25 * 60 * 1000,
  capturedAt: 0,
};

const ASSIST = {
  configured: true,
  lastTime: null,
  suggestion: {
    text: "We can commit to calendar sync in the initial version.",
    sources: [],
    stale: false,
  },
  suggestionPending: false,
  answer: {
    question: "What should I say?",
    mode: "fast",
    text: [
      "Calendar sync is **still incomplete**.",
      "- **Open ask:** a timeline for the missing features.",
      "`The missing pieces land by the 14th, and I'll send the timeline tonight.`",
    ].join("\n"),
    streaming: false,
    sources: [{ noteId: 5, title: "Product roadmap sync" }],
    errorKey: null,
  },
  answerHistory: [],
};

test("a published meeting renders the three-zone card, lifts the say-line, and captures every display", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);
  const bar = await agentBarPage(app);
  await expect(bar.getByRole("button", { name: "Start meeting" })).toBeVisible({
    timeout: 30_000,
  });

  await page.evaluate(
    ({ snapshot, assist }) => {
      const api = /** @type {any} */ (window).electronAPI;
      api.meetingPanelPublish({ ...snapshot, capturedAt: Date.now() });
      api.meetingPanelAssist(assist);
    },
    { snapshot: SNAPSHOT, assist: ASSIST }
  );

  // Zone 1: the ask bar on top, with the quick-action chips under it.
  const ask = bar.getByPlaceholder("Ask about this meeting…");
  await expect(ask).toBeVisible({ timeout: 15_000 });
  await expect(bar.getByRole("button", { name: "What should I say?" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Recap so far" })).toBeVisible();

  // Zone 2: the thread. The suggestion and the answer's trailing backticked
  // line both render as say-line blocks with a copy button; the answer body
  // keeps its bold lead and bullet.
  await expect(bar.getByRole("group", { name: "Something you could say next" })).toContainText(
    "We can commit to calendar sync"
  );
  const sayLine = bar.getByRole("group", { name: "Line to say" });
  await expect(sayLine).toContainText("The missing pieces land by the 14th");
  await expect(sayLine.getByRole("button", { name: "Copy this line" })).toBeVisible();
  await expect(bar.getByText("still incomplete")).toBeVisible();
  await expect(bar.getByText("Open ask:")).toBeVisible();
  // A settled fast answer offers the escalation; no uppercase section labels remain.
  await expect(bar.getByRole("button", { name: "Think deeper" })).toBeVisible();
  await expect(bar.getByText("Suggested", { exact: true })).toHaveCount(0);

  // Zone 3: the toolbar carries capture control and configuration.
  await expect(bar.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Answer mode" })).toHaveAttribute(
    "aria-pressed",
    "false"
  );
  await expect(bar.getByRole("button", { name: "Show transcript" })).toBeVisible();

  // A picture of the card in the test's output (test-results/<test>/cue-card.png):
  // card changes are reviewed from here rather than by launching the app.
  const shot = test.info().outputPath("cue-card.png");
  await bar.screenshot({ path: shot });
  await test.info().attach("cue-card", { path: shot, contentType: "image/png" });

  // Observe: the eye turns on, and with more than one display the screen
  // picker appears beside it.
  await bar.getByRole("button", { name: /Watch my screen/ }).click();
  const displays = await page.evaluate(() =>
    /** @type {any} */ (window).electronAPI.listDisplays()
  );
  const access = await page.evaluate(() =>
    /** @type {any} */ (window).electronAPI.checkScreenRecordingAccess()
  );
  if (access?.granted) {
    await expect(bar.getByRole("button", { name: /Watching your screen/ })).toBeVisible();
    if (displays.length > 1) {
      await expect(bar.getByRole("button", { name: "Which screen to watch" })).toContainText(
        "All screens"
      );
    }
    // The capture the next question would carry: one labeled image per
    // display, in reading order, capped at three.
    const images = await page.evaluate(() =>
      /** @type {any} */ (window).electronAPI
        .captureMeetingScreens("all")
        .then((/** @type {any[]} */ list) =>
          list.map((image) => ({ label: image.label, bytes: image.data.length }))
        )
    );
    expect(images.length).toBe(Math.min(displays.length, 3));
    images.forEach((image, index) => {
      expect(image.label).toMatch(new RegExp(`^Screen ${index + 1} of ${images.length}`));
      expect(image.bytes).toBeGreaterThan(1000);
    });
  }

  // Ending the meeting hands the bar back.
  await page.evaluate(() => {
    /** @type {any} */ (window).electronAPI.meetingPanelPublish(null);
  });
  await expect(bar.getByRole("button", { name: "Start meeting" })).toBeVisible({
    timeout: 15_000,
  });
});
