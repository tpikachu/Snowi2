/**
 * One note can hold several capture sessions: a resumed meeting appends its
 * segments to the same transcript, stamped with wall-clock (epoch ms)
 * timestamps. Rendered against a single base, the second session would read
 * as hours of meeting ("180:00"), so the transcript clock restarts whenever
 * the recording provably stopped and came back — a gap no live session
 * produces.
 */

export interface SessionClockSegment {
  id: string;
  timestamp?: number | null;
}

/** A wall-clock jump this large between finals is a new capture session
 *  (a resumed meeting), not silence inside one. */
export const SESSION_BREAK_MS = 30 * 60_000;

export interface TranscriptSessionClock {
  /** Segment id → the timestamp its mm:ss offset counts from. */
  baseById: Map<string, number>;
  /** Segments that open a session other than the first (divider positions). */
  resumeStartIds: Set<string>;
}

export function buildSessionClock(
  segments: readonly SessionClockSegment[],
  breakMs: number = SESSION_BREAK_MS
): TranscriptSessionClock {
  const baseById = new Map<string, number>();
  const resumeStartIds = new Set<string>();
  let base: number | null = null;
  let prev: number | null = null;
  for (const segment of segments) {
    if (segment.timestamp == null) continue;
    if (base != null && prev != null && segment.timestamp - prev > breakMs) {
      base = segment.timestamp;
      resumeStartIds.add(segment.id);
    } else if (base == null) {
      base = segment.timestamp;
    }
    prev = segment.timestamp;
    baseById.set(segment.id, base);
  }
  return { baseById, resumeStartIds };
}
