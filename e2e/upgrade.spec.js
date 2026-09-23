// @ts-check
/* global window -- browser global used inside page.evaluate callbacks */
const { test, expect } = require("@playwright/test");
const { launchApp, controlPanelPage, skipOnboarding } = require("./launch");

/**
 * An install that ran the previous release updates into this one with its
 * stored configuration untouched — and keeps a working model.
 *
 * rc9 had two models (chat and the write-up) and never wrote the chat route
 * it derived on the read path; rc10 has one and reads what is stored. The
 * rc9 shapes are built here the way rc9 left them: the key in the secure
 * store (saved through the app, as onboarding does) and localStorage without
 * the chat keys rc9 never wrote, or with the write-up on the only keyed
 * provider. A relaunch is a reload: the store re-initializes and the repair
 * (chatRouteRepair.ts) runs once the keys hydrate.
 */

/** @type {import("playwright").ElectronApplication | undefined} */
let app;
test.afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function languageModels(page) {
  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Language Models" }).first().click();
  const grid = page.getByRole("radiogroup", { name: "Provider" });
  await expect(grid).toBeVisible({ timeout: 15_000 });
  const card = (name) => grid.getByRole("radio", { name: new RegExp(" " + name + " ") });
  return { card };
}

/** Provider card name → the preload bridge getter for its key. */
const KEY_GETTERS = {
  OpenAI: "getOpenAIKey",
  Anthropic: "getAnthropicKey",
  OpenRouter: "getOpenrouterKey",
};

async function saveKey(page, name, key) {
  const { card } = await languageModels(page);
  await card(name).click();
  await page.getByRole("button", { name: "Add API key" }).click();
  await page.getByRole("textbox", { name: "API Key" }).fill(key);
  await page.keyboard.press("Enter");
  await expect(card(name)).toContainText("In use");
  // The key reaches the main process through a debounced write; a reload
  // before it lands would look like an install with no key at all.
  await expect
    .poll(() => page.evaluate((getter) => window.electronAPI[getter](), KEY_GETTERS[name]), {
      timeout: 10_000,
    })
    .toBe(key);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

const CHAT_KEYS = ["chatAgentMode", "chatAgentProvider", "chatAgentModel", "chatAgentCloudMode"];

test("an rc9 install whose only key is Anthropic still has a model after the update", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);
  await saveKey(page, "Anthropic", "sk-ant-rc9");

  // rc9 never wrote the chat route it derived from the key.
  await page.evaluate((keys) => keys.forEach((key) => localStorage.removeItem(key)), CHAT_KEYS);
  await page.reload();
  await page.waitForLoadState("domcontentloaded");

  await page.locator('[data-tour="nav-chat"]').click();
  await expect(page.getByRole("button", { name: "Model" })).toHaveText(/Claude Sonnet 5/, {
    timeout: 15_000,
  });
  const { card } = await languageModels(page);
  await expect(card("Anthropic")).toContainText("In use");
  await expect(page.getByText("Your AI model runs on Anthropic.")).toBeVisible();
  // And it is written down now: the stored route survives the next launch.
  expect(await page.evaluate(() => localStorage.getItem("chatAgentProvider"))).toBe("anthropic");
});

test("an rc9 install that wrote its notes on OpenRouter, with chat on an unkeyed OpenAI, keeps writing there", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);
  await saveKey(page, "OpenRouter", "sk-or-rc9");

  await page.evaluate(() => {
    localStorage.setItem("chatAgentMode", "providers");
    localStorage.setItem("chatAgentProvider", "openai");
    localStorage.setItem("chatAgentModel", "gpt-5-mini");
    localStorage.setItem("actionsMode", "providers");
    localStorage.setItem("actionsProvider", "openrouter");
    localStorage.setItem("actionsModel", "openai/gpt-5-nano");
  });
  await page.reload();
  await page.waitForLoadState("domcontentloaded");

  await page.locator('[data-tour="nav-chat"]').click();
  await expect(page.getByRole("button", { name: "Model" })).toHaveText(/GPT-5 Nano/, {
    timeout: 15_000,
  });
  const { card } = await languageModels(page);
  await expect(card("OpenRouter")).toContainText("In use");
});
