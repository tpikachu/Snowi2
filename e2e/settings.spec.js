// @ts-check
const { test, expect } = require("@playwright/test");
const { launchApp, controlPanelPage, skipOnboarding } = require("./launch");

/**
 * The settings surfaces reworked in the Cluely pass: the keymap (flat rows,
 * caps on the right, recorded in place), the one-page Language Models setup
 * (engine choice + keys), and the text-size preference (renderer zoom on the
 * control panel window only). Assertions lean on user-visible copy from
 * src/locales/en, so a copy change updates them knowingly.
 */

/** @type {import("playwright").ElectronApplication | null} */
let app = null;

test.afterEach(async () => {
  if (app) {
    await app.close().catch(() => {});
    app = null;
  }
});

test("the keymap reads as caps and records in place", async () => {
  // Main seeds Ctrl+Shift+M and Ctrl+Shift+K on first launch whenever the OS
  // grants them, and records the seed under these markers so a deliberate
  // clear is never undone. The markers are read from the environment, so
  // setting them here is the app's own way of saying "already decided" —
  // without it this test only passed while another Snowy on the machine
  // happened to own both accelerators.
  ({ app } = await launchApp(test.info(), {
    env: { MEETING_KEY_DEFAULTED: "1", CHAT_AGENT_KEY_DEFAULTED: "1" },
  }));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);

  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Hotkeys" }).first().click();

  // Nothing bound: both rows show the unbound chip with a one-click
  // suggestion, and the meeting row's layout select sits inline beneath it —
  // no editor to open, nothing folded away.
  await expect(page.getByText("Not set").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Use Ctrl+Shift+M" })).toBeVisible();
  await expect(page.getByText("When triggered by hotkey, open in:")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("keymap.png") });

  // Clicking the chip turns it into a recorder, right there in the row —
  // the reference product's manner. Deliberately not committed: actually
  // registering a combo would race whatever already owns it on the machine
  // running this suite (Ctrl+Shift+M lost that race once already).
  await page.getByText("Not set").first().click();
  await expect(page.locator("[data-capturing]")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("keymap-recording.png") });

  // Clicking away stops the recorder and the chip returns.
  await page.getByRole("button", { name: "Hotkeys" }).first().click();
  await expect(page.locator("[data-capturing]")).toHaveCount(0);
  await expect(page.getByText("Not set").first()).toBeVisible();
});

test("models are picked at point of use; Settings is engine plus keys", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);

  // The chat composer carries the model chip — the pick lives where it's used.
  await page.locator('[data-tour="nav-chat"]').click();
  await expect(page.getByPlaceholder("Type a message...")).toBeVisible({ timeout: 15_000 });
  const chip = page.getByRole("button", { name: "Model" });
  await expect(chip).toBeVisible();

  // On a fresh profile no provider has a key, so the popover offers only
  // "add a key" rows — never a model that would 401.
  await chip.click();
  await expect(page.getByText("Add key").first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("model-chip-popover.png") });
  await page.keyboard.press("Escape");

  // Settings → Language Models is one page: the Cloud | Local engine cards
  // lead (local language models are back, labelled — client direction
  // 2026-09-18), and a fresh install sits on Cloud: the provider grid over
  // one key field.
  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Language Models" }).first().click();
  await expect(page.getByRole("radiogroup", { name: "Provider" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: /Cloud Providers/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.getByText("OpenAI").first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("language-models-panel.png") });

  // Local: one honest line about the trade, then rows labelled for their use
  // case — a tier, the memory each needs, what it gives up — with the current
  // generation first and the rest under one "more" row.
  await page.getByRole("button", { name: /^Local/ }).click();
  await expect(page.getByText("Runs on this computer.")).toBeVisible();
  await expect(page.getByText("Best local answers").first()).toBeVisible();
  await expect(page.getByText(/About \d+ GB of memory|Needs about \d+ GB/).first()).toBeVisible();
  await expect(page.getByText("No web search").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Show \d+ more models/ })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("language-models-local.png") });
  // What it gives up is a warning badge, and its tooltip explains the feature
  // rather than the badge (client direction, 2026-09-22).
  await page.locator('[data-local-caveat="web"]').first().hover();
  await expect(page.getByRole("tooltip")).toContainText("Web search lets Snowy look things up");
  await page.screenshot({ path: test.info().outputPath("language-models-local-caveat.png") });
  await page.locator('[data-local-caveat="tools"]').first().hover();
  await expect(page.getByRole("tooltip")).toContainText("can't use tools at all");

  // And back, so the profile is left where it started.
  await page.getByRole("button", { name: /Cloud Providers/ }).click();
  await expect(page.getByRole("radiogroup", { name: "Provider" })).toBeVisible();
});

test("the provider card is the switch: a key saved on the chosen card moves the model there", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);

  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Language Models" }).first().click();

  const grid = page.getByRole("radiogroup", { name: "Provider" });
  await expect(grid).toBeVisible({ timeout: 15_000 });
  // A card's accessible name is icon alt + name + badge + readiness; the
  // spaces keep OpenAI from matching OpenRouter.
  const card = (name) => grid.getByRole("radio", { name: new RegExp(" " + name + " ") });
  await expect(card("OpenAI")).toBeVisible();

  // Nothing keyed yet: the first card is merely selected, and the hint says
  // what saving a key there would do.
  await expect(page.getByText("Save a key to move your AI model to OpenAI.")).toBeVisible();

  // A keyless card clicked is a pending choice, not a switch.
  await card("Anthropic").click();
  await expect(card("Anthropic")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Save a key to move your AI model to Anthropic.")).toBeVisible();

  // Saving its key is the switch (client, 2026-09-15: "added the key, it
  // still uses the previous provider, no obvious way to switch").
  await page.getByRole("button", { name: "Add API key" }).click();
  await page.getByRole("textbox", { name: "API Key" }).fill("sk-ant-e2e");
  await page.keyboard.press("Enter");
  await expect(card("Anthropic")).toContainText("In use");
  await expect(page.getByText("Your AI model runs on Anthropic.")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("provider-in-use.png") });

  // Another keyless card is pending again; Anthropic keeps serving meanwhile.
  await card("OpenAI").click();
  await expect(page.getByText("Save a key to move your AI model to OpenAI.")).toBeVisible();
  await expect(card("Anthropic")).toContainText("In use");

  // OpenRouter is a provider like the others now: its key routes the model
  // at the curated slug…
  await card("OpenRouter").click();
  await page.getByRole("button", { name: "Add API key" }).click();
  await page.getByRole("textbox", { name: "API Key" }).fill("sk-or-e2e");
  await page.keyboard.press("Enter");
  await expect(card("OpenRouter")).toContainText("In use");
  await expect(card("Anthropic")).not.toContainText("In use");

  // …a keyed card that is not in use offers the explicit switch, and a
  // click alone does not move anything…
  await card("Anthropic").click();
  await expect(page.getByText("Anthropic has a key. Your AI model runs elsewhere.")).toBeVisible();
  await expect(card("OpenRouter")).toContainText("In use");
  await page.getByRole("button", { name: "Use Anthropic" }).click();
  await expect(card("Anthropic")).toContainText("In use");
  await expect(card("OpenRouter")).not.toContainText("In use");
  await card("OpenRouter").click();
  await page.getByRole("button", { name: "Use OpenRouter" }).click();
  await expect(card("OpenRouter")).toContainText("In use");

  // …and the chat chip shows the pick under the vendor's label, and takes an
  // id typed in for anything beyond the curated slice. Settings is a modal;
  // close it before reaching for the nav.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator('[data-tour="nav-chat"]').click();
  const chip = page.getByRole("button", { name: "Model" });
  await expect(chip).toHaveText(/GPT-5 Mini/, { timeout: 15_000 });
  await chip.click();
  await page.getByRole("button", { name: "Other model…" }).click();
  await page.getByRole("textbox", { name: "Other model…" }).fill("mistralai/mistral-small-2603");
  await page.keyboard.press("Enter");
  await expect(chip).toHaveText(/mistralai\/mistral-small-2603/);
  await page.screenshot({ path: test.info().outputPath("provider-openrouter-chip.png") });
});

test("a removed key moves the model to the next keyed provider, and the last one stops at needs-a-model", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);

  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Language Models" }).first().click();
  const grid = page.getByRole("radiogroup", { name: "Provider" });
  await expect(grid).toBeVisible({ timeout: 15_000 });
  const card = (name) => grid.getByRole("radio", { name: new RegExp(" " + name + " ") });
  const saveKey = async (name, key) => {
    await card(name).click();
    await page.getByRole("button", { name: "Add API key" }).click();
    await page.getByRole("textbox", { name: "API Key" }).fill(key);
    await page.keyboard.press("Enter");
  };

  // A key saved on the chosen card is the switch, each time.
  await saveKey("OpenAI", "sk-e2e-openai");
  await expect(card("OpenAI")).toContainText("In use");
  await saveKey("Anthropic", "sk-ant-e2e");
  await expect(card("Anthropic")).toContainText("In use");
  await expect(card("OpenAI")).not.toContainText("In use");

  // The chat chip is the one model: a pick there shows on the provider page.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator('[data-tour="nav-chat"]').click();
  const chip = page.getByRole("button", { name: "Model" });
  await expect(chip).toHaveText(/Claude Sonnet 5/, { timeout: 15_000 });
  await chip.click();
  await page
    .getByRole("button", { name: /GPT-5 Mini/ })
    .first()
    .click();
  await expect(chip).toHaveText(/GPT-5 Mini/);
  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Language Models" }).first().click();
  await expect(card("OpenAI")).toContainText("In use");
  await expect(card("Anthropic")).not.toContainText("In use");
  await page.screenshot({ path: test.info().outputPath("provider-two-keys.png") });

  // Removing OpenAI's key moves the model to Anthropic's default, and says so.
  await page.getByRole("button", { name: "Edit API key" }).click();
  await page.getByRole("textbox", { name: "API Key" }).fill("");
  await page.keyboard.press("Enter");
  await expect(
    page.getByText(
      "Your AI model moved to Claude Sonnet 5 on Anthropic because the OpenAI key was removed."
    )
  ).toBeVisible({ timeout: 10_000 });
  await expect(card("Anthropic")).toContainText("In use");
  await expect(card("OpenAI")).not.toContainText("In use");

  // Removing the last key leaves no model, with the trip to set one up —
  // never a local model (client decision, 2026-09-22).
  await card("Anthropic").click();
  await page.getByRole("button", { name: "Edit API key" }).click();
  await page.getByRole("textbox", { name: "API Key" }).fill("");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/No AI model: the Anthropic key was removed/)).toBeVisible({
    timeout: 10_000,
  });
  await expect(card("Anthropic")).not.toContainText("In use");
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

test("a cloud speech provider without a key is not Active, and Home asks for the setup", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);

  // Speech-to-Text on the Cloud engine with no key on OpenAI: neither the
  // engine card nor the chosen model may say "Active" — that badge over a
  // missing key promised a transcription the first meeting could not
  // deliver (client, 2026-09-22).
  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByText("Speech-to-Text").first().click();
  const engine = page.getByRole("region", { name: "Engine" });
  await expect(engine).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /Cloud Providers/ }).click();
  await expect(page.getByRole("button", { name: /Cloud Providers/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.locator("[data-mode-status]")).toHaveText("Needs key");
  await expect(page.locator('[data-selected-badge="warning"]')).toHaveText("Needs key");
  await expect(engine.getByText("Active", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("speech-cloud-no-key.png") });

  // Home: the transcription row needs setup, says why, and Set up lands
  // back on this page.
  await page.keyboard.press("Escape");
  await expect(page.getByText("What Snowy can do right now")).toBeVisible({ timeout: 15_000 });
  const row = page.locator("li", { hasText: "Recording and transcription" });
  await expect(row.getByText("Needs setup", { exact: true })).toBeVisible();
  await expect(row.getByText(/Meetings would record with no transcript/)).toBeVisible();
  await expect(page.getByText(/Meetings need a transcription engine/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("home-speech-needs-setup.png") });
  await page.getByRole("button", { name: "Set up" }).first().click();
  await expect(page.getByRole("region", { name: "Engine" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[data-mode-status]")).toHaveText("Needs key");
});

const FAKE_MEDIA_ARGS = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"];

// The speech route rc9 shipped: the recommended NVIDIA model, picked, and
// (under an isolated cache root) not on disk.
const seedLocalSpeechRoute = (page) =>
  page.evaluate(() => {
    for (const scope of ["", "meeting"]) {
      const key = (name) => (scope ? scope + name[0].toUpperCase() + name.slice(1) : name);
      localStorage.setItem(key("transcriptionMode"), "local");
      localStorage.setItem(key("useLocalWhisper"), "true");
      localStorage.setItem(key("localTranscriptionProvider"), "nvidia");
      localStorage.setItem(key("parakeetModel"), "nemotron-speech-streaming-en-0.6b");
    }
  });

test("a local speech model that is not on disk is not ready, and Remove models resets every model choice", async () => {
  // The launcher's cache root is throwaway, so "Delete Models" below never
  // touches the developer's own downloads.
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);
  await seedLocalSpeechRoute(page);
  await page.reload();
  await page.waitForLoadState("domcontentloaded");

  // Home: the model is picked but not here — the row says so, instead of
  // "Working" over a model that cannot transcribe (client, 2026-09-23).
  await expect(page.getByText("What Snowy can do right now")).toBeVisible({ timeout: 15_000 });
  const row = page.locator("li", { hasText: "Recording and transcription" });
  await expect(row.getByText("Needs setup", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(row.getByText(/not on this computer yet/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("home-speech-needs-download.png") });

  // Speech-to-Text: the Local card wears the same gap.
  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByText("Speech-to-Text").first().click();
  await expect(page.locator("[data-mode-status]")).toHaveText("Needs download", {
    timeout: 15_000,
  });

  // Settings → System → Remove models: the files, and every model choice.
  await page.getByRole("button", { name: "System" }).first().click();
  await expect(page.getByRole("button", { name: "Remove models" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Remove models" }).click();
  await expect(page.getByText("Remove downloaded models?")).toBeVisible();
  await expect(page.getByText(/Your API keys stay/)).toBeVisible();
  await page.getByRole("button", { name: "Delete Models" }).click();
  await expect(page.getByText("Models removed")).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: test.info().outputPath("models-removed.png") });
  await page.keyboard.press("Escape");

  // The pick is gone: the Local card now asks for a model...
  await page.getByText("Speech-to-Text").first().click();
  await expect(page.locator("[data-mode-status]")).toHaveText("Pick a model", { timeout: 15_000 });
  const stored = await page.evaluate(() => ({
    meetingParakeetModel: localStorage.getItem("meetingParakeetModel"),
    parakeetModel: localStorage.getItem("parakeetModel"),
    meetingTranscriptionMode: localStorage.getItem("meetingTranscriptionMode"),
    chatAgentModel: localStorage.getItem("chatAgentModel"),
  }));
  expect(stored).toEqual({
    meetingParakeetModel: "",
    parakeetModel: "",
    meetingTranscriptionMode: "local",
    chatAgentModel: "",
  });

  // ...and Home asks for the setup, in the local engine's words.
  await page.keyboard.press("Escape");
  await expect(row.getByText("Needs setup", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(row.getByText(/Pick a speech model/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("home-after-model-reset.png") });
});

test("the device checks hear the microphone and report on system audio", async () => {
  ({ app } = await launchApp(test.info(), { args: FAKE_MEDIA_ARGS }));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);

  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Preferences" }).first().click();
  await expect(page.getByText("Check your devices")).toBeVisible({ timeout: 15_000 });

  // The microphone: Chromium's fake device plays a tone, so the meter moves
  // and the verdict is "heard".
  const mic = page.locator('[data-audio-check="mic"]');
  await mic.getByRole("button", { name: "Test microphone" }).click();
  await expect(mic.getByRole("meter")).toBeVisible({ timeout: 5_000 });
  await expect(mic.locator("[data-audio-verdict]")).toHaveAttribute("data-audio-verdict", "heard", {
    timeout: 15_000,
  });
  await expect(mic.getByText(/loud and clear/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("audio-check-mic.png") });

  // System audio: whatever this machine offers, the check answers within
  // its listen and names how it listened.
  const system = page.locator('[data-audio-check="system"]');
  await system.getByRole("button", { name: "Test system audio" }).click();
  await expect(system.getByText(/Listening…/)).toBeVisible({ timeout: 5_000 });
  const verdict = system.locator("[data-audio-verdict]");
  await expect(verdict).toBeVisible({ timeout: 30_000 });
  expect(["heard", "silent", "nothing", "unsupported", "failed"]).toContain(
    await verdict.getAttribute("data-audio-verdict")
  );
  await page.screenshot({ path: test.info().outputPath("audio-check-system.png") });
});

test("Test transcription shows the route's own error, cloud and local", async () => {
  ({ app } = await launchApp(test.info(), { args: FAKE_MEDIA_ARGS }));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);

  // A cloud route with no key: the failure a meeting would have found.
  await page.evaluate(() => {
    localStorage.setItem("meetingTranscriptionMode", "providers");
    localStorage.setItem("meetingUseLocalWhisper", "false");
    localStorage.setItem("meetingCloudTranscriptionProvider", "openai");
    localStorage.setItem("meetingCloudTranscriptionModel", "gpt-4o-mini-transcribe");
  });
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByText("Speech-to-Text").first().click();
  const test1 = page.locator("[data-speech-test]");
  await expect(test1).toBeVisible({ timeout: 15_000 });
  await test1.getByRole("button", { name: "Record 5 seconds" }).click();
  await expect(test1.getByRole("meter")).toBeVisible({ timeout: 5_000 });
  const cloudResult = test1.locator("[data-speech-test-result]");
  await expect(cloudResult).toHaveAttribute("data-speech-test-result", "failed", {
    timeout: 40_000,
  });
  await expect(cloudResult).toContainText("No OpenAI API key configured");
  await expect(cloudResult).toContainText("via OpenAI");
  await page.screenshot({ path: test.info().outputPath("speech-test-cloud-no-key.png") });

  // A local route whose model is not on disk: the engine's own words.
  await page.keyboard.press("Escape");
  await seedLocalSpeechRoute(page);
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByText("Speech-to-Text").first().click();
  const test2 = page.locator("[data-speech-test]");
  await test2.getByRole("button", { name: "Record 5 seconds" }).click();
  const localResult = test2.locator("[data-speech-test-result]");
  await expect(localResult).toHaveAttribute("data-speech-test-result", "failed", {
    timeout: 40_000,
  });
  await expect(localResult).toContainText(/not downloaded/);
  await expect(localResult).toContainText("on this machine");
  await page.screenshot({ path: test.info().outputPath("speech-test-local-missing.png") });
});
