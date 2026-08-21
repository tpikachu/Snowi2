import { useCallback, useEffect, useRef } from "react";
import ReasoningService, { type AgentStreamChunk } from "../services/ReasoningService";
import { isEnterpriseProvider } from "../models/ModelRegistry";
import { getSettings, selectResolvedLLMConfig } from "../stores/settingsStore";
import { useMeetingRecordingStore } from "../stores/meetingRecordingStore";
import {
  clearAnswer,
  markSuggestionStale,
  resetMeetingAssist,
  setAssistConfigured,
  setSuggestion,
  setSuggestionPending,
  startAnswer,
  updateAnswer,
} from "../stores/meetingAssistStore";
import {
  IDLE_SCHEDULER,
  decideAssistRequest,
  isSuggestionStale,
  markRequested,
  markSettled,
  selectAssistWindow,
  type AssistSchedulerState,
  type AssistSegment,
} from "../utils/meetingAssistPolicy";
import {
  buildAnswerMessages,
  buildAssistRetrievalQuery,
  buildSuggestionMessages,
  parseSuggestion,
  toAssistSegments,
  type AssistNote,
} from "../utils/meetingAssistPrompt";
import { filterGrounding } from "../utils/chatRetrieval";
import type { AssistNoteRef } from "../utils/meetingAssistState";
import logger from "../utils/logger";

/**
 * How often the scheduler is asked whether it is worth spending a call.
 *
 * Driven by a timer rather than by the store subscription on purpose: that
 * subscription fires on every partial caption — several times a second while
 * anyone is talking — and the policy would be re-run hundreds of times to
 * answer "no" in all but one of them. A second of latency is invisible next to
 * the model call it precedes.
 */
const TICK_MS = 1_000;

/** Past notes carried into an assist request. Small: prefill is the latency. */
const ASSIST_NOTE_LIMIT = 4;
const ANSWER_NOTE_LIMIT = 6;

/** A meeting question that hangs is worthless — the moment it was asked for has passed. */
const ASSIST_TIMEOUT_MS = 30_000;

type Activity = "suggestion" | "answer";

interface ResolvedAssistModel {
  model: string;
  provider: string;
  config: {
    systemPrompt: string;
    inferenceScope: "chatIntelligence";
    lanUrl?: string;
    baseUrl?: string;
    customApiKey?: string;
    disableThinking?: boolean;
  };
}

/**
 * The model the assistant runs on.
 *
 * Deliberately the chat scope rather than a dedicated one. The in-meeting
 * assistant and the notes chat answer the same kind of question over the same
 * library, and asking someone to configure two models to get one feature is a
 * setup step that buys nothing they can perceive. If time-to-first-token ever
 * needs its own small fast model, this is the single seam to change.
 */
function resolveAssistModel(systemPrompt: string): ResolvedAssistModel | null {
  const settings = getSettings();
  const chat = selectResolvedLLMConfig(settings, "chatIntelligence");
  if (!chat.model) return null;

  const mode = chat.mode || "local";
  const isLan = mode === "self-hosted" && !!chat.remoteUrl;
  const isCustom = mode === "providers" && chat.provider === "custom";

  return {
    model: chat.model,
    provider: chat.provider,
    config: {
      systemPrompt,
      inferenceScope: "chatIntelligence",
      lanUrl: isLan ? chat.remoteUrl : undefined,
      baseUrl: isCustom ? chat.cloudBaseUrl || undefined : undefined,
      customApiKey: isCustom || isLan ? chat.customApiKey || undefined : undefined,
      disableThinking: chat.disableThinking,
    },
  };
}

/**
 * Past notes for one request.
 *
 * Weak hits are dropped rather than passed along: a keyword-only match on a
 * common word is exactly the "context" that makes a suggestion confidently
 * about the wrong meeting, and during a call there is no chance to notice.
 */
async function retrieveAssistNotes(query: string, limit: number): Promise<AssistNote[]> {
  if (!query || !window.electronAPI?.semanticSearchNotes) return [];
  try {
    const results = await window.electronAPI.semanticSearchNotes(query, limit, null, null);
    if (!results?.length) return [];

    const candidates = results.map(
      (result: {
        id: number;
        title: string;
        matched_snippet?: string;
        content?: string;
        enhanced_content?: string;
        semantic_score?: number;
      }) => ({
        noteId: result.id,
        title: result.title,
        // The passage that matched, when search could name one. Falling back
        // to the top of a long meeting note is what makes retrieved context
        // useless: the vector matched something on page three.
        snippet: (result.matched_snippet || result.enhanced_content || result.content || "").trim(),
        semanticScore: result.semantic_score,
      })
    );

    return filterGrounding(candidates)
      .filter((note) => note.snippet)
      .map((note) => ({ noteId: note.noteId, title: note.title, snippet: note.snippet }));
  } catch {
    return [];
  }
}

const toRefs = (notes: readonly AssistNote[]): AssistNoteRef[] =>
  notes.map((note) => ({ noteId: note.noteId, title: note.title }));

async function collectStream(
  stream: AsyncGenerator<AgentStreamChunk>,
  onText?: (full: string) => void
): Promise<string> {
  let full = "";
  for await (const chunk of stream) {
    if (chunk.type === "content") {
      full += chunk.text;
      onText?.(full);
    }
  }
  return full;
}

export interface MeetingAssist {
  /** Ask a question about the meeting. Preempts any suggestion being prepared. */
  ask: (question: string) => Promise<void>;
  clear: () => void;
}

/**
 * Gives the meeting panel something to say.
 *
 * Two jobs on one model client. It *precomputes* a suggestion whenever the
 * other side stops talking, because "what do I say next?" cannot be answered
 * on demand — no model is instant, and an answer that arrives eight seconds
 * into an awkward silence is an answer nobody wanted. And it *answers*
 * questions asked in the panel, where streaming is the point: the user reads
 * the first sentence while the rest arrives.
 *
 * Runs in whichever renderer owns the capture graph, which is the control
 * panel. The floating panel is a view: it sends the question over and renders
 * what comes back, so there is one implementation and one model client.
 *
 * Strictly one request at a time. `ReasoningService` holds a single abort
 * controller, so two overlapping streams would cancel each other; and a
 * question the user typed always beats a suggestion nobody asked for, so a
 * question preempts.
 */
export function useMeetingAssist(): MeetingAssist {
  const schedulerRef = useRef<AssistSchedulerState>(IDLE_SCHEDULER);
  const activityRef = useRef<Activity | null>(null);
  const mountedRef = useRef(true);
  /**
   * Which question is current. Two questions in a row share one model client,
   * so the first one's stream is cancelled — and without this, its `finally`
   * would then clear the flags belonging to the second and let a suggestion
   * start on top of an answer the user is still waiting for.
   */
  const askSeqRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      ReasoningService.cancelActiveStream();
    };
  }, []);

  /** The settled transcript as the policy sees it. Live captions are excluded:
   *  a partial rewrites itself word by word, and scheduling against it would
   *  fire on a half-finished sentence and then again on the same sentence. */
  const readSegments = useCallback((now: number): AssistSegment[] => {
    const state = useMeetingRecordingStore.getState();
    return toAssistSegments(state.segments, now);
  }, []);

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed) return;

      // The user asked. Whatever was running — a suggestion nobody requested,
      // or the previous question — gives up the model client.
      if (activityRef.current) {
        ReasoningService.cancelActiveStream();
        schedulerRef.current = markSettled(schedulerRef.current);
        setSuggestionPending(false);
      }
      const seq = ++askSeqRef.current;
      const isCurrent = () => mountedRef.current && askSeqRef.current === seq;
      activityRef.current = "answer";
      startAnswer(trimmed);

      const now = Date.now();
      const state = useMeetingRecordingStore.getState();
      const segments = selectAssistWindow(readSegments(now), now);
      const notes = await retrieveAssistNotes(
        buildAssistRetrievalQuery(segments, trimmed),
        ANSWER_NOTE_LIMIT
      );
      if (!isCurrent()) return;
      updateAnswer({ sources: toRefs(notes) });

      const { systemPrompt, messages } = buildAnswerMessages({
        meetingTitle: state.recordingNoteTitle,
        segments,
        notes,
        question: trimmed,
      });

      const resolved = resolveAssistModel(systemPrompt);
      if (!resolved) {
        setAssistConfigured(false);
        updateAnswer({ streaming: false, errorKey: "notes.meetingPanel.ask.noModel" });
        if (askSeqRef.current === seq) activityRef.current = null;
        return;
      }

      // A question that hangs is worthless — the moment it was asked for has
      // passed — so it is abandoned rather than left waiting on a provider.
      const timeout = setTimeout(() => {
        if (askSeqRef.current === seq) ReasoningService.cancelActiveStream();
      }, ASSIST_TIMEOUT_MS);
      try {
        const text = await collectStream(
          ReasoningService.processTextStreamingAI(
            messages,
            resolved.model,
            resolved.provider,
            resolved.config
          ),
          (full) => {
            if (isCurrent()) updateAnswer({ text: full });
          }
        );
        if (!isCurrent()) return;
        updateAnswer({
          text,
          streaming: false,
          errorKey: text.trim() ? null : "notes.meetingPanel.ask.noAnswer",
        });
      } catch (error) {
        logger.error(
          "Meeting assistant answer failed",
          { error: (error as Error).message },
          "meeting"
        );
        if (isCurrent()) {
          updateAnswer({ streaming: false, errorKey: "notes.meetingPanel.ask.failed" });
        }
      } finally {
        clearTimeout(timeout);
        if (askSeqRef.current === seq) activityRef.current = null;
      }
    },
    [readSegments]
  );

  const requestSuggestion = useCallback(async (segments: AssistSegment[], now: number) => {
    activityRef.current = "suggestion";
    schedulerRef.current = markRequested(schedulerRef.current, segments, now);
    setSuggestionPending(true);

    // A question arriving mid-suggestion takes the model client away. The
    // stream may then end cleanly rather than throwing, so the result is
    // checked before it is shown — half a sentence of advice is worse than
    // none.
    const stillOurs = () => mountedRef.current && activityRef.current === "suggestion";

    try {
      const state = useMeetingRecordingStore.getState();
      const notes = await retrieveAssistNotes(
        buildAssistRetrievalQuery(segments),
        ASSIST_NOTE_LIMIT
      );
      if (!stillOurs()) return;

      const { systemPrompt, messages } = buildSuggestionMessages({
        meetingTitle: state.recordingNoteTitle,
        segments,
        notes,
      });

      const resolved = resolveAssistModel(systemPrompt);
      if (!resolved) {
        setAssistConfigured(false);
        setSuggestionPending(false);
        return;
      }

      // Not streamed into the UI. A suggestion is precomputed and read whole
      // a few seconds later; showing it assemble word by word would draw the
      // eye away from the meeting for the entire time it takes to write.
      const raw = await collectStream(
        ReasoningService.processTextStreamingAI(
          messages,
          resolved.model,
          resolved.provider,
          resolved.config
        )
      );
      if (!stillOurs()) return;

      const text = parseSuggestion(raw);
      // A decline leaves the previous suggestion up rather than blanking the
      // pane: the model saying "nothing to add" is not a reason to take away
      // advice that was good ten seconds ago.
      if (!text) setSuggestionPending(false);
      else setSuggestion({ text, sources: toRefs(notes), stale: false });
    } catch (error) {
      logger.warn(
        "Meeting assistant suggestion failed",
        { error: (error as Error).message },
        "meeting"
      );
      if (mountedRef.current) setSuggestionPending(false);
    } finally {
      schedulerRef.current = markSettled(schedulerRef.current);
      if (activityRef.current === "suggestion") activityRef.current = null;
    }
  }, []);

  // Reset when a meeting ends, so the next one does not open holding the last
  // one's advice.
  const isRecording = useMeetingRecordingStore((state) => state.isRecording);
  useEffect(() => {
    if (isRecording) return undefined;
    schedulerRef.current = IDLE_SCHEDULER;
    resetMeetingAssist();
    return undefined;
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording) return undefined;

    const tick = () => {
      // Re-read rather than captured: someone can configure a model from
      // Settings while the meeting runs, and the panel should stop saying the
      // assistant is unavailable the moment they have.
      setAssistConfigured(
        Boolean(selectResolvedLLMConfig(getSettings(), "chatIntelligence").model)
      );

      const now = Date.now();
      const state = useMeetingRecordingStore.getState();
      const window = selectAssistWindow(readSegments(now), now);

      const newest = window[window.length - 1]?.timestamp ?? null;
      markSuggestionStale(
        isSuggestionStale({
          suggestedAtSegmentTime: schedulerRef.current.lastRequestSegmentAt,
          newestSegmentAt: newest,
        })
      );

      // An answer in flight owns the model client; the scheduler is told to
      // hold rather than asked, so a question is never raced by a suggestion.
      if (activityRef.current === "answer") return;

      const decision = decideAssistRequest({
        isRecording: state.isRecording,
        isPaused: state.isPaused,
        window,
        scheduler: schedulerRef.current,
        now,
      });
      if (decision.request) void requestSuggestion(window, now);
    };

    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [isRecording, readSegments, requestSuggestion]);

  const clear = useCallback(() => {
    clearAnswer();
  }, []);

  return { ask, clear };
}
