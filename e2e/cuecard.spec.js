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
 * The meeting cue card — in its own window beside the assistant dot
 * (ASSISTANT_DOT).
 *
 * A meeting needs no microphone to be rendered: the card is a view over state
 * the control panel publishes (useMeetingPanelBridge), so the test publishes
 * a snapshot and an assist thread through the same preload calls and reads
 * the card in the window main opens for it. Assertions lean on user-visible copy from
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
  webSearch: false,
  webSearchAvailable: true,
};

test("a published meeting renders the three-zone card, lifts the say-line, and captures every display", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);
  const dot = await agentBarPage(app);
  await expect(dot.getByRole("button", { name: "Start meeting" })).toBeVisible({
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
  // The publish is the start edge: main opens the card's window beside the
  // dot. Everything below reads the card there.
  const bar = await cueCardPage(app);

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

  // Asked what to say, the whole answer is the words: one say block, a
  // second under its lead-in, and the source line naming what the answer
  // read beyond the meeting — the screen it viewed and the note it drew on.
  await page.evaluate(
    ({ assist }) => {
      /** @type {any} */ (window).electronAPI.meetingPanelAssist(assist);
    },
    {
      assist: {
        ...ASSIST,
        answer: {
          question: "How do I respond to that?",
          mode: "thinking",
          text: [
            "```",
            "That's fair, the price does look high next to the pilot. I'd rather hold it and widen what's included.",
            "```",
            '- **Their point:** "the pilot was half this" — anchoring on the pilot rate.',
            "- **Why this lands:** it concedes the comparison, not the price.",
            "If you want to push further:",
            "```",
            "The pilot was priced to prove the fit, not to set the rate.",
            "```",
          ].join("\n"),
          streaming: false,
          sources: [{ noteId: 5, title: "Product roadmap sync" }],
          screens: 1,
          errorKey: null,
        },
      },
    }
  );
  await expect(bar.getByRole("group", { name: "Line to say" })).toContainText(
    "I'd rather hold it and widen what's included"
  );
  await expect(bar.getByText("Their point:")).toBeVisible();
  await expect(bar.getByText("If you want to push further:")).toBeVisible();
  // The unprompted line is set apart from the thread by its own heading.
  await expect(bar.getByText("Suggested next line")).toBeVisible();
  await expect(bar.getByRole("group", { name: "Another way to say it" })).toContainText(
    "priced to prove the fit"
  );
  await expect(bar.getByText("Viewed your screen · From Product roadmap sync")).toBeVisible();
  // No fence ever reaches the screen as code.
  await expect(bar.locator("pre")).toHaveCount(0);

  // Web search: off with every meeting, offered on a route that can search;
  // a searched answer names the search first and lists what it read as links.
  const globe = bar.getByRole("button", { name: /Search the web/ });
  await expect(globe).toBeVisible();
  await expect(globe).toHaveAttribute("aria-pressed", "false");
  await expect(globe).toBeEnabled();
  await page.evaluate(
    ({ assist }) => {
      /** @type {any} */ (window).electronAPI.meetingPanelAssist(assist);
    },
    {
      assist: {
        ...ASSIST,
        webSearch: true,
        answer: {
          ...ASSIST.answer,
          question: "Is their pricing claim right?",
          text: "Their business plan is **$20 per user per month** billed annually, per Notion's pricing page.",
          sources: [],
          searched: true,
          webSources: [{ url: "https://www.notion.com/pricing", title: "Notion Pricing Plans" }],
        },
      },
    }
  );
  await expect(bar.getByRole("button", { name: /Web search is on/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(bar.getByText("Searched the web")).toBeVisible();
  await expect(
    bar.getByRole("list", { name: "Sources" }).getByRole("button", { name: "Notion Pricing Plans" })
  ).toBeVisible();
  // A route without a search tool shows the toggle disabled, with the reason.
  await page.evaluate(
    ({ assist }) => {
      /** @type {any} */ (window).electronAPI.meetingPanelAssist(assist);
    },
    { assist: { ...ASSIST, webSearchAvailable: false } }
  );
  await expect(bar.getByRole("button", { name: /Web search isn't available/ })).toBeDisabled();

  // Zone 3: the toolbar carries capture control and configuration.
  await expect(bar.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Answer mode" })).toHaveAttribute(
    "aria-pressed",
    "false"
  );
  await expect(bar.getByRole("button", { name: "Transcript" })).toBeVisible();

  // The card can never be narrower than its toolbar (client, 2026-09-23: at
  // 386px the Transcript button and the X were clipped). Squeezed to the OS
  // floor, the window grows straight back to the toolbar's width, right edge
  // held, and every toolbar button is inside the viewport.
  const squeezed = await bar.evaluate(async () => {
    const api = /** @type {any} */ (window).electronAPI;
    const bounds = await api.getOwnWindowBounds();
    await api.setOwnWindowBounds(bounds.x + bounds.width - 320, bounds.y, 320, bounds.height);
    return bounds.x + bounds.width;
  });
  await expect
    .poll(() => bar.evaluate(() => window.innerWidth), { timeout: 10_000 })
    .toBeGreaterThan(320);
  const toolbar = bar.locator("[data-cue-card-toolbar]");
  await expect(toolbar.getByRole("button", { name: "Transcript" })).toBeInViewport();
  await expect(toolbar.getByRole("button", { name: "Hide the cue card" })).toBeInViewport();
  await expect(toolbar.getByRole("button", { name: "Model" })).toBeInViewport();
  const after = await bar.evaluate(async () => {
    const bounds = await /** @type {any} */ (window).electronAPI.getOwnWindowBounds();
    return bounds.x + bounds.width;
  });
  expect(after).toBe(squeezed);
  await bar.screenshot({ path: test.info().outputPath("cue-card-min-width.png") });

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

  // Ending the meeting puts the card away and the dot back to idle.
  await page.evaluate(() => {
    /** @type {any} */ (window).electronAPI.meetingPanelPublish(null);
  });
  await expect(dot.getByRole("button", { name: "Start meeting" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(async () => {
    const visible = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes("meeting-panel=true")
      );
      return win ? win.isVisible() : null;
    });
    expect(visible).toBe(false);
  }).toPass({ timeout: 10_000 });
});
