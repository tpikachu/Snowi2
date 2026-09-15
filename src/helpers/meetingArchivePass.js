const fs = require("fs");
const { downsample24kTo16k, pcm16ToFloat32 } = require("../utils/audioUtils");
const { createUtteranceSplitter } = require("../utils/utteranceSplitter");

/**
 * The post-Stop archive pass: the whole meeting, re-transcribed by a model
 * too slow to run live.
 *
 * The live model streams captions at the speed of the conversation and pays
 * for it in accuracy; the archive model gets the same audio after the fact,
 * cut into utterances at the pauses (utteranceSplitter.js), with nothing to
 * be late for. Its lines replace the live ones in the note before the
 * write-up runs, so the summary is built from the better transcript.
 *
 * Runs over the raw mirrors meetingAudioMirror.js kept during the meeting —
 * one file per track, so a line keeps its side (you / them) without any
 * diarization — streaming each file through the splitter so an hour of audio
 * is never resident. Every window's start byte maps back to wall-clock time
 * through the track's timeline, which is what puts the archive lines in
 * order across the two tracks and keeps them right across pauses.
 *
 * Pure orchestration: the transcriber is injected (the caller binds the
 * sherpa or whisper server), and `isStale` lets the caller abandon the pass
 * the moment a new meeting starts and needs the speech engine back. Any
 * failure rejects — the caller keeps the live transcript, which is always
 * preferable to a half-refined one.
 */

const MIRROR_SAMPLE_RATE = 24000;
const TARGET_SAMPLE_RATE = 16000;
/** 24 kHz → 16 kHz is 3 → 2, so reads are cut on 3-sample (6-byte) multiples. */
const INPUT_ALIGNMENT_BYTES = 6;
const READ_CHUNK_BYTES = MIRROR_SAMPLE_RATE * 2 * 10; // ten seconds

/**
 * How long a pass may take before it is abandoned in favour of the live
 * transcript. Offline decoding runs at a few times real time on a CPU
 * (RTF ~0.085 measured, see modelTiering.js), so 1.5x the meeting's length
 * is generous; the floor covers server start-up on a short meeting and the
 * ceiling keeps a stalled engine from holding the notes for an afternoon.
 */
function archivePassBudgetMs(meetingDurationMs) {
  const duration = Number.isFinite(meetingDurationMs) ? meetingDurationMs : 0;
  return Math.min(20 * 60_000, Math.max(2 * 60_000, duration * 1.5));
}

function bytesToSeconds(bytes, sampleRate) {
  return bytes / (sampleRate * 2);
}

/**
 * @param {object} args
 * @param {Array<{source: "mic"|"system", path: string, sampleRate: number,
 *   timeline: {timeAtByte(byteOffset: number): number|null}, bytes: number}>} args.tracks
 * @param {(samples: Float32Array, source: string) => Promise<string>} args.transcribe
 *   16 kHz float32 window in, text out ("" for nothing said).
 * @param {() => boolean} [args.isStale] true once the caller no longer wants the result.
 * @param {number} [args.deadlineMs] epoch ms after which the pass gives up.
 * @param {(event: string, data: object) => void} [args.log]
 * @param {() => number} [args.now]
 * @returns {Promise<{segments: object[], windows: number, elapsedMs: number,
 *   tracks: Array<{source: string, windows: number, seconds: number}>}>}
 */
async function runMeetingArchivePass({
  tracks,
  transcribe,
  isStale = () => false,
  deadlineMs = Infinity,
  log = () => {},
  now = Date.now,
}) {
  if (typeof transcribe !== "function") throw new Error("archive pass: transcribe is required");
  const startedAt = now();
  const segments = [];
  const trackStats = [];

  const checkContinue = (where) => {
    if (isStale()) throw new Error(`archive pass abandoned: ${where}: a new meeting started`);
    if (now() > deadlineMs)
      throw new Error(`archive pass abandoned: ${where}: over its time budget`);
  };

  for (const track of tracks || []) {
    checkContinue(`before ${track.source}`);
    const stats = { source: track.source, windows: 0, seconds: 0 };
    trackStats.push(stats);
    let counter = 0;

    const handleWindow = async (window) => {
      checkContinue(`${track.source} window ${counter + 1}`);
      const text = (await transcribe(window.samples, track.source))?.trim() || "";
      stats.windows += 1;
      if (!text) return;
      counter += 1;
      // Sample index at 16 kHz → byte offset in the 24 kHz mirror: ×1.5 samples, ×2 bytes.
      const mirrorByte = Math.round((window.speechStartSample ?? window.startSample) * 3);
      const timestamp = track.timeline.timeAtByte(mirrorByte);
      segments.push({
        id: `archive-${track.source}-${counter}`,
        text,
        source: track.source,
        timestamp: timestamp == null ? undefined : Math.round(timestamp),
        ...(track.source === "mic" ? { speaker: "you" } : {}),
      });
    };

    await transcribeTrack(track, handleWindow, stats);
    log("archive pass track done", stats);
  }

  segments.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  return {
    segments,
    windows: trackStats.reduce((n, t) => n + t.windows, 0),
    elapsedMs: now() - startedAt,
    tracks: trackStats,
  };
}

async function transcribeTrack(track, handleWindow, stats) {
  const sampleRate = track.sampleRate || MIRROR_SAMPLE_RATE;
  if (sampleRate !== MIRROR_SAMPLE_RATE) {
    throw new Error(`archive pass: unsupported mirror sample rate ${sampleRate}`);
  }
  const splitter = createUtteranceSplitter({ sampleRate: TARGET_SAMPLE_RATE });
  let carry = Buffer.alloc(0);
  let consumed = 0;

  const stream = fs.createReadStream(track.path, { highWaterMark: READ_CHUNK_BYTES });
  for await (const chunk of stream) {
    let data = carry.length ? Buffer.concat([carry, chunk]) : chunk;
    const usable = data.length - (data.length % INPUT_ALIGNMENT_BYTES);
    carry = data.subarray(usable);
    data = data.subarray(0, usable);
    if (!data.length) continue;
    consumed += data.length;
    const pcm16k = downsample24kTo16k(data);
    const windows = splitter.push(pcm16ToFloat32(pcm16k));
    for (const window of windows) await handleWindow(window);
  }
  // A trailing partial sample group is less than one sample of audio.
  for (const window of splitter.flush()) await handleWindow(window);
  stats.seconds = Math.round(bytesToSeconds(consumed, sampleRate));
}

module.exports = {
  runMeetingArchivePass,
  archivePassBudgetMs,
  MIRROR_SAMPLE_RATE,
  TARGET_SAMPLE_RATE,
};
