import type { ToolCallInfo } from "./types";

export interface NoteCardRef {
  noteId: number;
  title: string;
}

/**
 * Notes a turn's tool calls surfaced — created, updated, fetched, found by
 * search, or listed as meetings.
 *
 * Every tool reports these the same way (`noteRefs` on its result), so this no
 * longer needs to know each tool's data shape. It used to, and read a field
 * nothing ever populated: tool-found notes never appeared under a reply at all.
 *
 * Deliberately uncapped. This feeds two consumers, and they want opposite
 * things: the sources strip wants a handful (and caps them itself, in
 * resolveMessageSources), while citation rendering needs *every* note the model
 * was shown — a cap there silently deletes valid citations, so an answer
 * listing twenty meetings would link the first five and drop the rest.
 *
 * Single pass in call order, deduped across tools.
 */
export function extractNoteCards(
  toolCalls: ToolCallInfo[] | undefined,
  fallbackTitle: string
): NoteCardRef[] {
  if (!toolCalls) return [];
  const cards: NoteCardRef[] = [];
  const seen = new Set<number>();

  for (const tc of toolCalls) {
    if (tc.status !== "completed" || !tc.noteRefs?.length) continue;
    for (const ref of tc.noteRefs) {
      // Cloud hits can carry null or non-numeric (UUID) ids for notes with no
      // local row — nothing to open, and nothing a citation could resolve.
      const noteId = Number(ref?.id);
      if (!Number.isSafeInteger(noteId) || noteId <= 0 || seen.has(noteId)) continue;
      seen.add(noteId);
      const title = typeof ref.title === "string" ? ref.title.trim() : "";
      cards.push({ noteId, title: title || fallbackTitle });
    }
  }
  return cards;
}
