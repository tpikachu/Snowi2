const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/utils/meetingIdleStop.ts");

test("normalizeIdleStopMinutes keeps a listed choice and falls back to the default otherwise", async () => {
  const { normalizeIdleStopMinutes, DEFAULT_IDLE_STOP_MINUTES } = await load();
  assert.equal(normalizeIdleStopMinutes(0), 0);
  assert.equal(normalizeIdleStopMinutes("20"), 20);
  assert.equal(normalizeIdleStopMinutes(29.6), 30);
  assert.equal(normalizeIdleStopMinutes(7), DEFAULT_IDLE_STOP_MINUTES);
  assert.equal(normalizeIdleStopMinutes("x"), DEFAULT_IDLE_STOP_MINUTES);
  assert.equal(normalizeIdleStopMinutes(undefined), DEFAULT_IDLE_STOP_MINUTES);
});

test("idleStopDue fires only after the whole limit of silence while recording and not paused", async () => {
  const { idleStopDue } = await load();
  const base = { lastActivityAt: 1_000_000, idleMinutes: 10, isRecording: true, isPaused: false };
  assert.equal(idleStopDue({ ...base, now: base.lastActivityAt + 9 * 60_000 }), false);
  assert.equal(idleStopDue({ ...base, now: base.lastActivityAt + 10 * 60_000 }), true);
  // Paused, not recording, or the feature off: never.
  assert.equal(
    idleStopDue({ ...base, now: base.lastActivityAt + 60 * 60_000, isPaused: true }),
    false
  );
  assert.equal(
    idleStopDue({ ...base, now: base.lastActivityAt + 60 * 60_000, isRecording: false }),
    false
  );
  assert.equal(
    idleStopDue({ ...base, now: base.lastActivityAt + 60 * 60_000, idleMinutes: 0 }),
    false
  );
});
