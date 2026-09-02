import { create } from "zustand";
import {
  IDLE_ASSIST,
  MAX_ANSWER_HISTORY,
  type AssistAnswer,
  type AssistLastTime,
  type AssistMode,
  type AssistSuggestion,
  type MeetingAssistState,
} from "../utils/meetingAssistState";

/**
 * What the meeting assistant currently has to say.
 *
 * A store rather than hook state because two windows read it and neither owns
 * it: `useMeetingAssist` (in the control panel, where the capture graph and the
 * model clients live) writes here, the panel bridge publishes it across the
 * process boundary on a timer, and the in-app meeting view can render the same
 * thing without a second copy of the logic.
 *
 * Holds only what is shown. The request scheduling lives in the hook, against
 * `meetingAssistPolicy`, because it is not state anything renders.
 */
export const useMeetingAssistStore = create<MeetingAssistState>(() => ({ ...IDLE_ASSIST }));

export const getMeetingAssist = (): MeetingAssistState => useMeetingAssistStore.getState();

export function setAssistConfigured(configured: boolean): void {
  if (useMeetingAssistStore.getState().configured === configured) return;
  useMeetingAssistStore.setState({ configured });
}

/** Set once when a meeting starts as an occurrence of a series; null otherwise. */
export function setAssistLastTime(lastTime: AssistLastTime | null): void {
  useMeetingAssistStore.setState({ lastTime });
}

export function setSuggestionPending(pending: boolean): void {
  if (useMeetingAssistStore.getState().suggestionPending === pending) return;
  useMeetingAssistStore.setState({ suggestionPending: pending });
}

export function setSuggestion(suggestion: AssistSuggestion | null): void {
  useMeetingAssistStore.setState({ suggestion, suggestionPending: false });
}

/**
 * Ages the current suggestion without replacing it.
 *
 * Kept separate from `setSuggestion` because staleness is recomputed on a timer
 * against the newest segment, and rebuilding the whole object each tick would
 * publish an "identical" state that compares unequal by identity.
 */
export function markSuggestionStale(stale: boolean): void {
  const current = useMeetingAssistStore.getState().suggestion;
  if (!current || current.stale === stale) return;
  useMeetingAssistStore.setState({ suggestion: { ...current, stale } });
}

export function startAnswer(question: string, mode: AssistMode): void {
  const { answer, answerHistory } = useMeetingAssistStore.getState();
  // A settled answer becomes history the moment the next question starts, so
  // the panel reads as a thread. A streaming or failed one just disappears —
  // it was never finished advice worth scrolling back to.
  const settled = answer && !answer.streaming && !answer.errorKey && answer.text.trim();
  useMeetingAssistStore.setState({
    answerHistory: settled ? [...answerHistory, answer].slice(-MAX_ANSWER_HISTORY) : answerHistory,
    answer: { question, mode, text: "", streaming: true, sources: [], errorKey: null },
  });
}

/** Folds a streamed chunk in. No-ops once the answer it belongs to is gone. */
export function updateAnswer(patch: Partial<AssistAnswer>): void {
  const current = useMeetingAssistStore.getState().answer;
  if (!current) return;
  useMeetingAssistStore.setState({ answer: { ...current, ...patch } });
}

export function clearAnswer(): void {
  if (!useMeetingAssistStore.getState().answer) return;
  useMeetingAssistStore.setState({ answer: null });
}

/**
 * The panel's Clear button: the whole ask thread, history included. Clearing
 * mid-stream is safe — the orphaned stream's updateAnswer no-ops on null.
 */
export function clearAskThread(): void {
  const { answer, answerHistory } = useMeetingAssistStore.getState();
  if (!answer && answerHistory.length === 0) return;
  useMeetingAssistStore.setState({ answer: null, answerHistory: [] });
}

/** Back to nothing, for the end of a meeting. The next one starts empty. */
export function resetMeetingAssist(): void {
  useMeetingAssistStore.setState({ ...IDLE_ASSIST });
}
