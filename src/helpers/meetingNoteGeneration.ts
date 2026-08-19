import { getSettings, selectResolvedNoteFormatting } from "../stores/settingsStore";
import { runBackgroundAction, type RunActionLabels } from "../stores/actionProcessingStore";
import { isRegenerableNoteTitle } from "./regenerableNoteTitle";
import { makeNoteContentHash, noteEnhancementSource } from "../utils/noteContentHash";
import {
  buildMeetingActionInput,
  formatMeetingTranscript,
  type MeetingSpeakerLabels,
} from "../utils/meetingNoteInput";
import type { ActionItem, NoteItem } from "../types/electron";
import type { TranscriptSegment } from "../stores/meetingRecordingStore";
import logger from "../utils/logger";

/** The built-in "Generate Notes" action, or null if it has been deleted. */
export async function getGenerateNotesAction(): Promise<ActionItem | null> {
  try {
    const actions = await window.electronAPI?.getActions?.();
    if (!Array.isArray(actions)) return null;
    return actions.find((action) => action.is_builtin) ?? null;
  } catch {
    return null;
  }
}

export interface AutoGenerateArgs {
  noteId: number;
  noteTitle: string | null;
  segments: readonly TranscriptSegment[];
  /** Name of the calendar event this meeting came from, if any. */
  calendarEventName?: string | null;
  speakerLabels: MeetingSpeakerLabels;
  /** Titles that mean "this note has never been named". */
  titlePlaceholders: string[];
  labels: RunActionLabels;
}

/**
 * Kicks off note generation for a just-finished meeting. Fire and forget: the
 * result lands on the note through the same store the manual action uses.
 *
 * Returns whether generation actually started, so the caller can tell the user
 * that notes are on the way rather than implying it unconditionally.
 */
export async function autoGenerateMeetingNotes(args: AutoGenerateArgs): Promise<boolean> {
  const transcript = formatMeetingTranscript(args.segments, args.speakerLabels);
  if (!transcript.trim()) return false;

  const modelId = selectResolvedNoteFormatting(getSettings()).model;
  if (!modelId) {
    // Not an error worth interrupting the user for: they stopped a meeting,
    // and the transcript is saved either way.
    logger.info("Skipping automatic meeting notes — no note formatting model", {}, "meeting");
    return false;
  }

  const action = await getGenerateNotesAction();
  if (!action) {
    logger.info("Skipping automatic meeting notes — no built-in action", {}, "meeting");
    return false;
  }

  let noteContent = "";
  let rawTranscript = "";
  try {
    const note: NoteItem | null = (await window.electronAPI?.getNote?.(args.noteId)) ?? null;
    noteContent = note?.content ?? "";
    rawTranscript = note?.transcript ?? "";
  } catch {
    // The note's own text is a bonus; the transcript is the substance.
  }

  runBackgroundAction(
    args.noteId,
    buildMeetingActionInput(noteContent, transcript),
    // Hashed over the note's *stored* transcript, not the formatted one, and
    // through the same helper the manual path uses — otherwise the note would
    // read as stale the moment it opened and offer to redo work just done.
    makeNoteContentHash(noteEnhancementSource(noteContent, rawTranscript)),
    action,
    {
      modelId,
      isMeetingNote: true,
      // Never renames a meeting the user titled, or one named after its
      // calendar event — the same guard the manual button applies.
      allowTitleGeneration: isRegenerableNoteTitle(
        args.noteTitle ?? "",
        args.titlePlaceholders,
        args.calendarEventName ?? null
      ),
    },
    args.labels
  );

  return true;
}
