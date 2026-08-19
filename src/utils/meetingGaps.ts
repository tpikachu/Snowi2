/**
 * Pause-gap bookkeeping for a meeting (spec §13.2: "preserve gap markers for
 * pause, sleep, device loss and permission revocation").
 *
 * Pure and separate from the recording store because the finalized artifact
 * (§18) has to reproduce the same spans, and because the invariant that matters
 * — at most one gap open at a time — is easier to guarantee in one place than
 * across every caller that can pause.
 */

export interface MeetingGap {
  startedAt: number;
  /** Null while the meeting is still paused. */
  endedAt: number | null;
}

/** True when the last gap has not been closed yet. */
export function hasOpenGap(gaps: readonly MeetingGap[]): boolean {
  const last = gaps[gaps.length - 1];
  return last != null && last.endedAt == null;
}

/**
 * Starts a gap. A second pause with one already open is ignored rather than
 * stacking: two open gaps would make the recorded time ambiguous, and the
 * earlier one could never be closed.
 */
export function openGap(gaps: readonly MeetingGap[], at: number): MeetingGap[] {
  if (hasOpenGap(gaps)) return [...gaps];
  return [...gaps, { startedAt: at, endedAt: null }];
}

/**
 * Closes the open gap. A resume with nothing open is a no-op, and an end that
 * precedes its own start is clamped — a clock adjustment must not produce a
 * negative span.
 */
export function closeGap(gaps: readonly MeetingGap[], at: number): MeetingGap[] {
  const next = [...gaps];
  const last = next[next.length - 1];
  if (!last || last.endedAt != null) return next;
  next[next.length - 1] = { ...last, endedAt: Math.max(at, last.startedAt) };
  return next;
}

/** Total paused milliseconds. An open gap counts up to `now`. */
export function totalPausedMs(gaps: readonly MeetingGap[], now: number): number {
  return gaps.reduce((total, gap) => {
    const end = gap.endedAt ?? now;
    return total + Math.max(0, end - gap.startedAt);
  }, 0);
}
