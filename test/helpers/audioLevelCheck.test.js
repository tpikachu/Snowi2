const test = require("node:test");
const assert = require("node:assert/strict");
const { rmsOfInt16, createLevelTracker, HEARD_RMS } = require("../../src/helpers/audioLevelCheck");
const renderer = require("../../src/utils/audioLevelCheck.ts");

const sine = (amplitude, samples = 480) => {
  const buf = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    buf.writeInt16LE(Math.round(Math.sin((i / samples) * Math.PI * 8) * amplitude * 32767), i * 2);
  }
  return buf;
};

test("RMS of s16le PCM: silence is 0, a full-scale sine is about 0.707", () => {
  assert.equal(rmsOfInt16(Buffer.alloc(960)), 0);
  assert.ok(Math.abs(rmsOfInt16(sine(1)) - 0.707) < 0.01);
  assert.equal(rmsOfInt16(Buffer.alloc(0)), 0);
  // An odd trailing byte is ignored, never read past the end.
  assert.equal(rmsOfInt16(Buffer.alloc(3)), 0);
});

test("the tracker keeps the loudest moment and judges the listen", () => {
  const tracker = createLevelTracker();
  assert.equal(tracker.verdict(), "nothing", "no audio at all is its own answer");
  tracker.push(0.004);
  tracker.push(0.009);
  assert.equal(tracker.verdict(), "silent");
  tracker.push(HEARD_RMS);
  tracker.push(0.001);
  assert.equal(tracker.verdict(), "heard");
  assert.equal(tracker.peak, HEARD_RMS);
  assert.equal(tracker.chunks, 4);
});

test("the renderer's float tracker agrees with main's", () => {
  const frame = new Float32Array(480);
  for (let i = 0; i < frame.length; i++) frame[i] = Math.sin((i / frame.length) * Math.PI * 8);
  assert.ok(Math.abs(renderer.rmsOfFloat(frame) - rmsOfInt16(sine(1))) < 0.001);
  assert.equal(renderer.HEARD_RMS, HEARD_RMS);
  const tracker = renderer.createLevelTracker();
  tracker.push(0.01);
  assert.equal(tracker.verdict(), "silent");
  tracker.push(0.5);
  assert.equal(tracker.verdict(), "heard");
});
