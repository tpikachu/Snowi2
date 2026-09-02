// @ts-check
const { test, expect } = require("@playwright/test");
const { launchApp, controlPanelPage, skipOnboarding } = require("./launch");

/**
 * Smoke tests over the real app: launch Electron, find the control panel
 * window, and check the surfaces a fresh tester walks through first. These
 * assert against user-visible copy from src/locales/en, so a deliberate copy
 * change updates them knowingly rather than silently.
 */

/** @type {import("playwright").ElectronApplication | null} */
let app = null;

test.afterEach(async () => {
  if (app) {
    await app.close().catch(() => {});
    app = null;
  }
});

test("a fresh install boots into onboarding", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);

  // The step rail is onboarding's structural landmark (aria-label from
  // onboarding.rail.ariaLabel) — sturdier than any one step's heading.
  await expect(page.getByLabel("Setup steps")).toBeVisible({ timeout: 30_000 });
});

test("past onboarding, Home offers Start and the capabilities card", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);

  // The page's one act, in the hero and mirrored in the window header.
  await expect(page.getByRole("button", { name: "Start meeting" }).first()).toBeVisible({
    timeout: 30_000,
  });

  // The restored setup card: on a fresh install no language model is set, so
  // it must say so instead of letting a meeting record into a void.
  await expect(page.getByText("What Snowy can do right now")).toBeVisible();
  await expect(page.getByText("Needs setup").first()).toBeVisible();

  // Hidden features stay hidden: no calendar-connect nudge on Home.
  await expect(page.getByText("Connect your calendar", { exact: true })).toHaveCount(0);
});

test("the capabilities card deep-links into Settings, where upload stays retired", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);

  // "Set up" on the missing AI-model capability opens Settings on Language
  // Models — one page now: the engine choice, keys, and the advanced hatch.
  await page.getByRole("button", { name: "Set up" }).first().click();
  await expect(page.getByText("Language Models").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Cloud Providers").first()).toBeVisible();

  // Over in Speech-to-Text the note-recording engine page loads directly —
  // a lone panel spawns no nav sub-items — and the upload surface stays
  // retired behind UPLOAD_ENABLED.
  await page.getByText("Speech-to-Text").first().click();
  // Role-based on purpose: the keep-alive panels park hidden copies of the
  // same copy in the DOM, and roles only match what is actually on screen.
  await expect(page.getByRole("region", { name: "Engine" })).toBeVisible();
  await expect(page.getByText("Audio Upload", { exact: true })).toHaveCount(0);
});
