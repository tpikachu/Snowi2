/**
 * Cuts a stream of 16 kHz mono speech into utterance-sized windows at pauses.
 *
 * The archive pass re-transcribes a whole meeting with an offline model, and
 * an offline model wants the audio in pieces the size of a spoken sentence:
 * long enough to carry context, short enough to decode in one go, and cut
 * where nobody is talking. The live path's fixed five-second buffers cut
 * words in half; a fixed thirty-second grid does the same less often. This
 * listens for the silence between utterances instead, and only falls back to
 * a grid — placed at the quietest recent moment — when someone talks through
 * the whole maximum window.
 *
 * Incremental, so a long meeting streams through without ever being resident:
 * push() returns the windows that became final, flush() the last one. Every
 * window carries its own samples and its absolute start and end sample index
 * in the pushed stream, which is what the caller maps to wall-clock time.
 *
 * Energy-only, deliberately. A neural VAD tells breath from speech better,
 * but a boundary only needs to land in a pause, not on its edge, and the
 * padding kept on both sides of a window stops a boundary that is a little
 * early or late from clipping a word. The thresholds float above a noise
 * floor measured over the last few seconds, so a fan or a hum does not turn
 * the whole meeting into one endless window.
 */
const DEFAULTS = {
  sampleRate: 16000,
  frameMs: 20,
  /** Below this a frame is silence even on a noisy microphone. */
  silenceRms: 0.004,
  /** Above this a frame is speech even on a quiet one. */
  speechRms: 0.008,
  /** How much silence after speech closes a window. */
  minSilenceMs: 450,
  /** Windows are cut by force at this length, at the quietest recent frame. */
  maxWindowMs: 22000,
  /** How far back the forced cut may look for that quiet frame. */
  cutLookbackMs: 4000,
  /** A window with less speech than this is a click or a breath, not a line. */
  minSpeechMs: 250,
  /** Context kept on both sides of the speech inside a window. */
  paddingMs: 200,
  /** Ceilings on the floating thresholds: a sustained loud sound is speech, not floor. */
  maxSilenceRms: 0.02,
  maxSpeechRms: 0.04,
  /** How many recent frames the noise floor is measured over. */
  floorWindowMs: 5000,
};

function frameRms(samples) {
  let sumSq = 0;
  for (let i = 0; i < samples.length; i += 1) sumSq += samples[i] * samples[i];
  return samples.length ? Math.sqrt(sumSq / samples.length) : 0;
}

function toFloat32(input) {
  if (input instanceof Float32Array) return input;
  if (input instanceof Int16Array) {
    const out = new Float32Array(input.length);
    for (let i = 0; i < input.length; i += 1) out[i] = input[i] / 32768;
    return out;
  }
  throw new Error("utteranceSplitter: push() takes a Float32Array or an Int16Array");
}

function createUtteranceSplitter(options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const frameSamples = Math.max(1, Math.round((opts.sampleRate * opts.frameMs) / 1000));
  const toFrames = (ms) => Math.max(1, Math.round(ms / opts.frameMs));
  const minSilenceFrames = toFrames(opts.minSilenceMs);
  const maxWindowFrames = toFrames(opts.maxWindowMs);
  const lookbackFrames = toFrames(opts.cutLookbackMs);
  const minSpeechFrames = toFrames(opts.minSpeechMs);
  const paddingFrames = toFrames(opts.paddingMs);
  const floorFrames = toFrames(opts.floorWindowMs);

  // Frames kept from the earliest one a window might still need: while idle,
  // the padding's worth; inside a window, all of it. frames[0] has the
  // absolute index `firstFrameIndex`.
  let frames = [];
  let firstFrameIndex = 0;
  let frameCount = 0;
  let pending = new Float32Array(0);
  const recentRms = [];

  let inWindow = false;
  let inSpeech = false;
  let windowStartFrame = 0;
  let lastSpeechFrame = -1;
  let silenceRun = 0;

  const frameAt = (absolute) => frames[absolute - firstFrameIndex];

  function noiseFloor() {
    let min = Infinity;
    for (const rms of recentRms) if (rms < min) min = rms;
    return Number.isFinite(min) ? min : 0;
  }

  function dropFramesBefore(absolute) {
    const count = Math.min(frames.length, Math.max(0, absolute - firstFrameIndex));
    if (count > 0) {
      frames = frames.slice(count);
      firstFrameIndex += count;
    }
  }

  function quietestFrame(from, to) {
    let best = to;
    let bestRms = Infinity;
    for (let i = Math.max(from, firstFrameIndex); i <= to; i += 1) {
      const frame = frameAt(i);
      if (frame && frame.rms < bestRms) {
        bestRms = frame.rms;
        best = i;
      }
    }
    return best;
  }

  function buildWindow(startFrame, endFrame) {
    const first = startFrame - firstFrameIndex;
    const last = endFrame - firstFrameIndex;
    let speech = 0;
    let firstSpeech = -1;
    let length = 0;
    for (let i = first; i <= last; i += 1) {
      if (frames[i].speech) {
        if (firstSpeech < 0) firstSpeech = startFrame + (i - first);
        speech += 1;
      }
      length += frames[i].samples.length;
    }
    if (speech < minSpeechFrames) return null;
    const samples = new Float32Array(length);
    let offset = 0;
    for (let i = first; i <= last; i += 1) {
      samples.set(frames[i].samples, offset);
      offset += frames[i].samples.length;
    }
    return {
      startSample: startFrame * frameSamples,
      /** Where the talking starts inside the window — the stamp for the line. */
      speechStartSample: (firstSpeech < 0 ? startFrame : firstSpeech) * frameSamples,
      endSample: (endFrame + 1) * frameSamples,
      samples,
    };
  }

  function processFrame(samples, out) {
    const idx = frameCount;
    frameCount += 1;
    const rms = frameRms(samples);
    recentRms.push(rms);
    if (recentRms.length > floorFrames) recentRms.shift();
    const floor = noiseFloor();
    const silenceThreshold = Math.min(opts.maxSilenceRms, Math.max(opts.silenceRms, floor * 2.5));
    const speechThreshold = Math.min(opts.maxSpeechRms, Math.max(opts.speechRms, floor * 4));
    const speech = inSpeech ? rms > silenceThreshold : rms > speechThreshold;
    frames.push({ rms, speech, samples });

    if (speech) {
      if (!inWindow) {
        inWindow = true;
        windowStartFrame = Math.max(firstFrameIndex, idx - paddingFrames);
      }
      inSpeech = true;
      lastSpeechFrame = idx;
      silenceRun = 0;
    } else {
      inSpeech = false;
      if (inWindow) silenceRun += 1;
    }

    if (inWindow) {
      if (silenceRun >= minSilenceFrames) {
        const endFrame = Math.min(idx, lastSpeechFrame + paddingFrames);
        const window = buildWindow(windowStartFrame, endFrame);
        if (window) out.push(window);
        inWindow = false;
      } else if (idx - windowStartFrame + 1 >= maxWindowFrames) {
        // Nobody paused: cut at the quietest recent frame and carry on from
        // the frame after it, which is already part of the next window.
        const cutAt = quietestFrame(idx - lookbackFrames + 1, idx);
        const window = buildWindow(windowStartFrame, cutAt);
        if (window) out.push(window);
        windowStartFrame = cutAt + 1;
        if (windowStartFrame > idx) {
          inWindow = false;
          silenceRun = 0;
        }
      }
    }

    dropFramesBefore(inWindow ? windowStartFrame : idx - paddingFrames + 1);
  }

  /** Feed samples; returns the windows that became final. */
  function push(input) {
    const incoming = toFloat32(input);
    const out = [];
    let data = incoming;
    if (pending.length) {
      data = new Float32Array(pending.length + incoming.length);
      data.set(pending, 0);
      data.set(incoming, pending.length);
    }
    let offset = 0;
    while (data.length - offset >= frameSamples) {
      processFrame(data.slice(offset, offset + frameSamples), out);
      offset += frameSamples;
    }
    pending = data.slice(offset);
    return out;
  }

  /** End of stream: the open window, if it holds speech. */
  function flush() {
    const out = [];
    if (pending.length) {
      const padded = new Float32Array(frameSamples);
      padded.set(pending, 0);
      pending = new Float32Array(0);
      processFrame(padded, out);
    }
    if (inWindow) {
      const endFrame = Math.min(frameCount - 1, lastSpeechFrame + paddingFrames);
      const window = buildWindow(windowStartFrame, endFrame);
      if (window) out.push(window);
      inWindow = false;
    }
    frames = [];
    firstFrameIndex = frameCount;
    return out;
  }

  return { push, flush, frameSamples };
}

module.exports = { createUtteranceSplitter, frameRms, DEFAULTS };
