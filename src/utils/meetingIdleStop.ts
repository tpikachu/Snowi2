/**
 * Ending a meeting that has gone quiet (client direction, 2026-09-22: "the
 * meeting should stop recording due to inactivity automatically").
 *
 * Activity is speech: a transcribed line from either side, or the
 * microphone reading a voice even when the transcriber has nothing to say
 * about it. The store stamps the last of those; every check asks whether
 * the silence since then has outlasted the limit. Paused time never counts —
 * a paused meeting is waiting on purpose — and a resume restarts the clock.
 *
 * Pure. The setting is minutes, 0 meaning never.
 */

/** The choices Settings offers, in minutes; 0 is "never". */
export const IDLE_STOP_CHOICES = [0, 5, 10, 20, 30] as const;
export const DEFAULT_IDLE_STOP_MINUTES = 10;
/** Below this the meter is reading the room, not a voice. */
export const MIC_ACTIVITY_LEVEL = 0.06;
/** How often the store looks. */
export const IDLE_CHECK_INTERVAL_MS = 15_000;

/** A stored value made safe: a listed choice, else the default. */
export function normalizeIdleStopMinutes(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_IDLE_STOP_MINUTES;
  const rounded = Math.round(n);
  return (IDLE_STOP_CHOICES as readonly number[]).includes(rounded)
    ? rounded
    : DEFAULT_IDLE_STOP_MINUTES;
}

export interface IdleStopInput {
  now: number;
  /** When speech was last heard, or the session (re)started. */
  lastActivityAt: number;
  idleMinutes: number;
  isRecording: boolean;
  isPaused: boolean;
}

/** True when the meeting has been silent for the whole limit and should end. */
export function idleStopDue({
  now,
  lastActivityAt,
  idleMinutes,
  isRecording,
  isPaused,
}: IdleStopInput): boolean {
  if (!isRecording || isPaused) return false;
  if (!(idleMinutes > 0)) return false;
  return now - lastActivityAt >= idleMinutes * 60_000;
}
