// The device checks in Settings → General → Microphone ("Test microphone",
// "Test system audio") listen for a few seconds and say whether anything was
// heard. This is the arithmetic, shared by main (the native system-audio
// helpers hand over s16le PCM) and, mirrored in utils/audioLevelCheck.ts, by
// the renderer (the microphone's analyser hands over floats).

// The meeting's mic meter counts a voice from 0.06 RMS; a quiet room on a
// laptop mic sits around 0.005–0.01. Halfway between is "someone spoke".
const HEARD_RMS = 0.02;
// How long the checks listen.
const LISTEN_MS = 6000;

/** RMS of an s16le PCM buffer, 0..1. */
function rmsOfInt16(buffer) {
  const samples = Math.floor(buffer.length / 2);
  if (samples === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const v = buffer.readInt16LE(i * 2) / 32768;
    sum += v * v;
  }
  return Math.sqrt(sum / samples);
}

/**
 * Tracks the loudest moment of a listen. `push` takes an RMS; `verdict()`
 * says what was heard.
 */
function createLevelTracker({ heardAbove = HEARD_RMS } = {}) {
  let peak = 0;
  let chunks = 0;
  return {
    push(rms) {
      chunks += 1;
      if (rms > peak) peak = rms;
    },
    get peak() {
      return peak;
    },
    get chunks() {
      return chunks;
    },
    /** "heard" | "silent" | "nothing" (no audio arrived at all). */
    verdict() {
      if (chunks === 0) return "nothing";
      return peak >= heardAbove ? "heard" : "silent";
    },
  };
}

module.exports = { HEARD_RMS, LISTEN_MS, rmsOfInt16, createLevelTracker };
