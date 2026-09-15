// @ts-check
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { launchApp, controlPanelPage, agentBarPage, skipOnboarding } = require("./launch");

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

  const bar = await agentBarPage(app);
  const start = bar.getByRole("button", { name: "Start meeting" });
  await start.waitFor({ timeout: 60_000 });
  await start.click();
  const stop = bar.getByRole("button", { name: "Stop", exact: true });
  await stop.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(MEETING_SECONDS * 1000);
  await stop.click();

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

  // The raw mirrors go once everything that reads them is done: the MP3 is
  // encoded first, and on a machine with the archive model the pass follows.
  const leftovers = () =>
    fs.readdirSync(require("os").tmpdir()).filter((f) => f.startsWith("snowy-meeting-"));
  await expect.poll(leftovers, { timeout: 120_000 }).toEqual([]);
});
