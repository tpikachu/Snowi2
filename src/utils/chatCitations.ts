/**
 * Citations in chat answers.
 *
 * The model is asked to mark claims it took from a note with `[[note:12]]`.
 * This module turns those markers into links the renderer can make clickable,
 * and reports which notes were actually cited so the sources strip can list
 * what the answer used rather than everything retrieval happened to return.
 *
 * Pure and unit-tested: the parsing runs over streaming text, mid-token, and a
 * half-written marker must never render as garbage or vanish a real one.
 */

/** The scheme `MarkdownRenderer` recognises as "a note in this app". */
export const NOTE_LINK_SCHEME = "snowy-note:";

// Deliberately strict: digits only, no whitespace. A loose pattern would eat
// ordinary double-bracket text a user's note might legitimately contain.
const CITATION_PATTERN = /\[\[note:(\d+)\]\]/g;

/**
 * A marker only half-arrived from the stream. Rendering `[[note:1` as text
 * makes the answer flicker with debris on the way to `[[note:12]]`, so the
 * trailing fragment is held back until it completes.
 */
const PARTIAL_TAIL_PATTERN = /\[\[?(?:n(?:o(?:t(?:e(?::\d*)?)?)?)?)?$/;

export interface RenderedCitations {
  /** Content with markers rewritten as links, ready for the markdown renderer. */
  content: string;
  /** Cited note ids, in order of first appearance. */
  citedIds: number[];
}

/**
 * Rewrites `[[note:id]]` markers into `[n](snowy-note:id)` links, numbered by
 * first appearance.
 *
 * `knownIds` is what was actually retrieved this turn. A model that cites a
 * note it was never given is hallucinating a reference, and a link to it would
 * either 404 or — worse — open an unrelated note that happens to hold that id,
 * so unknown markers are dropped rather than rendered.
 */
export function renderCitations(
  content: string,
  knownIds: Iterable<number> = []
): RenderedCitations {
  const known = knownIds instanceof Set ? knownIds : new Set(knownIds);
  const citedIds: number[] = [];

  if (!content) return { content: "", citedIds };

  const rendered = content.replace(CITATION_PATTERN, (_match, rawId: string) => {
    const noteId = Number(rawId);
    if (!Number.isSafeInteger(noteId) || noteId <= 0) return "";
    if (known.size > 0 && !known.has(noteId)) return "";

    let index = citedIds.indexOf(noteId);
    if (index === -1) {
      citedIds.push(noteId);
      index = citedIds.length - 1;
    }
    return `[${index + 1}](${NOTE_LINK_SCHEME}${noteId})`;
  });

  return { content: rendered, citedIds };
}

/**
 * Same rewrite, minus any trailing partial marker — for text still streaming.
 */
export function renderStreamingCitations(
  content: string,
  knownIds: Iterable<number> = []
): RenderedCitations {
  return renderCitations(content.replace(PARTIAL_TAIL_PATTERN, ""), knownIds);
}

/** Extracts the note id from an href the renderer owns, or null. */
export function parseNoteLink(href: string | undefined): number | null {
  if (!href || !href.startsWith(NOTE_LINK_SCHEME)) return null;
  const noteId = Number(href.slice(NOTE_LINK_SCHEME.length));
  return Number.isSafeInteger(noteId) && noteId > 0 ? noteId : null;
}
