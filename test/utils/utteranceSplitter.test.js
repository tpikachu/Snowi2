const test = require("node:test");
const assert = require("node:assert/strict");

const { createUtteranceSplitter } = require("../../src/utils/utteranceSplitter");

const RATE = 16000;

/** A steady tone at `amplitude` for `seconds` — stands in for speech. */
function tone(seconds, amplitude = 0.3) {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i += 1) {
    out[i] = amplitude * Math.sin((i / RATE) * 2 * Math.PI * 220);
  }
  return out;
}
const silence = (seconds) => new Float32Array(Math.round(seconds * RATE));

function concat(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const near = (actual, expected, toleranceSeconds, label) =>
  assert.ok(
    Math.abs(actual - expected) <= toleranceSeconds * RATE,
    `${label}: ${actual / RATE}s vs ${expected / RATE}s`
  );

test("two utterances separated by a pause become two windows around the speech", () => {
  const splitter = createUtteranceSplitter();
  const audio = concat([silence(1), tone(2), silence(1), tone(3), silence(1)]);
  const windows = [...splitter.push(audio), ...splitter.flush()];

  assert.equal(windows.length, 2);
  near(windows[0].startSample, 1 * RATE, 0.25, "first start");
  near(windows[0].endSample, 3 * RATE, 0.25, "first end");
  near(windows[1].startSample, 4 * RATE, 0.25, "second start");
  near(windows[1].endSample, 7 * RATE, 0.25, "second end");
  for (const w of windows) assert.equal(w.samples.length, w.endSample - w.startSample);
  // The window carries the speech, not the silence around it.
  assert.ok(Math.max(...windows[0].samples) > 0.2);
});

test("speech that never pauses is cut at the quietest moment of the look-back", () => {
  const splitter = createUtteranceSplitter({ maxWindowMs: 22000, cutLookbackMs: 4000 });
  // 50 s of speech with a 300 ms dip at 20 s: too short to close a window,
  // but the obvious place to cut when the 22 s limit arrives.
  const audio = concat([tone(20), tone(0.3, 0.0005), tone(29.7), silence(1)]);
  const windows = [...splitter.push(audio), ...splitter.flush()];

  assert.ok(windows.length >= 3, `expected several windows, got ${windows.length}`);
  near(windows[0].endSample, 20.15 * RATE, 0.25, "first cut lands in the dip");
  for (const w of windows) assert.ok(w.endSample - w.startSample <= 22.5 * RATE);
  // Nothing is lost between consecutive windows.
  for (let i = 1; i < windows.length; i += 1) {
    assert.equal(windows[i].startSample, windows[i - 1].endSample);
  }
});

test("a click is not an utterance", () => {
  const splitter = createUtteranceSplitter();
  const audio = concat([silence(1), tone(0.1), silence(2)]);
  assert.deepEqual([...splitter.push(audio), ...splitter.flush()], []);
});

test("feeding in small chunks gives the same windows as one push", () => {
  const audio = concat([silence(0.5), tone(1.5), silence(0.8), tone(2.2), silence(0.6)]);
  const whole = createUtteranceSplitter();
  const expected = [...whole.push(audio), ...whole.flush()];

  const chunked = createUtteranceSplitter();
  const got = [];
  for (let offset = 0; offset < audio.length; offset += 1000) {
    got.push(...chunked.push(audio.subarray(offset, Math.min(audio.length, offset + 1000))));
  }
  got.push(...chunked.flush());

  assert.deepEqual(
    got.map((w) => [w.startSample, w.endSample]),
    expected.map((w) => [w.startSample, w.endSample])
  );
});

test("int16 input is accepted and the trailing utterance comes out on flush", () => {
  const splitter = createUtteranceSplitter();
  const floats = concat([silence(0.5), tone(1)]);
  const ints = new Int16Array(floats.length);
  for (let i = 0; i < floats.length; i += 1) ints[i] = Math.round(floats[i] * 32767);

  assert.deepEqual(splitter.push(ints), []);
  const windows = splitter.flush();
  assert.equal(windows.length, 1);
  near(windows[0].startSample, 0.5 * RATE, 0.25, "start");
  near(windows[0].endSample, 1.5 * RATE, 0.25, "end");
});

test("a noise floor lifts the thresholds instead of turning the meeting into one window", () => {
  const splitter = createUtteranceSplitter();
  // A hum above the fixed silence threshold: speech at 0.3 still stands out,
  // and the hum between lines must still read as a pause.
  const hum = (seconds) => tone(seconds, 0.014);
  const audio = concat([hum(2), tone(2), hum(1), tone(2), hum(1)]);
  const windows = [...splitter.push(audio), ...splitter.flush()];
  assert.equal(windows.length, 2);
});
