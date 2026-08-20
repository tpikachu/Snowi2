// The renderer's parser, which returns TranscriptSegments. Not the
// same-named export in helpers/meetingSegments.js — that one takes a note id
// and builds database rows for the main process.
import { parseTranscriptSegments } from "../utils/parseTranscriptSegments";
import { makeNoteContentHash, noteEnhancementSource } from "../utils/noteContentHash";
import {
  buildMeetingActionInput,
  formatMeetingTranscript,
  type MeetingSpeakerLabels,
} from "../utils/meetingNoteInput";

/**
 * Everything needed to run a write-up on a note that already exists.
 *
 * `meetingNoteInput` says it is shared "so both the manual Generate Notes
 * button and the automatic run at Stop can share it" — and the automatic path
 * does, while the notes editor had grown its own copy inline. The two had
 * drifted: the inline one labelled every line "You:" or "Them:" from the
 * segment source and ignored `speakerName`, so regenerating a diarized meeting
 * by hand threw away the speaker names the automatic run had used. One helper,
 * so a third caller cannot invent a fourth answer.
 */

export interface WriteUpRequest {
  /** The prompt body: the user's own notes, then the transcript. */
  input: string;
  /** Hashed over the *stored* transcript, so the note does not read as stale. */
  contentHash: string;
  /** Whether this is transcript-shaped, which selects the meeting prompt. */
  isMeetingNote: boolean;
}

/**
 * @returns null when there is nothing to write up — no notes and no transcript.
 */
export function buildWriteUpRequest(
  noteContent: string,
  rawTranscript: string,
  labels: MeetingSpeakerLabels
): WriteUpRequest | null {
  const content = noteContent ?? "";
  const transcript = rawTranscript ?? "";
  if (!content.trim() && !transcript.trim()) return null;

  let formatted = "";
  let isMeetingNote = false;
  if (transcript.trim()) {
    const segments = parseTranscriptSegments(transcript);
    if (segments.length > 0) {
      isMeetingNote = true;
      formatted = formatMeetingTranscript(segments, labels);
    }
    // A transcript that does not parse into segments — an imported one, or an
    // older recording — is still the substance of the note, so it goes in raw
    // rather than being dropped.
    if (!formatted.trim()) formatted = transcript;
  }

  return {
    input: buildMeetingActionInput(content, formatted),
    contentHash: makeNoteContentHash(noteEnhancementSource(content, transcript)),
    isMeetingNote,
  };
}
