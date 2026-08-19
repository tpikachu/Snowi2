/**
 * Splits a note into overlapping passages for semantic indexing.
 *
 * Notes used to be embedded as one vector over the first 1500 characters of
 * title + body, which meant an hour-long meeting was represented by its
 * opening minute and the rest was invisible to search. It also meant a hit
 * could only ever point at a note, never at the part of it that matched.
 *
 * Chunking fixes both: every passage gets its own vector, and the passage
 * itself is what comes back.
 */

// Sized against the embedding model's context (all-MiniLM-L6-v2 truncates at
// 256 word-pieces, roughly 1000 characters of English). Larger chunks would be
// silently cut off, so the tail of each one would never reach the vector.
const CHUNK_CHARS = 900;
// Enough that a sentence spanning a boundary still lands whole in one chunk.
const CHUNK_OVERLAP_CHARS = 150;
// Bounds the index for a very long meeting. The point-id scheme also depends
// on this staying below 1000.
const MAX_CHUNKS_PER_NOTE = 400;
// Below this, a trailing fragment carries no retrievable meaning of its own.
const MIN_TAIL_CHARS = 40;

/** Strips the HTML the editor stores so tags do not consume the chunk budget. */
function toPlainText(value) {
  if (typeof value !== "string" || !value) return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The searchable body of a note.
 *
 * The transcript is included — it was previously indexed nowhere, so the
 * substance of every meeting was unreachable by meaning. Generated notes come
 * first because they are the distilled version; the transcript backs them up
 * with the detail and the exact wording.
 */
function buildNoteDocument({ content, enhancedContent, transcript } = {}) {
  return [toPlainText(enhancedContent), toPlainText(content), toPlainText(transcript)]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Overlapping windows over the note's body, each prefixed with the title.
 *
 * The title rides on every chunk because a passage lifted out of the middle of
 * a meeting otherwise arrives with no indication of what meeting it is from —
 * for both the embedding and the model that reads the result.
 */
function chunkNote({ title, content, enhancedContent, transcript } = {}) {
  const heading = toPlainText(title);
  const body = buildNoteDocument({ content, enhancedContent, transcript });

  if (!body) {
    // A note with only a title is still worth finding by that title.
    return heading ? [{ chunkIndex: 0, text: heading }] : [];
  }

  const chunks = [];
  const stride = CHUNK_CHARS - CHUNK_OVERLAP_CHARS;

  for (let start = 0; start < body.length; start += stride) {
    if (chunks.length >= MAX_CHUNKS_PER_NOTE) break;

    const slice = body.slice(start, start + CHUNK_CHARS);
    // The last window is often a sliver already covered by the overlap of the
    // one before it; indexing it adds a near-duplicate that competes in the
    // ranking without adding meaning.
    if (start > 0 && slice.length < MIN_TAIL_CHARS) break;

    chunks.push({
      chunkIndex: chunks.length,
      text: heading ? `${heading}\n${slice}` : slice,
    });

    if (start + CHUNK_CHARS >= body.length) break;
  }

  return chunks;
}

module.exports = {
  chunkNote,
  buildNoteDocument,
  toPlainText,
  CHUNK_CHARS,
  CHUNK_OVERLAP_CHARS,
  MAX_CHUNKS_PER_NOTE,
};
