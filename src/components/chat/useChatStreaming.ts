import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import ReasoningService, { type AgentStreamChunk } from "../../services/ReasoningService";
import { isEnterpriseProvider } from "../../models/ModelRegistry";
import { getSettings, selectResolvedLLMConfig } from "../../stores/settingsStore";
import { getAgentPromptSections, renderAgentPromptSections } from "../../config/prompts";
import {
  buildNoteAnchorText,
  dedupeAgainstAnchor,
  fetchPinnedMemory,
  type NoteAnchor,
} from "../../services/chatContext";
import { createToolRegistry } from "../../services/tools";
import type { ToolRegistry } from "../../services/tools/ToolRegistry";
import type { Message, AgentState, ToolCallInfo } from "./types";
import type { ContainerScope } from "../../types/chat";
import {
  buildRetrievalQuery,
  filterGrounding,
  formatGroundingContext,
  mergeGrounding,
  resolveFocusNote,
  type RetrievedNote,
} from "../../utils/chatRetrieval";
import { renderCitations } from "../../utils/chatCitations";
import { recordChatTurn, updateChatTurn, type ChatTurnRecord } from "../../utils/chatTurnRecord";
import logger from "../../utils/logger";

// Raised from 5 now that a hit returns the passage that matched rather than
// the note's opening paragraph — the context is both smaller per note and
// actually about the question, so more of it fits usefully.
const RAG_NOTE_LIMIT = 8;
// Only used for notes indexed before passage search existed, or when a hit
// came from keyword search and carries no passage of its own.
const RAG_NOTE_SNIPPET_LENGTH = 1200;

const LOCAL_TOOL_MIN_PARAMS_B = 4;

function estimateModelSizeB(modelId: string): number {
  const match = modelId.match(/-([\d.]+)[bB]/);
  return match ? parseFloat(match[1]) : 0;
}

/**
 * Retrieval for one turn, already filtered — not yet merged with earlier turns.
 *
 * `dropped` is reported alongside the kept notes because it is the number that
 * explains a thin answer: search found matches and the grounding filter
 * rejected them, which looks identical from outside to search finding nothing.
 */
async function retrieveNotes(
  queryText: string,
  scope?: ContainerScope
): Promise<{ notes: RetrievedNote[]; dropped: number }> {
  if (!queryText || !window.electronAPI?.semanticSearchNotes) return { notes: [], dropped: 0 };
  try {
    const results = await window.electronAPI.semanticSearchNotes(
      queryText,
      RAG_NOTE_LIMIT,
      scope?.spaceId ?? null,
      scope?.folderId ?? null
    );
    if (!results || results.length === 0) return { notes: [], dropped: 0 };

    const retrieved = await Promise.all(
      results.map(
        async (r: {
          id: number;
          title: string;
          matched_snippet?: string;
          semantic_score?: number;
        }): Promise<RetrievedNote | null> => {
          // The passage that matched, when search could say which. Falling
          // back to the note's first N characters is what made long meetings
          // useless as context: the vector matched something on page 3 and the
          // model was handed page 1.
          if (r.matched_snippet?.trim()) {
            return {
              noteId: r.id,
              title: r.title,
              snippet: r.matched_snippet.trim(),
              semanticScore: r.semantic_score,
            };
          }
          const note = await window.electronAPI.getNote(r.id);
          if (!note) return null;
          return {
            noteId: note.id,
            title: note.title,
            snippet: (note.enhanced_content || note.content || note.transcript || "").slice(
              0,
              RAG_NOTE_SNIPPET_LENGTH
            ),
            semanticScore: r.semantic_score,
          };
        }
      )
    );

    const found = retrieved.filter((note): note is RetrievedNote => note != null);
    const kept = filterGrounding(found);
    return { notes: kept, dropped: found.length - kept.length };
  } catch {
    return { notes: [], dropped: 0 };
  }
}

interface UseChatStreamingOptions {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  /** Optional pinned context string (the container overview's summary). */
  noteContext?: string;
  /**
   * The note this chat is embedded in. Structured rather than pre-rendered so
   * the anchor can be budgeted here (a transcript is pinned as a tail, not
   * whole) and so retrieval and memory can be scoped to the note's id.
   */
  noteAnchor?: NoteAnchor;
  /** Optional container scope applied to RAG and the search_notes tool (container overview chat). */
  searchScope?: ContainerScope;
  /**
   * Which chat this is, for the prompt inspector. Four surfaces share this
   * hook and they send materially different context — a record that cannot say
   * which one it came from is not much use for attributing a bad answer.
   */
  surface?: string;
  onStreamComplete?: (
    assistantId: string,
    content: string,
    toolCalls?: ToolCallInfo[],
    sources?: RetrievedNote[]
  ) => void;
}

export interface ChatStreaming {
  agentState: AgentState;
  toolStatus: string;
  activeToolName: string;
  sendToAI: (userText: string, allMessages: Message[]) => Promise<void>;
  cancelStream: () => void;
}

export function useChatStreaming({
  messages,
  setMessages,
  noteContext: externalNoteContext,
  noteAnchor,
  searchScope,
  surface = "chat",
  onStreamComplete,
}: UseChatStreamingOptions): ChatStreaming {
  const { t } = useTranslation();
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [toolStatus, setToolStatus] = useState("");
  const [activeToolName, setActiveToolName] = useState("");
  const mountedRef = useRef(true);
  const messagesRef = useRef<Message[]>([]);
  const noteContextRef = useRef(externalNoteContext);
  noteContextRef.current = externalNoteContext;
  const noteAnchorRef = useRef(noteAnchor);
  noteAnchorRef.current = noteAnchor;
  // Grounding from earlier turns of this conversation. Without it, a follow-up
  // that retrieves poorly silently drops the notes the answer had been built
  // on, and the assistant reads as having forgotten the last two exchanges.
  const carriedGroundingRef = useRef<RetrievedNote[]>([]);
  // The note this conversation is currently about, so a follow-up can say
  // "this meeting" and mean something. Set only when a turn resolves to exactly
  // one note — see resolveFocusNote.
  const focusNoteRef = useRef<{ id: number; title: string } | undefined>(undefined);
  const searchScopeRef = useRef(searchScope);
  searchScopeRef.current = searchScope;
  const surfaceRef = useRef(surface);
  surfaceRef.current = surface;
  const toolRegistryRef = useRef<{ key: string; registry: ToolRegistry } | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Carried grounding belongs to one conversation. Switching to another (the
  // whole list is replaced, so the first message's identity changes) or
  // starting a new one must drop it, or the assistant answers about the
  // meeting discussed in the conversation before this one.
  const firstMessageIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const firstId = messages[0]?.id;
    if (firstId !== firstMessageIdRef.current) {
      firstMessageIdRef.current = firstId;
      carriedGroundingRef.current = [];
      // Same reason: a new conversation is not about the last one's meeting.
      focusNoteRef.current = undefined;
    }
  }, [messages]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      ReasoningService.cancelActiveStream();
    };
  }, []);

  const cancelStream = useCallback(() => {
    ReasoningService.cancelActiveStream();
    setAgentState("idle");
    setToolStatus("");
    setActiveToolName("");
  }, []);

  const sendToAI = useCallback(
    async (userText: string, allMessages: Message[]) => {
      const settings = getSettings();
      const chatConfig = selectResolvedLLMConfig(settings, "chatIntelligence");
      const chatAgentMode = chatConfig.mode || "local";

      // An unconfigured scope used to stream zero chunks and leave an empty
      // assistant bubble with no explanation. Fail loudly instead.
      if (!chatConfig.model) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: t("agentMode.chat.noModelConfigured"),
            isStreaming: false,
          },
        ]);
        setAgentState("idle");
        return;
      }

      setAgentState("thinking");
      const isLanAgent = chatAgentMode === "self-hosted" && !!chatConfig.remoteUrl;
      const isCustomAgent = chatAgentMode === "providers" && chatConfig.provider === "custom";
      const isLocalProvider =
        !isEnterpriseProvider(chatConfig.provider) &&
        ![
          "openai",
          "groq",
          "custom",
          "anthropic",
          "gemini",
          "tinfoil",
          "openrouter",
          "corti",
        ].includes(chatConfig.provider);
      const localModelCanUseTool =
        isLocalProvider && estimateModelSizeB(chatConfig.model) >= LOCAL_TOOL_MIN_PARAMS_B;
      const supportsTools = !isLocalProvider || localModelCanUseTool;

      const scope = searchScopeRef.current;
      let registry: ToolRegistry | null = null;
      if (supportsTools) {
        const scopeKey = scope ? `${scope.spaceId}:${scope.folderId ?? ""}` : "";
        // The calendar tool reads the shared provider-deduped events table,
        // so any connected provider enables it.
        const calendarConnected =
          settings.gcalConnected || settings.mcalConnected || settings.appleCalendarConnected;
        const cacheKey = `${calendarConnected}-${scopeKey}`;
        if (toolRegistryRef.current?.key === cacheKey) {
          registry = toolRegistryRef.current.registry;
        } else {
          registry = createToolRegistry({
            calendarConnected,
            searchScope: scope,
          });
          toolRegistryRef.current = { key: cacheKey, registry };
        }
      }

      // A short message is searched together with the previous user turn: the
      // subject of "what about the second one?" only exists in what came before.
      const previousUserText = [...allMessages]
        .reverse()
        .find((m) => m.role === "user" && m.content !== userText)?.content;
      const retrievalQuery = buildRetrievalQuery(userText, previousUserText);

      // The anchor is budgeted here, not at the mount site: a note's transcript
      // is pinned as a tail rather than whole, with the rest reachable through
      // the same passage retrieval every other chat uses.
      const anchor = noteAnchorRef.current;
      const builtAnchor = anchor ? buildNoteAnchorText(anchor) : null;
      const anchorText = builtAnchor?.text ?? noteContextRef.current;

      const retrievalStart = performance.now();
      const fresh = await retrieveNotes(retrievalQuery, scope);
      const retrievalMs = Math.round(performance.now() - retrievalStart);
      // A hit on the anchored note is duplication while the anchor is whole,
      // and the missing pages when it is not.
      const freshNotes = dedupeAgainstAnchor(
        fresh.notes,
        anchor?.noteId,
        builtAnchor?.truncated ?? false
      );
      const freshIds = new Set(freshNotes.map((note) => note.noteId));
      const grounding = mergeGrounding(freshNotes, carriedGroundingRef.current);
      carriedGroundingRef.current = grounding;

      const combinedContext = [anchorText, formatGroundingContext(grounding)]
        .filter(Boolean)
        .join("\n\n");
      // The memory slices this surface pins, per its contract (chatContext.ts).
      // Fetched per turn rather than cached: a meeting that just ended can add
      // to every one of them, and each is an indexed read over a capped set.
      const memoryStart = performance.now();
      const today = new Date().toISOString().slice(0, 10);
      const pinnedMemory = await fetchPinnedMemory({
        surface: surfaceRef.current,
        scope,
        anchorNoteId: anchor?.noteId,
        today,
      });
      const memoryMs = Math.round(performance.now() - memoryStart);
      const availableTools = registry?.getAll().map((t) => t.name) ?? [];
      // Sections first, prompt second. The record is built from these same
      // objects, so it cannot describe a prompt other than the one sent.
      const sections = getAgentPromptSections({
        availableTools,
        noteContext: combinedContext || undefined,
        memoryProfile: pinnedMemory.profile || undefined,
        openCommitments: pinnedMemory.openCommitments || undefined,
        noteClaims: pinnedMemory.noteClaims || undefined,
        focusNote: focusNoteRef.current,
      });
      const systemPrompt = renderAgentPromptSections(sections);

      const llmMessages = [
        { role: "system", content: systemPrompt },
        ...allMessages.slice(-20).map((m) => ({ role: m.role, content: m.content })),
      ];

      const turnId = crypto.randomUUID();
      const turn: ChatTurnRecord = {
        id: turnId,
        at: Date.now(),
        surface: surfaceRef.current,
        question: userText,
        retrievalQuery,
        scope: scope ? { spaceId: scope.spaceId, folderId: scope.folderId } : undefined,
        provider: chatConfig.provider,
        model: chatConfig.model,
        mode: chatAgentMode,
        endpoint: isLanAgent
          ? chatConfig.remoteUrl
          : isCustomAgent
            ? chatConfig.cloudBaseUrl || undefined
            : undefined,
        sections: sections.map((section) => ({
          name: section.name,
          chars: section.text.length,
          text: section.text,
        })),
        systemPromptChars: systemPrompt.length,
        messageWindow: llmMessages.slice(1).map((m) => ({ role: m.role, chars: m.content.length })),
        retrieved: grounding.map((note) => ({
          noteId: note.noteId,
          title: note.title,
          score: note.semanticScore,
          chars: note.snippet.length,
          fromThisTurn: freshIds.has(note.noteId),
        })),
        retrievedDropped: fresh.dropped,
        availableTools,
        toolCalls: [],
        responseChars: 0,
        citedNoteIds: [],
        timings: { retrievalMs, memoryMs },
      };
      // Recorded before the request, not after it: a turn that hangs or throws
      // is exactly the one worth inspecting, and a record written only on
      // success would have nothing to show for it.
      recordChatTurn(turn);
      // Gated on the log level, so the full prompt reaches disk only when the
      // user has turned debug logging on.
      logger.logReasoning("CHAT_TURN_REQUEST", turn);

      const assistantId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          isStreaming: true,
          // Attached up front, not on completion: citations render while the
          // answer streams, and a citation can only resolve against sources
          // the message already carries.
          ...(grounding.length ? { sources: grounding } : {}),
        },
      ]);
      setAgentState("streaming");

      // Declared outside the try so the catch can time a failed request too:
      // how long a turn took before it fell over is the useful part of it.
      const requestStart = performance.now();
      let firstTokenMs: number | undefined;

      try {
        let fullContent = "";

        const aiTools = registry?.toAISDKFormat();
        const stream: AsyncGenerator<AgentStreamChunk> = ReasoningService.processTextStreamingAI(
          llmMessages,
          chatConfig.model,
          chatConfig.provider,
          {
            systemPrompt,
            inferenceScope: "chatIntelligence",
            lanUrl: isLanAgent ? chatConfig.remoteUrl : undefined,
            baseUrl: isCustomAgent ? chatConfig.cloudBaseUrl || undefined : undefined,
            customApiKey:
              isCustomAgent || isLanAgent ? chatConfig.customApiKey || undefined : undefined,
            disableThinking: chatConfig.disableThinking,
          },
          aiTools
        );

        for await (const chunk of stream) {
          if (!mountedRef.current) {
            ReasoningService.cancelActiveStream();
            break;
          }
          if (chunk.type === "content") {
            // First content chunk, not stream end: this is the number a user
            // waiting on an answer actually feels, and the one a "useful live"
            // target has to be set against.
            if (firstTokenMs === undefined) {
              firstTokenMs = Math.round(performance.now() - requestStart);
              updateChatTurn(turnId, { timings: { firstTokenMs } });
            }
            fullContent += chunk.text;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: fullContent } : m))
            );
          } else if (chunk.type === "tool_calls") {
            for (const call of chunk.calls) {
              setAgentState("tool-executing");
              setActiveToolName(call.name);
              setToolStatus(
                t(`agentMode.tools.${call.name}Status`, { defaultValue: `Using ${call.name}...` })
              );
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        toolCalls: [
                          ...(m.toolCalls || []),
                          {
                            id: call.id,
                            name: call.name,
                            arguments: call.arguments,
                            status: "executing" as const,
                          },
                        ],
                      }
                    : m
                )
              );
            }
          } else if (chunk.type === "tool_result") {
            const toolNoteRefs = registry?.takeNoteRefs(chunk.callId);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId && m.toolCalls
                  ? {
                      ...m,
                      toolCalls: m.toolCalls.map((tc) =>
                        tc.id === chunk.callId
                          ? {
                              ...tc,
                              status: chunk.failed ? ("error" as const) : ("completed" as const),
                              result: chunk.displayText,
                              // Collected from the registry rather than the
                              // stream: the tool's return value is what the
                              // model reads, so the UI's copy travels beside it.
                              ...(toolNoteRefs ? { noteRefs: toolNoteRefs } : {}),
                            }
                          : tc
                      ),
                    }
                  : m
              )
            );
            setAgentState("streaming");
            setToolStatus("");
            setActiveToolName("");
          }
        }

        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m))
        );

        const finalMsg = messagesRef.current.find((m) => m.id === assistantId);

        // What the answer actually settled on, taken from its citations rather
        // than from everything retrieval offered — the model listing eight
        // notes and citing one has told us which one the conversation is about.
        const titlesById = new Map<number, string>(grounding.map((n) => [n.noteId, n.title]));
        for (const call of finalMsg?.toolCalls ?? []) {
          for (const ref of call.noteRefs ?? []) {
            if (!titlesById.has(ref.id)) titlesById.set(ref.id, ref.title);
          }
        }
        const { citedIds } = renderCitations(fullContent, titlesById.keys());
        focusNoteRef.current = resolveFocusNote(citedIds, titlesById, focusNoteRef.current);

        const outcome = {
          toolCalls: (finalMsg?.toolCalls ?? []).map((call) => ({
            name: call.name,
            failed: call.status === "error",
          })),
          responseChars: fullContent.length,
          // What the answer stood on, which is narrower than what it was given
          // — the gap between retrieved and cited is the retrieval signal.
          citedNoteIds: [...citedIds],
          timings: { firstTokenMs, totalMs: Math.round(performance.now() - requestStart) },
        };
        updateChatTurn(turnId, outcome);
        logger.logReasoning("CHAT_TURN_RESPONSE", { id: turnId, ...outcome });

        onStreamComplete?.(assistantId, fullContent, finalMsg?.toolCalls, grounding);
      } catch (error) {
        updateChatTurn(turnId, {
          error: (error as Error).message,
          responseChars: 0,
          timings: { totalMs: Math.round(performance.now() - requestStart) },
        });
        logger.logReasoning("CHAT_TURN_ERROR", {
          id: turnId,
          error: (error as Error).message,
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `${t("agentMode.chat.errorPrefix")}: ${(error as Error).message}`,
                  isStreaming: false,
                }
              : m
          )
        );
      }

      setAgentState("idle");
      setToolStatus("");
      setActiveToolName("");
    },
    [t, setMessages, onStreamComplete]
  );

  return {
    agentState,
    toolStatus,
    activeToolName,
    sendToAI,
    cancelStream,
  };
}
