const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/utils/pcmRingBuffer.ts");

// The meeting worklet emits 800 Int16 samples per chunk at 24 kHz: 1600 bytes,
// exactly 1/30th of a second.
const SAMPLE_RATE = 24_000;
const CHUNK_BYTES = 1600;
const CHUNK_MS = 100 / 3;

const chunk = (fill = 0) => {
  const buf = new ArrayBuffer(CHUNK_BYTES);
  new Int16Array(buf).fill(fill);
  return buf;
};

const make = async (maxDurationMs) => {
  const { PcmRingBuffer } = await load();
  return new PcmRingBuffer({ sampleRate: SAMPLE_RATE, maxDurationMs });
};

test("a fresh ring is empty and holds nothing", async () => {
  const ring = await make(1_000);
  assert.equal(ring.isEmpty, true);
  assert.equal(ring.byteLength, 0);
  assert.equal(ring.durationMs, 0);
});

test("pushed audio is held and measured in milliseconds", async () => {
  const ring = await make(1_000);
  ring.push(chunk());
  ring.push(chunk());

  assert.equal(ring.isEmpty, false);
  assert.equal(ring.byteLength, CHUNK_BYTES * 2);
  assert.ok(Math.abs(ring.durationMs - CHUNK_MS * 2) < 0.001);
});

// The cap is the whole point: this is audio captured before the user agreed
// to record, so it must not be able to grow into a recording.
test("audio past the window falls off the back", async () => {
  const ring = await make(CHUNK_MS * 3);
  for (let i = 1; i <= 10; i++) ring.push(chunk(i));

  assert.equal(ring.byteLength, CHUNK_BYTES * 3);
  const held = ring.take().map((c) => new Int16Array(c)[0]);
  assert.deepEqual(held, [8, 9, 10]);
});

test("order is preserved oldest-first", async () => {
  const ring = await make(1_000);
  for (let i = 1; i <= 4; i++) ring.push(chunk(i));

  assert.deepEqual(
    ring.take().map((c) => new Int16Array(c)[0]),
    [1, 2, 3, 4]
  );
});

test("take empties the ring, so pre-consent audio cannot outlive one read", async () => {
  const ring = await make(1_000);
  ring.push(chunk(7));

  assert.equal(ring.take().length, 1);
  assert.equal(ring.isEmpty, true);
  assert.equal(ring.byteLength, 0);
  assert.deepEqual(ring.take(), []);
});

test("clear drops everything", async () => {
  const ring = await make(1_000);
  ring.push(chunk());
  ring.clear();

  assert.equal(ring.isEmpty, true);
  assert.equal(ring.byteLength, 0);
});

test("empty chunks are ignored", async () => {
  const ring = await make(1_000);
  ring.push(new ArrayBuffer(0));

  assert.equal(ring.isEmpty, true);
});

// A window of zero means "keep nothing", which has to hold even against a
// push — otherwise disabling the pre-roll would still buffer one chunk.
test("a zero-length window never holds anything", async () => {
  const ring = await make(0);
  ring.push(chunk());

  assert.equal(ring.isEmpty, true);
  assert.equal(ring.byteLength, 0);
});

// Evicting everything and still sitting over the cap would defeat the bound.
test("a chunk larger than the whole window is refused, not stored", async () => {
  const ring = await make(CHUNK_MS * 2);
  ring.push(chunk(1));

  const oversized = new ArrayBuffer(CHUNK_BYTES * 5);
  ring.push(oversized);

  assert.equal(ring.isEmpty, true);
  assert.equal(ring.byteLength, 0);
});

test("the held duration never exceeds the window", async () => {
  const windowMs = CHUNK_MS * 4;
  const ring = await make(windowMs);
  for (let i = 0; i < 50; i++) {
    ring.push(chunk(i));
    assert.ok(ring.durationMs <= windowMs + 0.001, `exceeded at push ${i}`);
  }
});
