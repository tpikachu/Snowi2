// Turns a note's transcript blob into addressable segment rows.
//
// `notes.transcript` is a JSON array written by the capture store. That is fine
// for rendering a transcript, and useless for pointing *at* one line of it:
// spec §19.3 requires every memory object to cite at least one source segment,
// §20 lets the user jump from an action item to the moment it was said, and
// §13.2 marks the gaps where capture was paused. None of that can address a
// blob without parsing every note in the library first.
//
// So this is a derived index over the blob, maintained the same way `notes_fts`
// and `note_chunks` are — the blob stays the source of truth, and nothing that
// writes it has to change. Pure, so the parsing rules can be tested against
// malformed input without a database.

/**
 * Capture numbers segments per session (`seg-1`, `seg-2`, …), so an id is
 * unique inside one recording and repeats across every meeting. Row ids are
 * therefore scoped to the note.
 *
 * Prefer the segment's own id: it survives a re-save, a diarization pass
 * rewriting speaker labels, and anything else that rebuilds the array without
 * changing what was said — which is what a citation needs. Fall back to the
 * ordinal only when the id is missing or repeats within one note (two capture
 * sessions appended to the same note both start at `seg-1`).
 */
function segmentRowId(noteId, segmentId, seq) {
  return segmentId ? `${noteId}:${segmentId}` : `${noteId}:#${seq}`;
}

function toFiniteInt(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

/**
 * Normalizes one note's transcript into rows ready for insertion.
 *
 * Returns `[]` for anything unparseable rather than throwing: a note with a
 * corrupt blob should lose its segment index, not block the projection of
 * every other note in a backfill.
 */
function parseTranscriptSegments(noteId, rawTranscript) {
  if (!rawTranscript || typeof rawTranscript !== "string") return [];

  let parsed;
  try {
    parsed = JSON.parse(rawTranscript);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const rows = [];
  const usedIds = new Set();
  let seq = 0;

  for (const segment of parsed) {
    if (!segment || typeof segment !== "object") continue;
    const text = typeof segment.text === "string" ? segment.text.trim() : "";
    // A segment with no words is a capture artifact. Indexing it would let a
    // memory object cite evidence that shows the user nothing.
    if (!text) continue;

    const rawId = typeof segment.id === "string" && segment.id.trim() ? segment.id.trim() : null;
    let id = segmentRowId(noteId, rawId, seq);
    if (usedIds.has(id)) id = segmentRowId(noteId, null, seq);
    if (usedIds.has(id)) continue;
    usedIds.add(id);

    const startMs = toFiniteInt(segment.timestamp);
    rows.push({
      id,
      note_id: noteId,
      seq,
      segment_id: rawId,
      start_ms: startMs,
      // Capture records a start only. Kept as a column because diarization and
      // the audio-tap path both know the end, and a citation that can only say
      // "somewhere after 12:04" is materially worse than one that can seek.
      end_ms: toFiniteInt(segment.endTimestamp),
      source: segment.source === "mic" || segment.source === "system" ? segment.source : null,
      speaker: typeof segment.speaker === "string" ? segment.speaker : null,
      speaker_name: typeof segment.speakerName === "string" ? segment.speakerName : null,
      text,
    });
    seq += 1;
  }

  return rows;
}

/** Formats a segment as evidence: who said it, when, and what. */
function formatSegmentEvidence(row) {
  if (!row) return "";
  const who = row.speaker_name || row.speaker;
  const when = row.start_ms == null ? null : formatOffset(row.start_ms);
  const prefix = [when, who].filter(Boolean).join(" ");
  return prefix ? `[${prefix}] ${row.text}` : row.text;
}

function formatOffset(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export { formatOffset, formatSegmentEvidence, parseTranscriptSegments, segmentRowId };
