/**
 * What the chat agent gets handed as grounding, and why.
 *
 * Three defects this exists to fix, all of which made the assistant look
 * forgetful or confidently wrong:
 *
 *  1. The retrieval query was the raw user message. "What about the second
 *     one?" was searched literally, which finds nothing about the actual
 *     subject and fills the prompt with noise instead.
 *  2. Grounding was rebuilt from scratch every turn and replaced whatever the
 *     previous turn had. Three turns into a conversation about one meeting,
 *     that meeting could drop out of the results and the model would lose the
 *     notes it had been answering from — with no sign anything had changed.
 *  3. Anything retrieved was injected. Keyword hits enter the ranking with no
 *     threshold, and meeting transcripts are full of ordinary words, so
 *     "thanks" reliably grounded the answer in whichever meetings said thanks.
 *
 * Pure so each decision can be tested without a model, an index, or a window.
 */

export interface RetrievedNote {
  noteId: number;
  title: string;
  snippet?: string;
  /** Best cosine over the note's passages. Absent when it matched by keyword only. */
  semanticScore?: number;
}

/**
 * Cosine below which a hit is not worth putting in front of the model.
 *
 * all-MiniLM-L6-v2 puts genuinely related passages around 0.45–0.7 and
 * unrelated text around 0.05–0.25. The index-wide filter sits at 0.3, which is
 * the right bar for "show this in a search UI" — the user can see the result
 * and judge it. It is the wrong bar for silently injecting text the model will
 * treat as the record of what happened, so this one is stricter.
 */
export const MIN_GROUNDING_SCORE = 0.4;

/** A short message is usually a follow-up that only makes sense with its lead-in. */
const FOLLOW_UP_MAX_WORDS = 8;

/** Kept small: carried context competes with fresh retrieval for the same budget. */
const MAX_CARRIED_NOTES = 4;

/** Total notes in the prompt, fresh plus carried. */
const MAX_GROUNDING_NOTES = 8;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * The text to embed for retrieval.
 *
 * A short message is treated as a continuation and searched together with the
 * previous user turn, because the subject of "what about the second one?" is
 * only present in what came before it. Longer messages stand alone — by then
 * the user has restated enough that adding history only blurs the query.
 */
export function buildRetrievalQuery(currentText: string, previousUserText?: string): string {
  const current = currentText.trim();
  if (!current) return "";
  const previous = previousUserText?.trim();
  if (!previous || wordCount(current) > FOLLOW_UP_MAX_WORDS) return current;
  return `${previous}\n${current}`;
}

/**
 * Drops hits too weak to be worth grounding on.
 *
 * A keyword-only hit carries no score, and on a common word that is exactly
 * the hit that should not be trusted, so it is dropped too — the model can
 * still reach those notes deliberately through `search_notes`.
 */
export function filterGrounding(
  results: RetrievedNote[],
  minScore: number = MIN_GROUNDING_SCORE
): RetrievedNote[] {
  return results.filter((r) => typeof r.semanticScore === "number" && r.semanticScore >= minScore);
}

/**
 * Fresh retrieval on top, notes from earlier turns kept behind it.
 *
 * Carrying earlier notes is what stops the assistant losing the thread when a
 * follow-up happens to retrieve poorly. Bounded on both axes so a long
 * conversation cannot grow its own prompt without limit, and a note that comes
 * back fresh is not listed twice.
 */
export function mergeGrounding(
  fresh: RetrievedNote[],
  carried: RetrievedNote[],
  maxTotal: number = MAX_GROUNDING_NOTES,
  maxCarried: number = MAX_CARRIED_NOTES
): RetrievedNote[] {
  const merged: RetrievedNote[] = [];
  const seen = new Set<number>();

  for (const note of fresh) {
    if (seen.has(note.noteId)) continue;
    seen.add(note.noteId);
    merged.push(note);
    if (merged.length >= maxTotal) return merged;
  }

  let carriedUsed = 0;
  for (const note of carried) {
    if (seen.has(note.noteId) || carriedUsed >= maxCarried) continue;
    seen.add(note.noteId);
    merged.push(note);
    carriedUsed += 1;
    if (merged.length >= maxTotal) break;
  }

  return merged;
}

/** Renders grounding for the system prompt. The id is what citations refer to. */
export function formatGroundingContext(notes: RetrievedNote[]): string {
  return notes
    .map(
      (note) => `<note id="${note.noteId}" title="${note.title}">\n${note.snippet ?? ""}\n</note>`
    )
    .join("\n\n");
}

/** The note a conversation is currently about. */
export interface FocusNote {
  id: number;
  title: string;
}

/**
 * Decides what a bare "this meeting" should refer to after a turn.
 *
 * Only an answer that resolved to exactly one note sets the subject. Two cited
 * notes make "this" genuinely ambiguous, and picking one — the first, the
 * last, the highest scoring — would answer a different question than the user
 * asked without ever saying so. Ambiguity clears the focus instead, which
 * leaves the model to ask.
 *
 * Citing nothing keeps the previous subject: a follow-up like "and who owned
 * it?" is still about the meeting under discussion.
 */
export function resolveFocusNote(
  citedIds: readonly number[],
  titlesById: ReadonlyMap<number, string>,
  previous: FocusNote | undefined
): FocusNote | undefined {
  const unique = [...new Set(citedIds)];
  if (unique.length === 0) return previous;
  if (unique.length > 1) return undefined;

  const id = unique[0];
  const title = titlesById.get(id);
  // A cited note we cannot name is one we cannot describe to the model either.
  return title ? { id, title } : undefined;
}
