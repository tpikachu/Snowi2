import { create } from "zustand";
import {
  IDLE_ASSIST,
  type AssistAnswer,
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

export function startAnswer(question: string): void {
  useMeetingAssistStore.setState({
    answer: { question, text: "", streaming: true, sources: [], errorKey: null },
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

/** Back to nothing, for the end of a meeting. The next one starts empty. */
export function resetMeetingAssist(): void {
  useMeetingAssistStore.setState({ ...IDLE_ASSIST });
}
