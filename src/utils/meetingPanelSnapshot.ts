/**
 * The meeting state that crosses into the floating panel's own renderer.
 *
 * The capture graph lives in the control panel's renderer, so the panel is a
 * view onto state it does not own. Keeping the wire shape here — pure, with no
 * store or Electron import — means both ends agree on one definition, and the
 * two rules that make the panel behave (what counts as a change worth sending,
 * and how the clock is read) are testable without a window.
 */

import { totalPausedMs, type MeetingGap } from "./meetingGaps";

export type MeetingMicStatus = "inactive" | "active" | "reconnecting" | "unavailable";

export interface MeetingPanelSnapshot {
  isRecording: boolean;
  isPaused: boolean;
  noteId: number | null;
  title: string | null;
  micStatus: MeetingMicStatus;
  /** Whether system audio is being captured alongside the microphone. */
  systemAudio: boolean;
  /** Milliseconds actually captured, excluding pauses, as of `capturedAt`. */
  capturedMs: number;
  /** `Date.now()` when `capturedMs` was measured. */
  capturedAt: number;
}

interface MeetingPanelSource {
  isRecording: boolean;
  isPaused: boolean;
  recordingNoteId: number | null;
  recordingNoteTitle: string | null;
  micCaptureStatus: MeetingMicStatus;
  systemCaptureActive: boolean;
  recordingStartedAt: number | null;
  gaps: readonly MeetingGap[];
}

/** Fields whose change means the panel has something new to show. */
const TRACKED_FIELDS = [
  "isRecording",
  "isPaused",
  "noteId",
  "title",
  "micStatus",
  "systemAudio",
] as const;

export function buildMeetingPanelSnapshot(
  state: MeetingPanelSource,
  now: number
): MeetingPanelSnapshot {
  const startedAt = state.recordingStartedAt;
  // An open gap counts up to `now`, so captured time freezes while paused
  // rather than reporting minutes the meeting did not record.
  const captured =
    startedAt == null ? 0 : Math.max(0, now - startedAt - totalPausedMs(state.gaps, now));

  return {
    isRecording: state.isRecording,
    isPaused: state.isPaused,
    noteId: state.recordingNoteId,
    title: state.recordingNoteTitle,
    micStatus: state.micCaptureStatus,
    systemAudio: state.systemCaptureActive,
    capturedMs: captured,
    capturedAt: now,
  };
}

/**
 * Whether two snapshots say the same thing.
 *
 * The clock fields are deliberately excluded: they advance continuously, and
 * treating them as changes would put an IPC message on every tick to say
 * something the panel can work out for itself.
 */
export function snapshotsEqual(
  a: MeetingPanelSnapshot | null,
  b: MeetingPanelSnapshot | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return TRACKED_FIELDS.every((field) => a[field] === b[field]);
}

/**
 * Reads the clock at `now`. A running meeting extends the last measurement by
 * real elapsed time rather than by a local timer, so the panel stays accurate
 * even when its window is hidden and its timers are throttled.
 */
export function capturedMsAt(snapshot: MeetingPanelSnapshot, now: number): number {
  if (snapshot.isPaused || !snapshot.isRecording) return snapshot.capturedMs;
  return snapshot.capturedMs + Math.max(0, now - snapshot.capturedAt);
}
