const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer } = require("../lib/rendererTestHarness");

async function load(t) {
  const vite = await createRendererServer(t, { cachePrefix: "snowy-meeting-window-" });
  return await vite.ssrLoadModule("/utils/meetingWindow.ts");
}

// Pinned so the assertions do not move with the runner's locale.
const LOCALE = "en-GB";

test("renders the recorded window as a range", async (t) => {
  const { formatMeetingWindow } = await load(t);

  const result = formatMeetingWindow(
    {
      recording_started_at: "2026-08-19T13:05:00.000Z",
      recording_ended_at: "2026-08-19T13:52:00.000Z",
    },
    LOCALE
  );

  // Hours are `numeric`, not `2-digit`, so a 12-hour locale reads "2:05 pm"
  // rather than "02:05 pm". The shape under test is the range, not the padding.
  assert.match(result.text, /^\d{1,2}:\d{2}.* – \d{1,2}:\d{2}.*$/);
  const [from, to] = result.text.split(" – ");
  assert.notEqual(from, to, "a 47-minute meeting must not render as one instant");
  assert.equal(result.approximate, false);
});

test("a paused meeting's end comes from the recorded end, not the duration", async (t) => {
  const { formatSessionLength } = await load(t);

  // 09:00 to 10:00 wall clock, but only 40 minutes of audio because it was
  // paused for 20. Deriving the end from audio_duration_seconds would report
  // this session as ending at 09:40.
  const length = formatSessionLength({
    recording_started_at: "2026-08-19T09:00:00.000Z",
    recording_ended_at: "2026-08-19T10:00:00.000Z",
    audio_duration_seconds: 2400,
  });

  assert.equal(length, "1h");
});

test("falls back to created_at for meetings recorded before the columns existed", async (t) => {
  const { formatMeetingWindow, resolveMeetingWindow } = await load(t);

  const legacy = {
    recording_started_at: null,
    recording_ended_at: null,
    created_at: "2026-08-19T13:05:00.000Z",
    audio_duration_seconds: 1800,
  };

  const window = resolveMeetingWindow(legacy);
  assert.equal(window.approximate, true, "flagged so the UI can mark it with a tilde");
  assert.equal(window.end.getTime() - window.start.getTime(), 1800 * 1000);

  assert.equal(formatMeetingWindow(legacy, LOCALE).approximate, true);
});

test("a session with no end renders the start alone rather than a broken range", async (t) => {
  const { formatMeetingWindow, formatSessionLength } = await load(t);

  // What a crash mid-meeting leaves behind: a start, no end.
  const crashed = { recording_started_at: "2026-08-19T13:05:00.000Z", recording_ended_at: null };

  assert.doesNotMatch(formatMeetingWindow(crashed, LOCALE).text, /–/);
  assert.equal(formatSessionLength(crashed), null);
});

test("a note that was never recorded has no window", async (t) => {
  const { formatMeetingWindow } = await load(t);

  assert.equal(formatMeetingWindow({}), null);
  assert.equal(formatMeetingWindow({ created_at: "not a date" }), null);
});

test("formats session length in hours and minutes", async (t) => {
  const { formatSessionLength } = await load(t);

  const span = (ms) =>
    formatSessionLength({
      recording_started_at: "2026-08-19T09:00:00.000Z",
      recording_ended_at: new Date(Date.parse("2026-08-19T09:00:00.000Z") + ms).toISOString(),
    });

  assert.equal(span(45 * 1000), "45s");
  assert.equal(span(48 * 60 * 1000), "48m");
  assert.equal(span(72 * 60 * 1000), "1h 12m");
  assert.equal(span(120 * 60 * 1000), "2h");
  assert.equal(span(0), null, "a zero-length session is not a session");
});
