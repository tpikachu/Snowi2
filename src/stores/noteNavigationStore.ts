import { create } from "zustand";

/**
 * A request to show a particular note on a particular view.
 *
 * The note list and the editor's view mode are ControlPanel and NoteEditor
 * local state, so anything further from them than a prop — the meeting cue
 * card's "Show transcript", arriving over IPC in a headless bridge — has no
 * way to land there. Same shape as settingsNavigationStore, for the same
 * reason: the request is posted here, ControlPanel selects the note, and the
 * editor for that note applies the view and consumes the request.
 */
export type NoteViewRequestMode = "transcript" | "enhanced" | "raw";

export interface NoteViewRequest {
  noteId: number;
  view: NoteViewRequestMode;
}

interface NoteNavigationState {
  pending: NoteViewRequest | null;
  /**
   * Bumped per request. Asking for the *same* note twice has to bring it
   * forward again, and an unchanged `pending` object alone would not say so.
   */
  nonce: number;
}

export const useNoteNavigationStore = create<NoteNavigationState>()(() => ({
  pending: null,
  nonce: 0,
}));

export function requestNoteView(request: NoteViewRequest): void {
  useNoteNavigationStore.setState((state) => ({ pending: request, nonce: state.nonce + 1 }));
}

/**
 * The pending request for this note, consumed — or null when the request is
 * for another note (or there is none). Only the editor that can honor the
 * view consumes it, so a request never vanishes before its note has mounted.
 */
export function consumeNoteViewRequest(noteId: number): NoteViewRequest | null {
  const { pending } = useNoteNavigationStore.getState();
  if (!pending || pending.noteId !== noteId) return null;
  useNoteNavigationStore.setState({ pending: null });
  return pending;
}
