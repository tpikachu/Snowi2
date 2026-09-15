const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  runMeetingArchivePass,
  archivePassBudgetMs,
} = require("../../src/helpers/meetingArchivePass");
const { createPcmTimeline } = require("../../src/utils/pcmTimeline");

const RATE = 24000;
const T0 = 1_700_000_000_000;

/** 24 kHz int16 mono: a tone for speech, zeros for silence. */
function tone(seconds, amplitude = 0.3) {
  const out = new Int16Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Math.round(amplitude * 32767 * Math.sin((i / RATE) * 2 * Math.PI * 220));
  }
  return out;
}
const silence = (seconds) => new Int16Array(Math.round(seconds * RATE));

function pcm(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Int16Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return Buffer.from(out.buffer, out.byteOffset, out.byteLength);
}

/**
 * A mirror as the meeting would have written it: the file, plus a timeline
 * that saw the audio arrive in 100 ms chunks from `startedAt`, with an
 * optional pause (in ms) inserted after `pauseAfterMs` of audio.
 */
function writeTrack(
  dir,
  source,
  buffer,
  { startedAt = T0, pauseAfterMs = null, pauseMs = 0 } = {}
) {
  const filePath = path.join(dir, `${source}.pcm`);
  fs.writeFileSync(filePath, buffer);
  const timeline = createPcmTimeline({ sampleRate: RATE, bytesPerSample: 2 });
  const chunkBytes = (RATE * 2) / 10;
  let clock = startedAt;
  for (let offset = 0; offset < buffer.length; offset += chunkBytes) {
    const audioMs = (offset / (RATE * 2)) * 1000;
    if (pauseAfterMs != null && audioMs === pauseAfterMs) clock += pauseMs;
    const length = Math.min(chunkBytes, buffer.length - offset);
    clock += 100;
    timeline.record(length, clock);
  }
  return { source, path: filePath, sampleRate: RATE, timeline, bytes: buffer.length };
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "archive-pass-"));

test("each utterance becomes a segment stamped where it was heard, mic lines marked as you", async () => {
  const dir = tmp();
  const mic = writeTrack(
    dir,
    "mic",
    pcm([silence(1), tone(2), silence(1), tone(1.5), silence(0.5)])
  );
  const heard = [];
  const result = await runMeetingArchivePass({
    tracks: [mic],
    transcribe: async (samples, source) => {
      heard.push({ seconds: samples.length / 16000, source });
      return `line ${heard.length}`;
    },
  });

  assert.equal(result.segments.length, 2);
  assert.equal(result.windows, 2);
  assert.deepEqual(
    result.segments.map((s) => [s.id, s.text, s.source, s.speaker]),
    [
      ["archive-mic-1", "line 1", "mic", "you"],
      ["archive-mic-2", "line 2", "mic", "you"],
    ]
  );
  // First chunk arrived 100 ms after T0 and covered 100 ms, so audio starts at T0.
  assert.ok(Math.abs(result.segments[0].timestamp - (T0 + 1000)) <= 300, "first at ~1 s");
  assert.ok(Math.abs(result.segments[1].timestamp - (T0 + 4000)) <= 300, "second at ~4 s");
  // The windows handed to the model are the utterances, 16 kHz.
  assert.ok(heard[0].seconds > 1.8 && heard[0].seconds < 2.6, `window 1: ${heard[0].seconds}s`);
  assert.deepEqual(result.tracks, [{ source: "mic", windows: 2, seconds: 6 }]);
});

test("a pause during the meeting does not pull the later lines earlier", async () => {
  const dir = tmp();
  // 2 s of speech, then the meeting was paused for 30 s, then 2 s more.
  const mic = writeTrack(dir, "mic", pcm([tone(2), silence(1), tone(2), silence(1)]), {
    pauseAfterMs: 3000,
    pauseMs: 30_000,
  });
  const result = await runMeetingArchivePass({
    tracks: [mic],
    transcribe: async () => "words",
  });
  assert.equal(result.segments.length, 2);
  const gap = result.segments[1].timestamp - result.segments[0].timestamp;
  assert.ok(gap > 32_000 && gap < 34_000, `gap ${gap} should include the pause`);
});

test("both tracks interleave by time and windows the model heard nothing in are dropped", async () => {
  const dir = tmp();
  const mic = writeTrack(dir, "mic", pcm([silence(3), tone(1.5), silence(0.5)]));
  const system = writeTrack(dir, "system", pcm([tone(1.5), silence(3.5)]));
  const result = await runMeetingArchivePass({
    tracks: [mic, system],
    transcribe: async (_samples, source) => (source === "system" ? "hello from them" : ""),
  });

  assert.deepEqual(
    result.segments.map((s) => [s.source, s.text]),
    [["system", "hello from them"]]
  );
  assert.equal(result.windows, 2);
});

test("the pass is abandoned when a new meeting starts, and when over budget", async () => {
  const dir = tmp();
  const mic = writeTrack(dir, "mic", pcm([tone(1), silence(1), tone(1), silence(1)]));
  let calls = 0;
  await assert.rejects(
    runMeetingArchivePass({
      tracks: [mic],
      transcribe: async () => {
        calls += 1;
        return "x";
      },
      isStale: () => calls >= 1,
    }),
    /abandoned.*new meeting/
  );
  assert.equal(calls, 1);

  await assert.rejects(
    runMeetingArchivePass({
      tracks: [mic],
      transcribe: async () => "x",
      deadlineMs: Date.now() - 1,
    }),
    /abandoned.*budget/
  );
});

test("a transcriber failure rejects rather than yielding a half-refined transcript", async () => {
  const dir = tmp();
  const mic = writeTrack(dir, "mic", pcm([tone(1), silence(1), tone(1), silence(1)]));
  await assert.rejects(
    runMeetingArchivePass({
      tracks: [mic],
      transcribe: async () => {
        throw new Error("server died");
      },
    }),
    /server died/
  );
});

test("a silent track yields no segments and no windows", async () => {
  const dir = tmp();
  const mic = writeTrack(dir, "mic", pcm([silence(5)]));
  const result = await runMeetingArchivePass({ tracks: [mic], transcribe: async () => "never" });
  assert.deepEqual(result.segments, []);
  assert.equal(result.windows, 0);
});

test("the time budget scales with the meeting, between two and twenty minutes", () => {
  assert.equal(archivePassBudgetMs(0), 2 * 60_000);
  assert.equal(archivePassBudgetMs(60_000), 2 * 60_000);
  assert.equal(archivePassBudgetMs(10 * 60_000), 15 * 60_000);
  assert.equal(archivePassBudgetMs(3 * 60 * 60_000), 20 * 60_000);
  assert.equal(archivePassBudgetMs(undefined), 2 * 60_000);
});
