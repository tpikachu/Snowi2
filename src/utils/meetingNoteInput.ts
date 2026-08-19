/**
 * How a finished meeting is rendered for the note-generation model.
 *
 * Pure and dependency-free so both the manual "Generate Notes" button and the
 * automatic run at Stop can share it — and so it can be tested without a
 * settings store or an Electron bridge behind it.
 */

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
