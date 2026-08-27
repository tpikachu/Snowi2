import { useCallback } from "react";
import type { ChatPersistence } from "./useChatPersistence";
import type { ChatStreaming } from "./useChatStreaming";
import type { Message } from "./types";
import type { ScreenContextImage } from "../../types/electron";

interface PersistedMessageContext {
  conversationId: number;
  text: string;
  isFirstMessage: boolean;
}

interface UseChatMessageSenderOptions {
  conversationId: number | null;
  persistence: ChatPersistence;
  streaming: Pick<ChatStreaming, "sendToAI">;
  createConversation: (text: string) => Promise<number>;
  onBeforeSend?: () => void;
  onMessagePersisted?: (context: PersistedMessageContext) => void | Promise<void>;
}

export function useChatMessageSender({
  conversationId,
  persistence,
  streaming,
  createConversation,
  onBeforeSend,
  onMessagePersisted,
}: UseChatMessageSenderOptions): (
  text: string,
  options?: { screenContext?: ScreenContextImage }
) => Promise<void> {
  return useCallback(
    async (text: string, options?: { screenContext?: ScreenContextImage }) => {
      onBeforeSend?.();
      const convId = conversationId ?? (await createConversation(text));
      const previousMessages = persistence.messages;
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        isStreaming: false,
      };

      persistence.setMessages((messages) => [...messages, userMessage]);
      await persistence.saveUserMessage(text);
      await onMessagePersisted?.({
        conversationId: convId,
        text,
        isFirstMessage: previousMessages.length === 0,
      });
      // The screenshot rides only the model request — persistence stores the
      // text alone, so it never reaches the database or the history UI.
      await streaming.sendToAI(text, [...previousMessages, userMessage], options);
    },
    [conversationId, createConversation, onBeforeSend, onMessagePersisted, persistence, streaming]
  );
}
