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

  // Starting lives in the window header's capture control (labeled
  // "Meeting") and in the empty state's own CTA — there is no hero button.
  await expect(page.getByRole("button", { name: "Meeting", exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "Record a meeting" })).toBeVisible();

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
  // Models — one page: the provider grid over one key field (local language
  // models are hidden behind LOCAL_LLM_ENABLED).
  await page.getByRole("button", { name: "Set up" }).first().click();
  await expect(page.getByText("Language Models").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("radiogroup", { name: "Provider" })).toBeVisible();

  // Over in Speech-to-Text the note-recording engine page loads directly —
  // a lone panel spawns no nav sub-items — and the upload surface stays
  // retired behind UPLOAD_ENABLED.
  await page.getByText("Speech-to-Text").first().click();
  // Role-based on purpose: the keep-alive panels park hidden copies of the
  // same copy in the DOM, and roles only match what is actually on screen.
  await expect(page.getByRole("region", { name: "Engine" })).toBeVisible();
  await expect(page.getByText("Audio Upload", { exact: true })).toHaveCount(0);
});

test("once a key is in, the capabilities card leaves Home", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);

  // Fresh install: the card is there because no language model is set.
  await expect(page.getByText("What Snowy can do right now")).toBeVisible({ timeout: 30_000 });

  // Entering a key IS the setup: the setter assigns that provider's scope
  // defaults, so both rows turn ready at once — and a card with nothing left
  // to set up has no reason to stay (client direction, 2026-09-11).
  await page.getByRole("button", { name: "Set up" }).first().click();
  // Language Models is the provider grid over one key field (local language
  // models are hidden), and the first provider card (OpenAI) is the selected
  // one.
  await expect(page.getByRole("radiogroup", { name: "Provider" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Add API key" }).click();
  const field = page.getByPlaceholder("Paste your API key");
  await field.fill("sk-not-a-real-key-for-the-e2e-run");
  await field.press("Enter");
  await page.keyboard.press("Escape");

  await expect(page.getByText("What Snowy can do right now")).toHaveCount(0, {
    timeout: 15_000,
  });
});
