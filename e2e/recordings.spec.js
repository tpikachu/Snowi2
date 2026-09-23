// @ts-check
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const {
  launchApp,
  controlPanelPage,
  agentBarPage,
  cueCardPage,
  skipOnboarding,
} = require("./launch");

/**
 * A meeting's audio is kept with its note. The synthesized demo call plays as
 * the microphone through Chromium's fake device; a fresh profile transcribes
 * on this machine. After Save, main mixes the mirrored tracks to an MP3 under
 * userData/recordings and the note shows a Recordings row that plays.
 */

const MIC_WAV = path.join(__dirname, "..", "demo-output", "demo-call-mic-17.wav");
const MEETING_SECONDS = 14;

/** @type {import("playwright").ElectronApplication | null} */
let app = null;

test.afterEach(async () => {
  if (app) {
    await app.close().catch(() => {});
    app = null;
  }
});

test("a meeting leaves one playable recording on its note", async () => {
  test.skip(!fs.existsSync(MIC_WAV), "the synthesized demo call is not on this machine");
  let userDataDir = "";
  ({ app, userDataDir } = await launchApp(test.info(), {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-audio-capture=${MIC_WAV}`,
    ],
  }));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);

  // The dot starts the meeting, the cue card comes up beside it, and the
  // dot's click ends the session — the flow the client asked for.
  const dot = await agentBarPage(app);
  const start = dot.getByRole("button", { name: "Start meeting" });
  await start.waitFor({ timeout: 60_000 });
  await start.click();
  const card = await cueCardPage(app);
  await card.getByRole("button", { name: "Stop", exact: true }).waitFor({ timeout: 30_000 });
  const end = dot.getByRole("button", { name: /click to end/ });
  await end.waitFor({ timeout: 30_000 });

  // A fault main reports on every audio chunk is one card, not a flood: five
  // identical errors in a row show once, a different one shows once more.
  const sendError = (message) =>
    app.evaluate(({ BrowserWindow }, text) => {
      for (const win of BrowserWindow.getAllWindows()) {
        const url = win.webContents.getURL();
        if (url.includes("panel=true") && !url.includes("meeting-panel")) {
          win.webContents.send("meeting-transcription-error", text);
        }
      }
    }, message);
  const flood = "No OpenAI API key configured. Add your key in Settings.";
  for (let i = 0; i < 5; i++) await sendError(flood);
  await expect(page.getByText(flood)).toHaveCount(1, { timeout: 10_000 });
  await sendError("The transcription service is unreachable.");
  await expect(page.getByText("The transcription service is unreachable.")).toHaveCount(1, {
    timeout: 10_000,
  });
  await page.waitForTimeout(1000);
  await expect(page.getByText(flood)).toHaveCount(1);

  await page.waitForTimeout(MEETING_SECONDS * 1000);
  await end.click();

  const save = page.getByRole("button", { name: /^Save/ });
  await save.waitFor({ timeout: 30_000 });
  await save.click();

  // The row lands a few seconds after Save, once ffmpeg has mixed the tracks.
  /** @type {{ noteId: number, id: number, startedAt: number, durationMs: number | null, bytes: number | null } | null} */
  let recording = null;
  await expect
    .poll(
      async () => {
        recording = await page.evaluate(async () => {
          const api = /** @type {any} */ (globalThis).electronAPI;
          const result = await api.getNotes(null, 20);
          const notes = Array.isArray(result) ? result : (result?.notes ?? []);
          for (const note of notes) {
            const rows = await api.noteRecordingsList(note.id);
            if (rows.length) return { noteId: note.id, ...rows[0] };
          }
          return null;
        });
        return recording;
      },
      { timeout: 45_000 }
    )
    .not.toBeNull();
  if (!recording) throw new Error("no recording");
  const file = path.join(
    userDataDir,
    "recordings",
    String(recording.noteId),
    `${recording.startedAt}.mp3`
  );
  expect(fs.existsSync(file)).toBe(true);
  expect(fs.statSync(file).size).toBeGreaterThan(10_000);
  expect(recording.durationMs ?? 0).toBeGreaterThan((MEETING_SECONDS - 4) * 1000);

  // The note is open after Save; its Recordings strip lists the session and plays it.
  const strip = page.getByTestId("note-recordings");
  await expect(strip).toBeVisible({ timeout: 30_000 });
  await expect(strip.getByRole("listitem")).toHaveCount(1);
  await strip.getByRole("button", { name: "Play" }).click();
  await expect(strip.getByRole("button", { name: "Pause" })).toBeVisible({ timeout: 15_000 });
  await expect(strip).toContainText(/00:0[2-9] \//, { timeout: 15_000 });
  await page.screenshot({ path: test.info().outputPath("note-recordings.png") });
  await strip.getByRole("button", { name: "Pause" }).click();
  await expect(strip.getByRole("button", { name: "Play" })).toBeVisible();

  // The note page (client direction, 2026-09-23): Generate Notes and Resume
  // meeting sit in the header beside the view switch, and the ask bar is one
  // field with the model chip inside it — the global chat's shape. No actions
  // dropdown anywhere.
  await expect(page.getByRole("button", { name: "Generate Notes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume meeting" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Model" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Select action" })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("note-page.png") });

  // With the note's chat docked as a sidebar the ask bar goes, the chat's own
  // composer carries the same chip, and Generate Notes stays in the header.
  await page.getByPlaceholder("Ask anything...").click();
  await page.getByRole("button", { name: "Dock to sidebar" }).click();
  await expect(page.getByPlaceholder("Ask anything...")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Model" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate Notes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume meeting" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("note-page-chat-docked.png") });
  await page.getByRole("button", { name: "Close chat" }).click();
  await expect(page.getByPlaceholder("Ask anything...")).toBeVisible();

  // The raw mirrors go once everything that reads them is done: the MP3 is
  // encoded first, and on a machine with the archive model the pass follows.
  const leftovers = () =>
    fs.readdirSync(require("os").tmpdir()).filter((f) => f.startsWith("snowy-meeting-"));
  await expect.poll(leftovers, { timeout: 120_000 }).toEqual([]);
});
