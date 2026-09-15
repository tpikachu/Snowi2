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
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);

  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Hotkeys" }).first().click();

  // Nothing ships bound on a fresh profile: both rows show the unbound chip
  // with a one-click suggestion, and the meeting row's layout select sits
  // inline beneath it — no editor to open, nothing folded away.
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

  // Settings → Language Models is one page: the engine choice leads. A fresh
  // install resolves local, so the cloud grid appears on flipping the card —
  // which also routes chat and actions to providers mode in one stroke.
  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Language Models" }).first().click();
  await expect(page.getByText("Cloud Providers").first()).toBeVisible({ timeout: 15_000 });
  await page.getByText("Cloud Providers").first().click();
  await expect(page.getByText("OpenAI").first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("language-models-panel.png") });
});

test("the provider card is the switch: a key saved on the chosen card moves chat and write-ups there", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);

  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Language Models" }).first().click();
  await expect(page.getByText("Cloud Providers").first()).toBeVisible({ timeout: 15_000 });
  await page.getByText("Cloud Providers").first().click();

  const grid = page.getByRole("radiogroup", { name: "Provider" });
  // A card's accessible name is icon alt + name + badge + readiness; the
  // spaces keep OpenAI from matching OpenRouter.
  const card = (name) => grid.getByRole("radio", { name: new RegExp(" " + name + " ") });
  await expect(card("OpenAI")).toBeVisible();

  // Nothing keyed yet: the first card is merely selected, and the hint says
  // what saving a key there would do.
  await expect(
    page.getByText("Save a key to move chat and meeting write-ups to OpenAI.")
  ).toBeVisible();

  // A keyless card clicked is a pending choice, not a switch.
  await card("Anthropic").click();
  await expect(card("Anthropic")).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByText("Save a key to move chat and meeting write-ups to Anthropic.")
  ).toBeVisible();

  // Saving its key is the switch (client, 2026-09-15: "added the key, it
  // still uses the previous provider, no obvious way to switch").
  await page.getByRole("button", { name: "Add API key" }).click();
  await page.getByRole("textbox", { name: "API Key" }).fill("sk-ant-e2e");
  await page.keyboard.press("Enter");
  await expect(card("Anthropic")).toContainText("In use");
  await expect(page.getByText("Chat and meeting write-ups run on Anthropic.")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("provider-in-use.png") });

  // Another keyless card is pending again; Anthropic keeps serving meanwhile.
  await card("OpenAI").click();
  await expect(
    page.getByText("Save a key to move chat and meeting write-ups to OpenAI.")
  ).toBeVisible();
  await expect(card("Anthropic")).toContainText("In use");

  // OpenRouter is a provider like the others now: its key routes both scopes
  // at the curated slugs…
  await card("OpenRouter").click();
  await page.getByRole("button", { name: "Add API key" }).click();
  await page.getByRole("textbox", { name: "API Key" }).fill("sk-or-e2e");
  await page.keyboard.press("Enter");
  await expect(card("OpenRouter")).toContainText("In use");
  await expect(card("Anthropic")).not.toContainText("In use");

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
