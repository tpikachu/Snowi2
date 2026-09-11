/**
 * How a finished meeting is rendered for the note-generation model.
 *
 * Pure and dependency-free so both the manual "Generate Notes" button and the
 * automatic run at Stop can share it — and so it can be tested without a
 * settings store or an Electron bridge behind it.
 */

import type { TFunction } from "i18next";

export interface MeetingSpeakerLabels {
  you: string;
  them: string;
}

interface FormattableSegment {
  text: string;
  source: "mic" | "system";
  speakerName?: string;
}

/**
 * Titles that mean "this note has never really been named", so generation is
 * free to replace them. Shared so the manual and automatic paths cannot
 * disagree about which titles are the user's and which are placeholders.
 */
export const MEETING_TITLE_PLACEHOLDERS = [
  "notes.list.untitledNote",
  "notes.list.newNote",
  "notes.sidebar.newNote",
] as const;

/** The dated default main stamps on a meeting with no calendar summary. */
export const MEETING_DATED_TITLE_KEY = "notes.meeting.defaultTitle";

/** Stands in for the date while the template is read back out of i18n. */
const DATE_STAND_IN = "[[date]]";

/**
 * Every title a meeting note can be born with, in the form
 * `isRegenerableNoteTitle` wants: the localized labels, and the dated default
 * as its template ("Meeting — {{date}}") — the date it was stamped with is not
 * known here, so the predicate matches around the slot. The template is read
 * through `t` with a stand-in for the date, then the slot is put back: asking
 * i18next to interpolate a literal "{{date}}" would loop on its own output.
 */
export function meetingTitlePlaceholders(t: TFunction): string[] {
  return [
    ...MEETING_TITLE_PLACEHOLDERS.map((key) => t(key)),
    t(MEETING_DATED_TITLE_KEY, { date: DATE_STAND_IN }).split(DATE_STAND_IN).join("{{date}}"),
  ];
}

/** One line per segment, attributed to a resolved speaker where there is one. */
export function formatMeetingTranscript(
  segments: readonly FormattableSegment[],
  labels: MeetingSpeakerLabels
): string {
  return (
    segments
      // Filtered on the segment's own text, not the rendered line — a line is
      // never empty once a speaker label is prepended, so checking afterwards
      // would keep every "Them:   " that streaming left behind.
      .filter((segment) => segment.text?.trim())
      .map((segment) => {
        const speaker =
          segment.speakerName?.trim() || (segment.source === "mic" ? labels.you : labels.them);
        return `${speaker}: ${segment.text.trim()}`;
      })
      .join("\n")
  );
}

/**
 * The prompt body: whatever the user typed first, then the transcript.
 *
 * The order matters — the rough notes are the outline the transcript fills in,
 * which is the shape the Generate Notes prompt is written around.
 */
export function buildMeetingActionInput(noteContent: string, transcript: string): string {
  return [
    noteContent.trim(),
    transcript.trim() ? `## Meeting Transcript\n${transcript.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
