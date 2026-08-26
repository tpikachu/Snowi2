/**
 * What the meeting assistant has to say, as it crosses into the panel's window.
 *
 * A third payload alongside the snapshot and the transcript, on its own
 * channel, for the same reason those are separate from each other: this changes
 * on every token of a streaming answer, while the snapshot changes a handful of
 * times an hour. Folding them together would publish the whole meeting status
 * on every word.
 *
 * Errors travel as i18n keys rather than sentences. The renderer that produces
 * them is the control panel and the one that shows them is the panel, and only
 * the second one knows which language its user is reading.
 *
 * Pure — no store, no Electron, no i18n. Both ends agree on this definition.
 */

/** A past note an answer or suggestion was built on. */
export interface AssistNoteRef {
  noteId: number;
  title: string;
}

/**
 * How much work an answer is allowed to do before it starts talking.
 *
 * `fast` answers from the live transcript alone — no retrieval round trip, no
 * provider thinking — because mid-call the person on the other end is already
 * waiting. `thinking` also searches the user's past notes and grounds the
 * answer on what it finds, which is worth seconds when the question reaches
 * beyond today's meeting. Fast is the default; thinking is the escalation.
 */
export type AssistMode = "fast" | "thinking";

export interface AssistSuggestion {
  text: string;
  sources: AssistNoteRef[];
  /**
   * True once the conversation has moved past what this was built from. The
   * panel dims rather than hides it: slightly old advice still beats a blank
   * box when someone is waiting for you to say something.
   */
  stale: boolean;
}

export interface AssistAnswer {
  question: string;
  /**
   * Which mode produced this. The panel labels the answer with it, and offers
   * "check past notes" only on a fast answer — escalating a thinking answer to
   * itself would be a button that does nothing.
   */
  mode: AssistMode;
  text: string;
  streaming: boolean;
  sources: AssistNoteRef[];
  /** i18n key, resolved by whichever window renders it. */
  errorKey: string | null;
}

/**
 * The previous occurrence of a recurring meeting, as the panel shows it.
 *
 * Resolved once when recording starts (title + attendee matching over past
 * meeting notes) and pinned for the whole meeting. `openClaims` is a count,
 * not the claims — the substance rides inside the assistant's prompts, and
 * the panel only has to say there is something worth asking about.
 */
export interface AssistLastTime {
  noteId: number;
  /** ISO datetime of the last occurrence; the panel formats it locally. */
  date: string;
  /** Claims still open from last time. Zero still shows the line. */
  openClaims: number;
}

export interface MeetingAssistState {
  /**
   * Whether a model is configured for this at all. False makes the panel
   * explain what is missing instead of waiting for an answer that never comes.
   */
  configured: boolean;
  /** Null when this meeting is not a recognized occurrence of a series. */
  lastTime: AssistLastTime | null;
  suggestion: AssistSuggestion | null;
  /** A suggestion is being prepared. Shown only when there is nothing to replace. */
  suggestionPending: boolean;
  answer: AssistAnswer | null;
}

export const IDLE_ASSIST: MeetingAssistState = {
  configured: false,
  lastTime: null,
  suggestion: null,
  suggestionPending: false,
  answer: null,
};

const noteRefsEqual = (a: readonly AssistNoteRef[], b: readonly AssistNoteRef[]): boolean =>
  a.length === b.length && a.every((note, index) => note.noteId === b[index].noteId);

/**
 * Whether a rebuilt state is worth another IPC hop.
 *
 * Compared by content, not identity: the bridge rebuilds this on a timer, so
 * every publish would otherwise look new even when nothing has been said for a
 * minute.
 */
export function assistStatesEqual(
  a: MeetingAssistState | null,
  b: MeetingAssistState | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.configured !== b.configured) return false;
  if (a.suggestionPending !== b.suggestionPending) return false;

  if (!!a.lastTime !== !!b.lastTime) return false;
  if (a.lastTime && b.lastTime) {
    if (a.lastTime.noteId !== b.lastTime.noteId) return false;
    if (a.lastTime.date !== b.lastTime.date) return false;
    if (a.lastTime.openClaims !== b.lastTime.openClaims) return false;
  }

  if (!!a.suggestion !== !!b.suggestion) return false;
  if (a.suggestion && b.suggestion) {
    if (a.suggestion.text !== b.suggestion.text) return false;
    if (a.suggestion.stale !== b.suggestion.stale) return false;
    if (!noteRefsEqual(a.suggestion.sources, b.suggestion.sources)) return false;
  }

  if (!!a.answer !== !!b.answer) return false;
  if (a.answer && b.answer) {
    if (a.answer.question !== b.answer.question) return false;
    if (a.answer.mode !== b.answer.mode) return false;
    if (a.answer.text !== b.answer.text) return false;
    if (a.answer.streaming !== b.answer.streaming) return false;
    if (a.answer.errorKey !== b.answer.errorKey) return false;
    if (!noteRefsEqual(a.answer.sources, b.answer.sources)) return false;
  }

  return true;
}
