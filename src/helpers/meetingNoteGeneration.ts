import { getSettings, selectResolvedActions } from "../stores/settingsStore";
import { runBackgroundAction, type RunActionLabels } from "../stores/actionProcessingStore";
import { templatePromptFor } from "../config/meetingTemplates";
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

  const actions = selectResolvedActions(getSettings());
  const modelId = actions.model;
  // Skipped in silence, on purpose.
  //
  // This used to raise a "Configure" toast, on the theory that the missing
  // model is the one thing standing between the meeting and the notes the user
  // expected. But nobody chose to run this — saving a meeting did — so the
  // toast interrupts the end of every single meeting to sell a feature that
  // was never set up, and it does it at the moment the user is walking out of
  // a call. Setup belongs in Settings; Home already says which capabilities
  // need a model, and the meeting still lands in the write-up backlog there.
  //
  // A self-hosted scope with no URL is the same situation wearing different
  // clothes: nothing to run against, and no reason to say so here.
  if (!modelId || (actions.mode === "self-hosted" && !actions.remoteUrl)) {
    logger.info(
      "Skipping automatic meeting notes — note formatting is not configured",
      { hasModel: Boolean(modelId), mode: actions.mode },
      "meeting"
    );
    return false;
  }

  const action = await getGenerateNotesAction();
  if (!action) {
    logger.info("Skipping automatic meeting notes — no built-in action", {}, "meeting");
    return false;
  }

  let noteContent = "";
  let rawTranscript = "";
  let templatePrompt = "";
  try {
    const note: NoteItem | null = (await window.electronAPI?.getNote?.(args.noteId)) ?? null;
    noteContent = note?.content ?? "";
    rawTranscript = note?.transcript ?? "";
    templatePrompt = templatePromptFor(note?.meeting_template);
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
      templatePrompt,
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
