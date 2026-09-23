/**
 * The renderer half of the device checks (see helpers/audioLevelCheck.js for
 * main's): RMS of the microphone analyser's float frames, and the tracker
 * that turns a listen into a verdict.
 */
export const HEARD_RMS = 0.02;
export const LISTEN_MS = 6000;

export type LevelVerdict = "heard" | "silent" | "nothing";

export function rmsOfFloat(frame: Float32Array): number {
  if (frame.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

export interface LevelTracker {
  push(rms: number): void;
  readonly peak: number;
  readonly chunks: number;
  verdict(): LevelVerdict;
}

export function createLevelTracker({ heardAbove = HEARD_RMS } = {}): LevelTracker {
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
    verdict() {
      if (chunks === 0) return "nothing";
      return peak >= heardAbove ? "heard" : "silent";
    },
  };
}
