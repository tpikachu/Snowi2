const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/utils/meetingPanelSnapshot.ts");

const source = (overrides = {}) => ({
  isRecording: true,
  isPaused: false,
  recordingNoteId: 7,
  recordingNoteTitle: "Standup",
  micCaptureStatus: "active",
  systemCaptureActive: true,
  recordingStartedAt: 1_000,
  gaps: [],
  ...overrides,
});

test("captured time is wall time minus the pauses", async () => {
  const { buildMeetingPanelSnapshot } = await load();
  const snapshot = buildMeetingPanelSnapshot(
    source({ gaps: [{ startedAt: 3_000, endedAt: 5_000 }] }),
    11_000
  );

  assert.equal(snapshot.capturedMs, 10_000 - 2_000);
  assert.equal(snapshot.capturedAt, 11_000);
});

// The clock must report recorded time, not wall time, or a meeting paused for
// lunch claims an hour it never captured.
test("captured time freezes while paused", async () => {
  const { buildMeetingPanelSnapshot } = await load();
  const paused = source({ isPaused: true, gaps: [{ startedAt: 4_000, endedAt: null }] });

  assert.equal(buildMeetingPanelSnapshot(paused, 6_000).capturedMs, 3_000);
  assert.equal(buildMeetingPanelSnapshot(paused, 60_000).capturedMs, 3_000);
});

test("a meeting that has not started reads zero", async () => {
  const { buildMeetingPanelSnapshot } = await load();
  const snapshot = buildMeetingPanelSnapshot(
    source({ isRecording: false, recordingStartedAt: null }),
    9_000
  );

  assert.equal(snapshot.capturedMs, 0);
});

test("a start stamped in the future never yields a negative clock", async () => {
  const { buildMeetingPanelSnapshot } = await load();
  assert.equal(buildMeetingPanelSnapshot(source({ recordingStartedAt: 9_000 }), 1_000).capturedMs, 0);
});

// Publishing on every tick would put an IPC message behind a number the panel
// can advance on its own.
test("snapshots taken at different times are equal when nothing changed", async () => {
  const { buildMeetingPanelSnapshot, snapshotsEqual } = await load();
  const a = buildMeetingPanelSnapshot(source(), 5_000);
  const b = buildMeetingPanelSnapshot(source(), 9_999);

  assert.notEqual(a.capturedMs, b.capturedMs);
  assert.equal(snapshotsEqual(a, b), true);
});

test("every field the panel renders counts as a change", async () => {
  const { buildMeetingPanelSnapshot, snapshotsEqual } = await load();
  const base = buildMeetingPanelSnapshot(source(), 5_000);

  const changes = [
    { isRecording: false },
    { isPaused: true },
    { recordingNoteId: 8 },
    { recordingNoteTitle: "Retro" },
    { micCaptureStatus: "unavailable" },
    { systemCaptureActive: false },
  ];

  for (const change of changes) {
    const next = buildMeetingPanelSnapshot(source(change), 5_000);
    assert.equal(snapshotsEqual(base, next), false, `expected a change for ${JSON.stringify(change)}`);
  }
});

test("comparing against nothing is never equal", async () => {
  const { buildMeetingPanelSnapshot, snapshotsEqual } = await load();
  const snapshot = buildMeetingPanelSnapshot(source(), 5_000);

  assert.equal(snapshotsEqual(null, snapshot), false);
  assert.equal(snapshotsEqual(snapshot, null), false);
  assert.equal(snapshotsEqual(null, null), true);
});

test("a running clock advances from when it was measured", async () => {
  const { buildMeetingPanelSnapshot, capturedMsAt } = await load();
  const snapshot = buildMeetingPanelSnapshot(source(), 11_000);

  assert.equal(capturedMsAt(snapshot, 11_000), 10_000);
  assert.equal(capturedMsAt(snapshot, 14_500), 13_500);
});

// The panel's window is hidden while the control panel has focus, and hidden
// windows get their timers throttled — so the clock is read from the real
// elapsed time, never accumulated tick by tick.
test("a stale snapshot still reads the right time after a long gap", async () => {
  const { buildMeetingPanelSnapshot, capturedMsAt } = await load();
  const snapshot = buildMeetingPanelSnapshot(source(), 1_000 + 5_000);

  assert.equal(capturedMsAt(snapshot, 6_000 + 600_000), 5_000 + 600_000);
});

test("a paused or stopped clock ignores elapsed time", async () => {
  const { buildMeetingPanelSnapshot, capturedMsAt } = await load();
  const paused = buildMeetingPanelSnapshot(
    source({ isPaused: true, gaps: [{ startedAt: 4_000, endedAt: null }] }),
    6_000
  );
  const stopped = buildMeetingPanelSnapshot(source({ isRecording: false }), 6_000);

  assert.equal(capturedMsAt(paused, 999_000), 3_000);
  assert.equal(capturedMsAt(stopped, 999_000), stopped.capturedMs);
});

test("a clock read before its own measurement does not run backwards", async () => {
  const { buildMeetingPanelSnapshot, capturedMsAt } = await load();
  const snapshot = buildMeetingPanelSnapshot(source(), 11_000);

  assert.equal(capturedMsAt(snapshot, 10_000), 10_000);
});
