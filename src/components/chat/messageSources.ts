import type { MessageSource, ToolCallInfo } from "./types";
import { extractNoteCards } from "./noteCards";

/**
 * What to show under an assistant reply, and how to label it.
 *
 * Two things ground an answer, and they arrive by different routes: notes
 * retrieved before the call (never a tool call, so previously invisible) and
 * notes a tool touched during it. Both are the same thing to a reader.
 *
 * The label matters. Listing every retrieved note as a "source" claims the
 * answer used them, which is not something we know — retrieval returns the
 * nearest eight passages whether or not any of them mattered. So when the
 * model cited its notes we list exactly those and call them sources; when it
 * did not, we list what was available and call them related. A model too small
 * to follow the citation format still gets the user somewhere useful, without
 * the UI overclaiming on its behalf.
 */

/** Beyond this, the strip buries the answer it is supposed to support. */
const MAX_ITEMS = 5;

export interface ResolvedSources {
  items: MessageSource[];
  /** True when the model cited its notes, so `items` is what it actually used. */
  cited: boolean;
}

export function resolveMessageSources(
  sources: MessageSource[] | undefined,
  toolCalls: ToolCallInfo[] | undefined,
  citedIds: number[],
  fallbackTitle: string
): ResolvedSources {
  const byId = new Map<number, MessageSource>();

  for (const source of sources ?? []) {
    if (!byId.has(source.noteId)) byId.set(source.noteId, source);
  }
  // Tool hits second: a note that arrived both ways keeps the retrieved copy,
  // which carries the passage that matched.
  for (const card of extractNoteCards(toolCalls, fallbackTitle)) {
    if (!byId.has(card.noteId)) byId.set(card.noteId, { noteId: card.noteId, title: card.title });
  }

  if (citedIds.length > 0) {
    const cited = citedIds
      .map((id) => byId.get(id))
      .filter((item): item is MessageSource => item != null);
    // Citation numbering in the answer is by first appearance, so the strip is
    // ordered the same way and [1] is the first card.
    if (cited.length > 0) return { items: cited, cited: true };
  }

  return { items: [...byId.values()].slice(0, MAX_ITEMS), cited: false };
}
