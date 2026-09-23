// @ts-check
/* global window -- browser global used inside page.evaluate callbacks */
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { launchApp, controlPanelPage, skipOnboarding } = require("./launch");
const { startForwardingProxy } = require("./liveProxy");

/**
 * The AI model against two REAL providers, OpenAI and OpenRouter, with the
 * developer's own keys (client direction, 2026-09-23: "need to take care of
 * this really carefully").
 *
 * Answers come back from the providers themselves. Per provider: the key
 * saved on its card is the setup, its default model answers in chat, and a
 * note's Generate Notes writes a meeting up (the non-streaming request with
 * the parameter fallback ladder). OpenRouter also answers on a model typed in
 * by id, and its GPT-5 Mini is the model that refuses "reasoning off", so its
 * first answer is the mandatory-reasoning retry landing (e37125f). With both
 * keys: the second key moves the model, a removed key moves it back and the
 * other provider answers, the last key removed stops at "needs a model" and
 * the chat says so without a request, and a key entered again is the setup
 * again.
 *
 * Opt-in, because it spends real money and needs real keys:
 *   SNOWY_LIVE_PROVIDERS=1 npx playwright test e2e/live-providers.spec.js
 * The keys come from `.env.local` at the repo root (`OPENAI_API_KEY`,
 * `OPEN_ROUTER_API_KEY`): read here, typed into the app's key fields, never
 * logged. On a machine that reaches a provider only through a proxy,
 * `SNOWY_E2E_UPSTREAM_PROXY=http://user:pass@host:port` starts a local
 * forwarder (e2e/liveProxy.js) and Electron is pointed at it.
 */

const LIVE = process.env.SNOWY_LIVE_PROVIDERS === "1";
const keys = readKeys();
test.skip(
  !LIVE || !keys,
  "set SNOWY_LIVE_PROVIDERS=1 with OPENAI_API_KEY and OPEN_ROUTER_API_KEY in .env.local"
);
test.setTimeout(10 * 60_000);

function readKeys() {
  try {
    const parsed = require("dotenv").parse(
      fs.readFileSync(path.join(__dirname, "..", ".env.local"))
    );
    const openai = parsed.OPENAI_API_KEY?.trim();
    const openrouter = parsed.OPEN_ROUTER_API_KEY?.trim();
    return openai && openrouter ? { openai, openrouter } : null;
  } catch {
    return null;
  }
}

/** @type {import("playwright").ElectronApplication | undefined} */
let app;
/** @type {{ port: number, close: () => Promise<void> } | undefined} */
let proxy;

async function launch(testInfo) {
  const args = [];
  const upstream = process.env.SNOWY_E2E_UPSTREAM_PROXY;
  if (upstream) {
    proxy = await startForwardingProxy(upstream);
    args.push(`--proxy-server=http://127.0.0.1:${proxy.port}`);
  }
  const launched = await launchApp(testInfo, { args });
  app = launched.app;
  const page = await controlPanelPage(app);
  await skipOnboarding(page);
  return page;
}

test.afterEach(async () => {
  await app?.close();
  app = undefined;
  await proxy?.close();
  proxy = undefined;
});

/** Settings → Language Models, with the provider grid ready. */
async function openLanguageModels(page) {
  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Language Models" }).first().click();
  const grid = page.getByRole("radiogroup", { name: "Provider" });
  await expect(grid).toBeVisible({ timeout: 15_000 });
  // A card's accessible name is icon alt + name + badge + readiness; the
  // spaces keep OpenAI from matching OpenRouter.
  const card = (name) => grid.getByRole("radio", { name: new RegExp(" " + name + " ") });
  const saveKey = async (name, key) => {
    await card(name).click();
    await page.getByRole("button", { name: "Add API key" }).click();
    await page.getByRole("textbox", { name: "API Key" }).fill(key);
    await page.keyboard.press("Enter");
    await expect(card(name)).toContainText("In use");
  };
  const removeKey = async (name) => {
    await card(name).click();
    await page.getByRole("button", { name: "Edit API key" }).click();
    await page.getByRole("textbox", { name: "API Key" }).fill("");
    await page.keyboard.press("Enter");
  };
  return { card, saveKey, removeKey };
}

async function closeSettings(page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function openChat(page) {
  await page.locator('[data-tour="nav-chat"]').click();
  const chip = page.getByRole("button", { name: "Model" });
  await expect(chip).toBeVisible({ timeout: 15_000 });
  return chip;
}

/**
 * Asks the chat one question and returns the assistant's bubble once it
 * holds the expected text. Counted, not `.last()`: the user's own bubble
 * repeats the word before the answer exists.
 */
async function ask(page, question, expected) {
  const bubbles = page.locator("[data-chat-bubble]");
  const before = await bubbles.count();
  const composer = page.getByPlaceholder(/Ask anything|Type a message/).last();
  await composer.fill(question);
  await page.keyboard.press("Enter");
  await expect(bubbles).toHaveCount(before + 2, { timeout: 30_000 });
  const answer = bubbles.nth(before + 1);
  await expect(answer).toContainText(expected, { timeout: 120_000 });
  return answer;
}

const oneWord = (word) => `Reply with exactly one word, in capitals, nothing else: ${word}`;

const TRANSCRIPT = (vendor) => [
  {
    text: "Let's settle the Zanzibar launch. I want the dashboard live on October 14.",
    source: "mic",
    speaker: "you",
    timestamp: 1_758_600_000_000,
  },
  {
    text: "That works. Priya owns the pricing page and I take the onboarding emails.",
    source: "system",
    timestamp: 1_758_600_010_000,
  },
  {
    text: `Budget is approved at forty thousand euros, and the analytics vendor is ${vendor}.`,
    source: "mic",
    speaker: "you",
    timestamp: 1_758_600_020_000,
  },
  {
    text: "Then the only open question is who briefs the support team before the 14th.",
    source: "system",
    timestamp: 1_758_600_030_000,
  },
];

/** A meeting note with a stored transcript, the shape a finished recording leaves. */
async function seedMeetingNote(page, title, vendor) {
  return page.evaluate(
    async ({ title, transcript }) => {
      const api = /** @type {any} */ (window).electronAPI;
      const saved = await api.saveNote(title, "", "meeting");
      const id = saved?.note?.id ?? saved?.id;
      await api.updateNote(id, { transcript });
      return id;
    },
    { title, transcript: JSON.stringify(TRANSCRIPT(vendor)) }
  );
}

/** Opens the note, clicks Generate Notes, and waits for the write-up to name `expected`. */
async function generateNotes(page, noteId, title, expected) {
  await page.locator('[data-tour="nav-notes"]').click();
  await page.getByText(title, { exact: true }).first().click();
  const button = page.getByRole("button", { name: "Generate Notes" });
  await expect(button).toBeEnabled({ timeout: 15_000 });
  await button.click();
  await expect
    .poll(
      () =>
        page.evaluate(async (id) => {
          const note = await /** @type {any} */ (window).electronAPI.getNote(id);
          return note?.enhanced_content ?? "";
        }, noteId),
      { timeout: 180_000, intervals: [2_000] }
    )
    .toContain(expected);
  // The summary is the page a meeting note opens on once it exists.
  await expect(page.locator(".ProseMirror").filter({ hasText: expected })).toBeVisible({
    timeout: 15_000,
  });
}

test("OpenAI: the key is the setup, GPT-5 Mini answers, and Generate Notes writes a meeting up", async () => {
  const page = await launch(test.info());
  const note = await seedMeetingNote(page, "Zanzibar sync", "Kestrel Analytics");

  const settings = await openLanguageModels(page);
  await settings.saveKey("OpenAI", keys.openai);
  await expect(page.getByText("Your AI model runs on OpenAI.")).toBeVisible();
  await closeSettings(page);

  const chip = await openChat(page);
  await expect(chip).toHaveText(/GPT-5 Mini/);
  await ask(page, oneWord("PINEAPPLE"), "PINEAPPLE");
  await page.screenshot({ path: test.info().outputPath("chat-openai.png") });

  await generateNotes(page, note, "Zanzibar sync", "Kestrel");
  await page.screenshot({ path: test.info().outputPath("writeup-openai.png") });
});

test("OpenRouter: the key is the setup, GPT-5 Mini and a typed-in model answer, and Generate Notes writes a meeting up", async () => {
  const page = await launch(test.info());
  const note = await seedMeetingNote(page, "Zanzibar sync", "Halcyon Metrics");

  const settings = await openLanguageModels(page);
  await settings.saveKey("OpenRouter", keys.openrouter);
  await expect(page.getByText("Your AI model runs on OpenRouter.")).toBeVisible();
  await closeSettings(page);

  // OpenRouter's GPT-5 Mini refuses "reasoning off": this answer is the
  // mandatory-reasoning retry landing.
  const chip = await openChat(page);
  await expect(chip).toHaveText(/GPT-5 Mini/);
  await ask(page, oneWord("MANGO"), "MANGO");
  await page.screenshot({ path: test.info().outputPath("chat-openrouter.png") });

  // Any model id typed into the chip answers through OpenRouter as well.
  await chip.click();
  await page.getByRole("button", { name: "Other model…" }).click();
  await page.getByRole("textbox", { name: "Other model…" }).fill("anthropic/claude-haiku-4.5");
  await page.keyboard.press("Enter");
  // A slug the curated slice knows wears the vendor label.
  await expect(chip).toHaveText(/Claude Haiku 4.5/);
  await ask(page, oneWord("KIWI"), "KIWI");

  await generateNotes(page, note, "Zanzibar sync", "Halcyon");
  await page.screenshot({ path: test.info().outputPath("writeup-openrouter.png") });
});

test("both keys: the second key moves the model, a removed key moves it back, the last removal stops at needs-a-model, and a key entered again restores it", async () => {
  const page = await launch(test.info());

  let settings = await openLanguageModels(page);
  await settings.saveKey("OpenAI", keys.openai);
  await settings.saveKey("OpenRouter", keys.openrouter);
  await expect(settings.card("OpenAI")).not.toContainText("In use");
  await closeSettings(page);
  const chip = await openChat(page);
  await expect(chip).toHaveText(/GPT-5 Mini/);
  await ask(page, oneWord("MANGO"), "MANGO");

  // Removing the OpenRouter key moves the model back to OpenAI's default,
  // says so, and OpenAI answers.
  settings = await openLanguageModels(page);
  await settings.removeKey("OpenRouter");
  await expect(
    page.getByText(
      "Your AI model moved to GPT-5 Mini on OpenAI because the OpenRouter key was removed."
    )
  ).toBeVisible({ timeout: 10_000 });
  await expect(settings.card("OpenAI")).toContainText("In use");
  await closeSettings(page);
  await expect(chip).toHaveText(/GPT-5 Mini/);
  await ask(page, oneWord("PAPAYA"), "PAPAYA");

  // Removing the last key leaves no model: the chat says so instead of
  // sending anything, and never falls to a local model.
  settings = await openLanguageModels(page);
  await settings.removeKey("OpenAI");
  await expect(page.getByText(/No AI model: the OpenAI key was removed/)).toBeVisible({
    timeout: 10_000,
  });
  await closeSettings(page);
  await ask(page, oneWord("GUAVA"), "No AI model is configured for chat");
  await page.screenshot({ path: test.info().outputPath("chat-no-model.png") });

  // The key entered again is the setup again.
  settings = await openLanguageModels(page);
  await settings.saveKey("OpenAI", keys.openai);
  await closeSettings(page);
  await expect(chip).toHaveText(/GPT-5 Mini/);
  await ask(page, oneWord("LYCHEE"), "LYCHEE");
});
