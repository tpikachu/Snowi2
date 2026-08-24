/**
 * What each chat surface is allowed to know, in one place.
 *
 * Snowy has several chats — the global chat view, the agent overlay, a chat
 * per space or folder, a chat embedded in a note — and until this existed,
 * what each one pinned into its prompt was decided ad hoc at each mount site.
 * The visible symptom: every surface pinned the same global memory slice, the
 * note chat pinned its entire transcript on every turn, and nothing could say
 * what "scope" meant for a given chat without reading four hooks.
 *
 * The model here is three layers, priced by what they cost:
 *
 *  - the ANCHOR: what this chat is about. Free — the renderer already holds
 *    it — but budgeted, because "free to fetch" is not "free to send".
 *  - MEMORY: the truth layer. Indexed SQLite reads, ~ms, no embeddings — so it
 *    is pinned every turn, scoped to the anchor, never left to retrieval.
 *  - RECALL (notes): the expensive layer — embed, search, fuse. Retrieved on
 *    demand by the caller and deduplicated against the anchor here.
 *
 * The scope rule the contracts encode: the anchor defines the default scope;
 * memory inherits it exactly; recall inherits it but may widen through tools,
 * where widening is a visible call rather than a silent read.
 *
 * The pure parts (contracts, anchor budgeting, dedupe) are unit-tested; the
 * one IPC edge is `fetchPinnedMemory`, kept thin enough to read at a glance.
 */

import { formatNoteClaims, formatOpenCommitments } from "../utils/memoryPrompt";
import type { RetrievedNote } from "../utils/chatRetrieval";
import type { ContainerScope } from "../types/chat";
import type { MemoryObjectRow } from "../types/electron";

export type ChatSurface = "chat-view" | "agent-overlay" | "container-chat" | "note-chat";

/** Which slice of open commitments a surface pins. */
export type CommitmentsSlice = "global" | "container" | "note" | "none";

export interface ChatContextContract {
  /** Durable facts about the user. Tiny and universally relevant: everywhere. */
  profile: boolean;
  /**
   * Which open claims ride along. Global surfaces get the user's whole slate;
   * a container chat gets the claims filed under its notes; a note chat gets
   * the claims extracted from that note instead (see `noteClaims`).
   */
  commitments: CommitmentsSlice;
}

/**
 * The table that answers "what does this chat know". Declarative on purpose:
 * a new surface adds a row, not a branch in a streaming hook.
 */
export const CHAT_CONTEXT_CONTRACTS: Record<ChatSurface, ChatContextContract> = {
  "chat-view": { profile: true, commitments: "global" },
  "agent-overlay": { profile: true, commitments: "global" },
  "container-chat": { profile: true, commitments: "container" },
  "note-chat": { profile: true, commitments: "note" },
};

/** Unknown surfaces read as global chat — the contract that assumes least. */
export function contractFor(surface: string | undefined): ChatContextContract {
  return (
    CHAT_CONTEXT_CONTRACTS[(surface ?? "") as ChatSurface] ?? CHAT_CONTEXT_CONTRACTS["chat-view"]
  );
}

// ---------------------------------------------------------------------------
// The note anchor
// ---------------------------------------------------------------------------

export interface NoteAnchor {
  noteId: number;
  folderId: number | null;
  title: string;
  content: string;
  transcript?: string | null;
}

/**
 * How much of the anchored note is pinned verbatim.
 *
 * The write-up gets the bigger budget: it is the distilled document and the
 * thing the user is looking at. The transcript gets a tail, not the whole:
 * a 90-minute meeting's transcript used to be re-sent on every turn of its
 * note's chat — while the same text was also indexed for retrieval, so the
 * prompt paid twice for one document. Beyond the tail, the transcript is
 * reachable the same way it is from every other chat: passage retrieval.
 */
export const NOTE_ANCHOR_CONTENT_MAX = 8_000;
export const NOTE_ANCHOR_TRANSCRIPT_MAX = 2_500;

export interface BuiltNoteAnchor {
  text: string;
  /** True when any part of the note fell outside the budgets. */
  truncated: boolean;
}

export function buildNoteAnchorText(anchor: NoteAnchor): BuiltNoteAnchor {
  const content = anchor.content ?? "";
  const transcript = (anchor.transcript ?? "").trim();

  const contentTruncated = content.length > NOTE_ANCHOR_CONTENT_MAX;
  const transcriptTruncated = transcript.length > NOTE_ANCHOR_TRANSCRIPT_MAX;

  const parts = [
    `Note ID: ${anchor.noteId}`,
    anchor.folderId != null ? `Folder ID: ${anchor.folderId}` : "",
    `Title: ${anchor.title}`,
    `Content:\n${contentTruncated ? content.slice(0, NOTE_ANCHOR_CONTENT_MAX) : content}`,
  ];
  if (contentTruncated) {
    parts.push("(Content truncated. Use get_note for the full note.)");
  }

  if (transcript) {
    // The tail rather than the head: the write-up above already covers the
    // meeting's shape, so the verbatim slice goes to the most recent exchange
    // — the part a follow-up question is most likely to quote.
    const shown = transcriptTruncated
      ? transcript.slice(transcript.length - NOTE_ANCHOR_TRANSCRIPT_MAX)
      : transcript;
    parts.push(
      transcriptTruncated
        ? `Transcript (final part only — search_notes finds earlier passages):\n${shown}`
        : `Transcript:\n${shown}`
    );
  }

  return {
    text: parts.filter(Boolean).join("\n"),
    truncated: contentTruncated || transcriptTruncated,
  };
}

/**
 * Drops retrieved hits that only repeat the anchor.
 *
 * When the anchored note is pinned whole, a retrieved passage from it is pure
 * duplication. When the anchor was truncated, the same passage is the only way
 * the missing parts reach the prompt — so it stays.
 */
export function dedupeAgainstAnchor(
  notes: readonly RetrievedNote[],
  anchorNoteId: number | null | undefined,
  anchorTruncated: boolean
): RetrievedNote[] {
  if (anchorNoteId == null || anchorTruncated) return [...notes];
  return notes.filter((note) => note.noteId !== anchorNoteId);
}

// ---------------------------------------------------------------------------
// Pinned memory — the one IPC edge
// ---------------------------------------------------------------------------

/** The actionable types, as search_memory's ACTIONABLE_TYPES groups them. */
const OPEN_COMMITMENT_TYPES = ["action_item", "commitment", "deadline"];

/** Rows fetched before the formatter's own cap decides what is shown. */
const OPEN_COMMITMENTS_FETCH_LIMIT = 40;

export interface PinnedMemory {
  profile: string;
  openCommitments: string;
  noteClaims: string;
}

export interface FetchPinnedMemoryOptions {
  surface: string | undefined;
  scope?: ContainerScope;
  anchorNoteId?: number | null;
  /** ISO date (YYYY-MM-DD); passed in so the formatting stays deterministic. */
  today: string;
}

/**
 * The memory slices a surface pins, fetched per turn.
 *
 * Per turn rather than cached because a meeting that just ended adds to every
 * one of these, and each is an indexed read over a capped row set. Failures
 * degrade to empty sections: chat without memory is chat, not an error.
 */
export async function fetchPinnedMemory(options: FetchPinnedMemoryOptions): Promise<PinnedMemory> {
  const contract = contractFor(options.surface);
  const api = typeof window !== "undefined" ? window.electronAPI : undefined;

  const profilePromise: Promise<string> = contract.profile
    ? (api?.getMemoryProfile?.().catch(() => "") ?? Promise.resolve(""))
    : Promise.resolve("");

  let commitmentsPromise: Promise<MemoryObjectRow[]> = Promise.resolve([]);
  if (contract.commitments === "global") {
    // Both sides of the table: what the user owes, and what others promised
    // them. The second half sat unread in the same store — "what is Acme
    // supposed to send us?" had the data and no path into a prompt. The
    // formatter prefixes the owner on non-user rows, so the two read apart.
    commitmentsPromise = Promise.all([
      api?.listOpenMemoryActions?.("user", OPEN_COMMITMENTS_FETCH_LIMIT).catch(() => []) ??
        Promise.resolve([]),
      api?.listOpenMemoryActions?.("other", OPEN_COMMITMENTS_FETCH_LIMIT).catch(() => []) ??
        Promise.resolve([]),
    ]).then(([mine, theirs]) => [...mine, ...theirs]);
  } else if (contract.commitments === "container" && options.scope) {
    commitmentsPromise =
      api
        ?.searchMemory?.({
          types: OPEN_COMMITMENT_TYPES,
          status: "open",
          spaceId: options.scope.spaceId,
          folderId: options.scope.folderId,
          limit: OPEN_COMMITMENTS_FETCH_LIMIT,
        })
        .then((result) => result?.objects ?? [])
        .catch(() => []) ?? Promise.resolve([]);
  }

  const noteClaimsPromise: Promise<MemoryObjectRow[]> =
    contract.commitments === "note" && options.anchorNoteId != null
      ? (api?.listNoteMemory?.(options.anchorNoteId).catch(() => []) ?? Promise.resolve([]))
      : Promise.resolve([]);

  const [profile, commitmentRows, noteClaimRows] = await Promise.all([
    profilePromise,
    commitmentsPromise,
    noteClaimsPromise,
  ]);

  return {
    profile: profile || "",
    openCommitments: formatOpenCommitments(commitmentRows, options.today),
    noteClaims: formatNoteClaims(noteClaimRows, options.today),
  };
}
