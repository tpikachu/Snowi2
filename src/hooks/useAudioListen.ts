import { useCallback, useEffect, useRef, useState } from "react";
import { createLevelTracker, rmsOfFloat, type LevelVerdict } from "../utils/audioLevelCheck";

export interface AudioListenResult {
  verdict: LevelVerdict;
  peak: number;
}

export interface AudioListen {
  /** True from the stream opening until the listen ends. */
  active: boolean;
  /** Whole seconds left in the listen. */
  seconds: number;
  /** The latest smoothed RMS, 0..1. */
  level: number;
  /**
   * Opens a stream, meters it for `durationMs` and settles with what was
   * heard. `onStream` sees the live stream (a recorder can attach to it).
   * A second call while one runs is ignored.
   */
  run: (
    getStream: () => Promise<MediaStream>,
    durationMs: number,
    onStream?: (stream: MediaStream) => void
  ) => Promise<AudioListenResult>;
  /** Ends the listen early; `run` settles with what was heard so far. */
  stop: () => void;
}

const SMOOTHING = 0.6;

/**
 * Meters an audio stream for a few seconds — the microphone under
 * "Test microphone", the display-media loopback under "Test system audio",
 * and the recording behind "Test transcription" — and says whether anything
 * was heard (utils/audioLevelCheck.ts). The stream, the analyser and the
 * context are all released when the listen ends, however it ends.
 */
export function useAudioListen(): AudioListen {
  const [active, setActive] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  const stop = useCallback(() => {
    stopRef.current?.();
  }, []);

  const run = useCallback<AudioListen["run"]>(async (getStream, durationMs, onStream) => {
    if (stopRef.current) return { verdict: "nothing", peak: 0 };
    let settle: (result: AudioListenResult) => void = () => {};
    const done = new Promise<AudioListenResult>((resolve) => {
      settle = resolve;
    });
    const tracker = createLevelTracker();
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let countdown: ReturnType<typeof setInterval> | null = null;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      stopRef.current = null;
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      if (countdown) clearInterval(countdown);
      try {
        stream?.getTracks().forEach((track) => track.stop());
      } catch {}
      void context?.close().catch(() => {});
      setActive(false);
      setLevel(0);
      setSeconds(0);
      settle({ verdict: tracker.verdict(), peak: tracker.peak });
    };
    stopRef.current = finish;

    try {
      stream = await getStream();
      if (finished) {
        stream.getTracks().forEach((track) => track.stop());
        return done;
      }
      onStream?.(stream);
      context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const frame = new Float32Array(analyser.fftSize);
      let smoothed = 0;
      const tick = () => {
        analyser.getFloatTimeDomainData(frame);
        const rms = rmsOfFloat(frame);
        tracker.push(rms);
        smoothed = SMOOTHING * smoothed + (1 - SMOOTHING) * rms;
        setLevel(smoothed);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      setActive(true);
      const endsAt = Date.now() + durationMs;
      setSeconds(Math.ceil(durationMs / 1000));
      countdown = setInterval(() => {
        setSeconds(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
      }, 250);
      timer = setTimeout(finish, durationMs);
    } catch (error) {
      finish();
      throw error;
    }
    return done;
  }, []);

  return { active, seconds, level, run, stop };
}
