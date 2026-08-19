/**
 * Rendering the window a meeting session actually ran for.
 *
 * Both ends are stored (`recording_started_at`, `recording_ended_at`). Neither
 * is derived, and the end in particular cannot be: pausing a meeting excludes
 * the gaps from `audio_duration_seconds`, so start + duration reports a meeting
 * paused for twenty minutes as ending twenty minutes before it did.
 *
 * Pure so the formatting is testable without a clock or a locale surprise.
 */

export interface MeetingWindowSource {
  recording_started_at?: string | null;
  recording_ended_at?: string | null;
  /** Fallback start for meetings recorded before the columns existed. */
  created_at?: string | null;
  audio_duration_seconds?: number | null;
}

export interface MeetingWindow {
  start: Date;
  end: Date | null;
  /** True when the start came from created_at rather than a recorded start. */
  approximate: boolean;
}

function parse(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Resolves the session window, degrading rather than disappearing for meetings
 * recorded before the timestamps were stored: those still know roughly when
 * they started, and saying so beats showing nothing.
 */
export function resolveMeetingWindow(note: MeetingWindowSource): MeetingWindow | null {
  const recordedStart = parse(note.recording_started_at);
  const recordedEnd = parse(note.recording_ended_at);
  if (recordedStart) {
    return { start: recordedStart, end: recordedEnd, approximate: false };
  }

  const created = parse(note.created_at);
  if (!created) return null;

  // Legacy rows only. The duration is the best end available, and it is wrong
  // by exactly the paused time — which is why `approximate` is set and callers
  // render it with a "~".
  const seconds = note.audio_duration_seconds;
  const end =
    typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0
      ? new Date(created.getTime() + seconds * 1000)
      : null;
  return { start: created, end, approximate: true };
}

function timeOnly(date: Date, locale?: string): string {
  return date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

/**
 * "14:05 – 14:52", or just the start when the session never recorded an end
 * (a crash mid-meeting, or a legacy row with no duration).
 *
 * @param locale Passed through to toLocaleTimeString; undefined uses the
 *               runtime default, which is what the app wants at runtime and
 *               what tests pin explicitly.
 */
export function formatMeetingWindow(
  note: MeetingWindowSource,
  locale?: string
): { text: string; approximate: boolean } | null {
  const window = resolveMeetingWindow(note);
  if (!window) return null;

  const start = timeOnly(window.start, locale);
  if (!window.end) return { text: start, approximate: window.approximate };

  // An en dash, not a hyphen: this is a range, and "14:05 - 14:52" reads as a
  // subtraction at small sizes.
  return {
    text: `${start} – ${timeOnly(window.end, locale)}`,
    approximate: window.approximate,
  };
}

/** "1h 12m", "48m", "35s" — for the duration shown beside the window. */
export function formatSessionLength(note: MeetingWindowSource): string | null {
  const window = resolveMeetingWindow(note);
  if (!window?.end) return null;

  const seconds = Math.round((window.end.getTime() - window.start.getTime()) / 1000);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}
