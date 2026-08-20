const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const load = () => import("../../src/utils/transcriptWindow.ts");

const items = (n) => Array.from({ length: n }, (_, i) => `s${i}`);

test("a short meeting renders whole, and keeps the array identity", async () => {
  const { windowTranscript } = await load();

  const all = items(10);
  const result = windowTranscript(all, 300);

  assert.equal(result.hiddenCount, 0);
  assert.equal(result.firstVisibleIndex, 0);
  // Same array, not a copy: the common case must not allocate on every render.
  assert.equal(result.visible, all);
});

test("a long meeting renders the tail", async () => {
  const { windowTranscript } = await load();

  const result = windowTranscript(items(1000), 300);

  assert.equal(result.visible.length, 300);
  assert.equal(result.hiddenCount, 700);
  assert.equal(result.firstVisibleIndex, 700);
  // The tail, not the head — a live meeting is read from the bottom.
  assert.equal(result.visible[0], "s700");
  assert.equal(result.visible[299], "s999");
});

test("firstVisibleIndex maps a window position back to the full list", async () => {
  const { windowTranscript } = await load();

  // This is what lets the first rendered row still know whether the segment
  // above it — hidden or not — was the same speaker. Getting it wrong makes the
  // top row of the window sprout a duplicate speaker label.
  const all = items(1000);
  const { firstVisibleIndex, visible } = windowTranscript(all, 300);

  for (const windowIndex of [0, 1, 150, 299]) {
    assert.equal(visible[windowIndex], all[firstVisibleIndex + windowIndex]);
  }
});

test("an exact fit hides nothing", async () => {
  const { windowTranscript } = await load();

  const all = items(300);
  const result = windowTranscript(all, 300);
  assert.equal(result.hiddenCount, 0);
  assert.equal(result.visible, all);
});

test("degenerate counts do not produce an empty transcript", async () => {
  const { windowTranscript } = await load();

  // Guards the "show earlier" arithmetic: a zero or negative count would
  // otherwise render nothing at all, which reads as a lost transcript.
  assert.equal(windowTranscript(items(10), 0).visible.length, 1);
  assert.equal(windowTranscript(items(10), -5).visible.length, 1);
  assert.deepEqual(windowTranscript([], 300).visible, []);
});

test("the transcript pane uses the shared window helper", async () => {
  // Cheap guard against the component quietly reverting to its own arithmetic,
  // which is what this module was extracted from.
  const source = fs.readFileSync(
    path.join(__dirname, "..", "..", "src", "components", "notes", "MeetingTranscriptChat.tsx"),
    "utf8"
  );
  assert.match(source, /windowTranscript/);
});
