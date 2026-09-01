import type { AgentPromptSectionName } from "../config/prompts";

/**
 * What was actually sent to the model on one chat turn, and what came back.
 *
 * The point of this file is attribution. A bad answer has four possible
 * causes — the transcript, the prompt, retrieval, or the model — and without a
 * record of the request they are indistinguishable, so every investigation
 * ends in a guess. The only prompt-adjacent log before this truncated the
 * request body to 200 characters, which is shorter than the system prompt's
 * first paragraph.
 *
 * The record is built from the same section objects the prompt is joined from,
 * never described separately. A summary assembled alongside the real request
 * drifts from it, and a drifted summary is worse than no summary: it makes a
 * wrong prompt look right.
 *
 * Privacy: these hold meeting content — retrieved passages, the user's
 * commitments, their question. They live in a renderer ring buffer and reach
 * disk only when the user has turned debug logging on. Nothing here is
 * persisted by default.
 */

/** How many turns the buffer keeps. Enough to see a conversation go wrong. */
export const MAX_CHAT_TURNS = 20;

export interface PromptSectionRecord {
  name: AgentPromptSectionName;
  chars: number;
  text: string;
}

export interface RetrievedNoteRecord {
  noteId: number;
  title: string;
  /** Cosine score where search reported one; absent for keyword-only hits. */
  score?: number;
  chars: number;
  /** False when the note came from an earlier turn rather than this query. */
  fromThisTurn: boolean;
}

export interface MessageWindowRecord {
  role: string;
  chars: number;
}

export interface ChatTurnTimings {
  /** Semantic + keyword search, before the prompt is assembled. */
  retrievalMs?: number;
  /** Memory profile and open commitments, fetched in parallel with each other. */
  memoryMs?: number;
  /** Request sent to first content chunk — the number a live user feels. */
  firstTokenMs?: number;
  /** Request sent to stream end, tool round-trips included. */
  totalMs?: number;
}

export interface ChatTurnRecord {
  id: string;
  /** Epoch ms. Passed in rather than read here so the builder stays pure. */
  at: number;
  /** Which chat surface: the main view, a note's embedded chat, a container. */
  surface: string;
  question: string;
  /** The retrieval query, which is not the question when it was widened. */
  retrievalQuery: string;
  scope?: { spaceId?: number | null; folderId?: number | null };

  provider: string;
  model: string;
  mode: string;
  /**
   * Which speed served this turn: "thinking" is the full agent, "fast" a
   * single shot on the fast-lane model. Records what actually ran — a fast
   * request that degraded (chat scope unready) is recorded as thinking.
   */
  lane?: "fast" | "thinking";
  /** Set for self-hosted and custom endpoints, so "which server" is answerable. */
  endpoint?: string;

  sections: PromptSectionRecord[];
  systemPromptChars: number;
  messageWindow: MessageWindowRecord[];
  retrieved: RetrievedNoteRecord[];
  /** Hits search returned that grounding filtering dropped, and why it can matter. */
  retrievedDropped: number;
  availableTools: string[];

  toolCalls: { name: string; failed?: boolean }[];
  responseChars: number;
  /** Note ids the answer actually cited, which is narrower than what it was given. */
  citedNoteIds: number[];
  timings: ChatTurnTimings;
  error?: string;
}

/**
 * The provider a turn was sent to, in the terms the privacy question asks:
 * did this leave the machine, and if so where to.
 */
export function isLocalDestination(provider: string, mode: string): boolean {
  return mode === "local" || provider === "local" || provider === "llamacpp";
}

/** Total characters of system prompt plus the message window. */
export function totalRequestChars(record: ChatTurnRecord): number {
  return (
    record.systemPromptChars + record.messageWindow.reduce((sum, entry) => sum + entry.chars, 0)
  );
}

/** Section sizes as a share of the system prompt, largest first. */
export function sectionBreakdown(
  record: ChatTurnRecord
): { name: AgentPromptSectionName; chars: number; share: number }[] {
  const total = record.sections.reduce((sum, section) => sum + section.chars, 0) || 1;
  return [...record.sections]
    .map((section) => ({
      name: section.name,
      chars: section.chars,
      share: section.chars / total,
    }))
    .sort((a, b) => b.chars - a.chars);
}

type Listener = (turns: ChatTurnRecord[]) => void;

let turns: ChatTurnRecord[] = [];
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(turns);
}

/** Newest first, which is the order anyone debugging reads them in. */
export function getChatTurns(): ChatTurnRecord[] {
  return turns;
}

export function recordChatTurn(record: ChatTurnRecord): void {
  turns = [record, ...turns].slice(0, MAX_CHAT_TURNS);
  emit();
}

/**
 * Replaces a turn already in the buffer, for the fields only known at the end
 * — timings, response, tool calls. Recorded up front rather than only on
 * completion so a turn that hangs or throws still shows what it was sent.
 */
export function updateChatTurn(id: string, patch: Partial<ChatTurnRecord>): void {
  let changed = false;
  turns = turns.map((turn) => {
    if (turn.id !== id) return turn;
    changed = true;
    return { ...turn, ...patch, timings: { ...turn.timings, ...patch.timings } };
  });
  if (changed) emit();
}

export function clearChatTurns(): void {
  turns = [];
  emit();
}

export function subscribeChatTurns(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
