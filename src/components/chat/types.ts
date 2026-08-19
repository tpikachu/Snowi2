export interface ToolCallInfo {
  id: string;
  name: string;
  arguments: string;
  status: "executing" | "completed" | "error";
  result?: string;
  // Single object for note tools; search_notes attaches its result array.
  metadata?: Record<string, unknown> | Array<Record<string, unknown>>;
}

/**
 * A note the answer was grounded on.
 *
 * Retrieval happens before the model is called and leaves no tool call behind,
 * so without carrying this on the message there is no record of *why* the
 * assistant knew something — the note cards under a reply only ever showed
 * notes a tool touched.
 */
export interface MessageSource {
  noteId: number;
  title: string;
  /** The passage retrieval matched, when it could say which. */
  snippet?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  isStreaming: boolean;
  toolCalls?: ToolCallInfo[];
  /** Notes retrieved as context for this turn. Assistant messages only. */
  sources?: MessageSource[];
}

export type AgentState =
  "idle" | "listening" | "transcribing" | "thinking" | "streaming" | "tool-executing";

export { toolIcons } from "./toolIcons";
