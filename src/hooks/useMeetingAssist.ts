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
  type AssistMemoryContext,
  type AssistNote,
} from "../utils/meetingAssistPrompt";
import { formatNoteClaims, formatOpenCommitments } from "../utils/memoryPrompt";
import { filterGrounding } from "../utils/chatRetrieval";
import type { AssistMode, AssistNoteRef } from "../utils/meetingAssistState";
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
function resolveAssistModel(
  systemPrompt: string,
  options: { forceDisableThinking?: boolean } = {}
): ResolvedAssistModel | null {
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
      // A fast answer overrides the configured setting rather than reading it:
      // the mode's whole promise is the first token now, and a reasoning model
      // spending eight seconds thinking about two sentences breaks exactly
      // that promise. Thinking mode leaves the user's choice alone.
      disableThinking: options.forceDisableThinking ? true : chat.disableThinking,
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

/**
 * Loads the assistant's dependencies while nobody is waiting on them.
 *
 * Both are lazy by design and expensive on first use: a local GGUF model is
 * loaded by the first inference call (tens of seconds for a large one), and
 * the embedding worker is spawned by the first retrieval. Left alone, both
 * bills come due under the meeting's first suggestion or question — the exact
 * moment this feature is supposed to feel instant. A meeting starting is the
 * user declaring they will need the assistant, so the loading happens during
 * the "can everyone hear me" minute instead.
 *
 * Fire-and-forget and quiet on failure: a warmup that cannot run changes
 * nothing — the first real request pays the old price and reports its own
 * errors.
 */
function warmAssistDependencies(): void {
  try {
    const chat = selectResolvedLLMConfig(getSettings(), "chatIntelligence");
    // Only the local runtime needs loading. Cloud providers have no warmup,
    // and a LAN server is someone else's process.
    if ((chat.mode || "local") === "local" && chat.model) {
      const startedAt = Date.now();
      void window.electronAPI
        ?.llamaServerStart?.(chat.model)
        .then((result) => {
          if (result?.success) {
            logger.info(
              "Warmed local assist model at meeting start",
              { model: chat.model, ms: Date.now() - startedAt },
              "meeting"
            );
          }
        })
        .catch(() => {});
    }

    // One tiny search spins up the ONNX worker and the embedding model, so the
    // first Thinking retrieval starts warm. The query text is irrelevant.
    void window.electronAPI?.semanticSearchNotes?.("meeting", 1, null, null).catch(() => {});
  } catch {
    // Warming is an optimization; the assistant works without it.
  }
}

/** Claims per retrieved note. Small: they ride inside an already-budgeted block. */
const ASSIST_NOTE_CLAIMS_LIMIT = 6;

/**
 * The durable-memory slice for a thinking-grade request, and the retrieved
 * notes with their claims attached.
 *
 * All indexed reads — this is the cheap layer, which is why the *thinking*
 * path affords it while the fast path affords nothing. Both directions of the
 * commitment slate are fetched: mid-meeting, "what did they promise us" is
 * worth at least as much as "what do I owe them". Failures degrade to a
 * memory-less request rather than a failed one.
 */
async function retrieveAssistMemory(
  notes: readonly AssistNote[]
): Promise<{ memory: AssistMemoryContext; notes: AssistNote[] }> {
  const api = window.electronAPI;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const [profile, mine, theirs, ...claimRows] = await Promise.all([
      api?.getMemoryProfile?.().catch(() => "") ?? "",
      api?.listOpenMemoryActions?.("user", 40).catch(() => []) ?? [],
      api?.listOpenMemoryActions?.("other", 40).catch(() => []) ?? [],
      ...notes.map((note) => api?.listNoteMemory?.(note.noteId).catch(() => []) ?? []),
    ]);

    return {
      memory: {
        profile: profile || undefined,
        openCommitments: formatOpenCommitments([...mine, ...theirs], today) || undefined,
      },
      notes: notes.map((note, index) => {
        const claims = formatNoteClaims(claimRows[index] ?? [], today, ASSIST_NOTE_CLAIMS_LIMIT);
        return claims ? { ...note, claims } : note;
      }),
    };
  } catch {
    return { memory: {}, notes: [...notes] };
  }
}

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
  /**
   * Ask a question about the meeting. Preempts any suggestion being prepared.
   *
   * `fast` (the default) answers from the live transcript alone; `thinking`
   * first searches the user's past notes and grounds the answer on them.
   */
  ask: (question: string, mode?: AssistMode) => Promise<void>;
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
    async (question: string, mode: AssistMode = "fast") => {
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
      startAnswer(trimmed, mode);

      const now = Date.now();
      const state = useMeetingRecordingStore.getState();
      const segments = selectAssistWindow(readSegments(now), now);
      // The retrieval round trip is the fast mode's entire savings: it runs
      // before the model call, so in fast mode it does not run at all, and the
      // first token is as early as the provider allows. Thinking then adds the
      // cheap layer on top — durable memory, and each note's claims — because
      // a mode already paying for retrieval gets the truth values for free.
      let notes: AssistNote[] = [];
      let memory: AssistMemoryContext | undefined;
      if (mode === "thinking") {
        const retrieved = await retrieveAssistNotes(
          buildAssistRetrievalQuery(segments, trimmed),
          ANSWER_NOTE_LIMIT
        );
        const enriched = await retrieveAssistMemory(retrieved);
        notes = enriched.notes;
        memory = enriched.memory;
      }
      if (!isCurrent()) return;
      updateAnswer({ sources: toRefs(notes) });

      const { systemPrompt, messages } = buildAnswerMessages({
        meetingTitle: state.recordingNoteTitle,
        segments,
        notes,
        memory,
        question: trimmed,
        mode,
      });

      const resolved = resolveAssistModel(systemPrompt, {
        forceDisableThinking: mode === "fast",
      });
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
      const retrieved = await retrieveAssistNotes(
        buildAssistRetrievalQuery(segments),
        ASSIST_NOTE_LIMIT
      );
      // Suggestions are thinking-grade: precomputed while nobody is waiting,
      // so the memory layer is free here — and the prompt already asks for "a
      // commitment from the user's past notes", which is exactly what it adds.
      const { memory, notes } = await retrieveAssistMemory(retrieved);
      if (!stillOurs()) return;

      const { systemPrompt, messages } = buildSuggestionMessages({
        meetingTitle: state.recordingNoteTitle,
        segments,
        notes,
        memory,
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

    // The user just declared they will need the assistant; load its lazy
    // dependencies now rather than under the first question.
    warmAssistDependencies();

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
