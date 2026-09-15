const test = require("node:test");
const assert = require("node:assert/strict");

const { createPcmTimeline } = require("../../src/utils/pcmTimeline");

// 24 kHz mono 16-bit: 48 bytes per millisecond, so a 100 ms chunk is 4800 bytes.
const CHUNK_MS = 100;
const CHUNK_BYTES = 4800;
const timeline = () => createPcmTimeline({ sampleRate: 24000, bytesPerSample: 2 });

test("steady delivery needs one anchor and maps bytes to when they were heard", () => {
  const t = timeline();
  const firstArrival = 1_000_000;
  for (let i = 0; i < 50; i += 1) t.record(CHUNK_BYTES, firstArrival + i * CHUNK_MS);

  assert.equal(t.anchors.length, 1);
  assert.equal(t.bytes, 50 * CHUNK_BYTES);
  // The first chunk arrived 100 ms after its first sample was captured.
  assert.equal(t.timeAtByte(0), firstArrival - CHUNK_MS);
  assert.equal(t.startedAt, firstArrival - CHUNK_MS);
  // Five seconds of audio in: five seconds later.
  assert.equal(t.timeAtByte(50 * CHUNK_MS * 48), firstArrival - CHUNK_MS + 5000);
});

test("a pause adds an anchor so the audio after it is not stamped too early", () => {
  const t = timeline();
  const firstArrival = 1_000_000;
  for (let i = 0; i < 10; i += 1) t.record(CHUNK_BYTES, firstArrival + i * CHUNK_MS);
  const resumedAt = firstArrival + 10 * CHUNK_MS + 30_000;
  for (let i = 0; i < 10; i += 1) t.record(CHUNK_BYTES, resumedAt + i * CHUNK_MS);

  assert.equal(t.anchors.length, 2);
  // The byte right after the pause belongs to the first chunk after resume.
  assert.equal(t.timeAtByte(10 * CHUNK_BYTES), resumedAt - CHUNK_MS);
  // Bytes before the pause still read from the first anchor.
  assert.equal(t.timeAtByte(5 * CHUNK_BYTES), firstArrival - CHUNK_MS + 500);
});

test("jitter under the tolerance adds no anchor", () => {
  const t = timeline();
  const firstArrival = 1_000_000;
  // Chunks bunch up and spread out by up to 400 ms either way.
  const jitter = [0, 350, -200, 400, -350, 100, 0, 250];
  for (let i = 0; i < jitter.length; i += 1) {
    t.record(CHUNK_BYTES, firstArrival + i * CHUNK_MS + jitter[i]);
  }
  assert.equal(t.anchors.length, 1);
});

test("an empty timeline answers null and ignores empty chunks", () => {
  const t = timeline();
  assert.equal(t.timeAtByte(0), null);
  assert.equal(t.startedAt, null);
  t.record(0, 1_000_000);
  assert.equal(t.bytes, 0);
  assert.equal(t.anchors.length, 0);
});

test("the sample rate is required", () => {
  assert.throws(() => createPcmTimeline({}), /sampleRate/);
});
