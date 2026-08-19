import { useState, useRef, useCallback, useEffect } from "react";
import type { Message, MessageSource, ToolCallInfo } from "./types";
import type { ContainerScope } from "../../types/chat";

interface UseChatPersistenceOptions {
  conversationId?: number | null;
  onConversationCreated?: (id: number, title: string) => void;
}

export interface ChatPersistence {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  conversationId: number | null;
  createConversation: (
    title: string,
    noteId?: number | null,
    scope?: ContainerScope
  ) => Promise<number>;
  loadConversation: (id: number) => Promise<void>;
  saveUserMessage: (text: string) => Promise<void>;
  saveAssistantMessage: (
    content: string,
    toolCalls?: ToolCallInfo[],
    sources?: MessageSource[]
  ) => Promise<void>;
  handleNewChat: () => void;
}

export function useChatPersistence(options: UseChatPersistenceOptions = {}): ChatPersistence {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(
    options.conversationId ?? null
  );
  const conversationIdRef = useRef(conversationId);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  const createConversation = useCallback(
    async (title: string, noteId?: number | null, scope?: ContainerScope): Promise<number> => {
      const conv = await window.electronAPI?.createAgentConversation?.(
        title,
        noteId ?? undefined,
        scope?.spaceId,
        scope?.folderId ?? undefined
      );
      if (!conv) {
        throw new Error("Conversation scope is no longer available");
      }
      const id = conv.id;
      conversationIdRef.current = id;
      setConversationId(id);
      options.onConversationCreated?.(id, title);
      return id;
    },
    [options]
  );

  const loadConversation = useCallback(async (id: number) => {
    const conv = await window.electronAPI?.getAgentConversation?.(id);
    if (!conv) return;
    conversationIdRef.current = id;
    setConversationId(id);
    const loaded: Message[] = conv.messages.map((m) => {
      const parsed = m.metadata ? tryParseMetadata(m.metadata) : undefined;
      const toolCalls = parsed?.toolCalls as ToolCallInfo[] | undefined;
      const sources = parsed?.sources as MessageSource[] | undefined;
      return {
        id: crypto.randomUUID(),
        role: m.role as Message["role"],
        content: m.content,
        isStreaming: false,
        ...(toolCalls ? { toolCalls } : {}),
        ...(sources ? { sources } : {}),
      };
    });
    setMessages(loaded);
  }, []);

  const saveUserMessage = useCallback(async (text: string) => {
    if (conversationIdRef.current) {
      window.electronAPI?.addAgentMessage?.(conversationIdRef.current, "user", text);
    }
  }, []);

  const saveAssistantMessage = useCallback(
    async (content: string, toolCalls?: ToolCallInfo[], sources?: MessageSource[]) => {
      if (!conversationIdRef.current) return;
      const metadata = {
        ...(toolCalls?.length ? { toolCalls } : {}),
        // Without this a reopened conversation loses every citation link: the
        // markers stay in the text but have nothing to resolve against.
        ...(sources?.length ? { sources } : {}),
      };
      window.electronAPI?.addAgentMessage?.(
        conversationIdRef.current,
        "assistant",
        content,
        Object.keys(metadata).length ? metadata : undefined
      );
    },
    []
  );

  const handleNewChat = useCallback(() => {
    setMessages([]);
    conversationIdRef.current = null;
    setConversationId(null);
  }, []);

  return {
    messages,
    setMessages,
    conversationId,
    createConversation,
    loadConversation,
    saveUserMessage,
    saveAssistantMessage,
    handleNewChat,
  };
}

function tryParseMetadata(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
