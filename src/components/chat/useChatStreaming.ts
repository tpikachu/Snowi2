import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import ReasoningService, { type AgentStreamChunk } from "../../services/ReasoningService";
import { isEnterpriseProvider } from "../../models/ModelRegistry";
import { getSettings, selectResolvedLLMConfig } from "../../stores/settingsStore";
import { getAgentSystemPrompt } from "../../config/prompts";
import { createToolRegistry } from "../../services/tools";
import type { ToolRegistry } from "../../services/tools/ToolRegistry";
import type { Message, AgentState, ToolCallInfo } from "./types";
import type { ContainerScope } from "../../types/chat";
import {
  buildRetrievalQuery,
  filterGrounding,
  formatGroundingContext,
  mergeGrounding,
  type RetrievedNote,
} from "../../utils/chatRetrieval";

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

/** Retrieval for one turn, already filtered — not yet merged with earlier turns. */
async function retrieveNotes(queryText: string, scope?: ContainerScope): Promise<RetrievedNote[]> {
  if (!queryText || !window.electronAPI?.semanticSearchNotes) return [];
  try {
    const results = await window.electronAPI.semanticSearchNotes(
      queryText,
      RAG_NOTE_LIMIT,
      scope?.spaceId ?? null,
      scope?.folderId ?? null
    );
    if (!results || results.length === 0) return [];

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

    return filterGrounding(retrieved.filter((note): note is RetrievedNote => note != null));
  } catch {
    return [];
  }
}

interface UseChatStreamingOptions {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  /** Optional note context to prepend to the system prompt (used by embedded note chat). */
  noteContext?: string;
  /** Optional container scope applied to RAG and the search_notes tool (container overview chat). */
  searchScope?: ContainerScope;
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
  searchScope,
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
  // Grounding from earlier turns of this conversation. Without it, a follow-up
  // that retrieves poorly silently drops the notes the answer had been built
  // on, and the assistant reads as having forgotten the last two exchanges.
  const carriedGroundingRef = useRef<RetrievedNote[]>([]);
  const searchScopeRef = useRef(searchScope);
  searchScopeRef.current = searchScope;
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
      const fresh = await retrieveNotes(buildRetrievalQuery(userText, previousUserText), scope);
      const grounding = mergeGrounding(fresh, carriedGroundingRef.current);
      carriedGroundingRef.current = grounding;

      const combinedContext = [noteContextRef.current, formatGroundingContext(grounding)]
        .filter(Boolean)
        .join("\n\n");
      // Fetched per turn rather than cached: a meeting that just ended can add
      // to it, and it is one indexed read over a capped row set.
      const memoryProfile = await window.electronAPI?.getMemoryProfile?.().catch(() => "");
      const systemPrompt = getAgentSystemPrompt(
        registry?.getAll().map((t) => t.name),
        combinedContext || undefined,
        memoryProfile || undefined
      );

      const llmMessages = [
        { role: "system", content: systemPrompt },
        ...allMessages.slice(-20).map((m) => ({ role: m.role, content: m.content })),
      ];

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
                              ...(chunk.metadata ? { metadata: chunk.metadata } : {}),
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
        onStreamComplete?.(assistantId, fullContent, finalMsg?.toolCalls, grounding);
      } catch (error) {
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
