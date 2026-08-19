/**
 * Turning a finished meeting into memory objects (spec §19).
 *
 * The transcript is rendered with each line's segment id attached, because
 * §19.3 requires every object to cite at least one source segment and the model
 * can only cite ids it was shown. Anything it returns without them is dropped
 * at ingest — a claim the user cannot check is worse than no claim, since the
 * app will repeat it back as fact.
 *
 * Pure: no store, no model client, no window. The prompt, the rendering and
 * the parsing are the parts that break, and all three are testable here.
 */

/** One transcript line as the extractor sees it. */
export interface ExtractableSegment {
  /** `meeting_segments.id` — what a citation resolves against. */
  id: string;
  text: string;
  source: "mic" | "system";
  speakerName?: string | null;
  startMs?: number | null;
}

export interface ExtractedMemoryObject {
  type: string;
  content: string;
  subject?: string;
  owner?: string | null;
  due_at?: string | null;
  source_segments: string[];
  confidence: number;
}

/**
 * Long meetings are truncated rather than sent whole: the extractor's job is
 * the durable claims, and an hour of transcript exceeds a small local model's
 * context long before it exceeds the interesting content. Truncation keeps the
 * *end* of the meeting, which is where decisions and next steps land.
 */
const MAX_EXTRACTION_CHARS = 24_000;

export const MEMORY_EXTRACTION_PROMPT = [
  "You extract durable memory objects from a meeting transcript.",
  "",
  "Each transcript line is prefixed with its segment id in square brackets. Cite those ids.",
  "",
  "Return ONLY a JSON array. No prose, no markdown fence. Each element:",
  '  {"type": string, "content": string, "subject": "user"|"other", "owner": string|null,',
  '   "due_at": ISO-8601 string|null, "source_segments": [segment id, ...], "confidence": 0..1}',
  "",
  "type is one of: decision, action_item, commitment, deadline, project_fact,",
  "person_fact, preference, risk, open_question.",
  "",
  "Rules:",
  "- Extract only what the transcript states. Never infer a decision that was discussed but not made.",
  "- Every object MUST cite at least one segment id copied exactly from the transcript.",
  '- subject is "user" when the object is about the person recording, otherwise "other".',
  "- owner is the name of whoever owns an action or commitment, or null.",
  "- due_at only when a date or deadline was actually stated. Never invent one.",
  "- confidence reflects how clearly the transcript supports the claim.",
  "- person_fact and preference need clear evidence; when in doubt, omit them.",
  "- One object per distinct claim. Do not restate the same fact twice.",
  "- Nothing durable in the transcript is a valid answer: return [].",
].join("\n");

/** Renders the transcript with citable ids. */
export function formatSegmentsForExtraction(
  segments: readonly ExtractableSegment[],
  labels: { you: string; them: string },
  maxChars: number = MAX_EXTRACTION_CHARS
): string {
  const lines = segments
    .filter((segment) => segment.text?.trim())
    .map((segment) => {
      const speaker =
        segment.speakerName?.trim() || (segment.source === "mic" ? labels.you : labels.them);
      return `[${segment.id}] ${speaker}: ${segment.text.trim()}`;
    });

  const rendered = lines.join("\n");
  if (rendered.length <= maxChars) return rendered;

  // Keep the tail: decisions, owners and next steps cluster at the end of a
  // meeting, and a truncated head costs less than a truncated conclusion.
  const kept: string[] = [];
  let used = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (used + lines[i].length + 1 > maxChars) break;
    kept.unshift(lines[i]);
    used += lines[i].length + 1;
  }
  return kept.join("\n");
}

/**
 * Pulls the JSON array out of a model response.
 *
 * Models wrap JSON in fences, prefix it with "Here are the objects:", or emit
 * a single object instead of an array. All three are recoverable and none is
 * worth losing a meeting's memory over; anything else returns [].
 */
export function parseExtractionResponse(response: string): ExtractedMemoryObject[] {
  if (typeof response !== "string" || !response.trim()) return [];

  const unfenced = response.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1").trim();

  const candidates = [unfenced];
  // Fall back to the outermost bracketed span, which survives leading prose.
  const start = unfenced.indexOf("[");
  const end = unfenced.lastIndexOf("]");
  if (start !== -1 && end > start) candidates.push(unfenced.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed.filter(isPlausibleObject);
      if (isPlausibleObject(parsed)) return [parsed];
    } catch {
      // try the next candidate
    }
  }
  return [];
}

function isPlausibleObject(value: unknown): value is ExtractedMemoryObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const object = value as Record<string, unknown>;
  return typeof object.type === "string" && typeof object.content === "string";
}

/**
 * Drops citations the model did not get from the transcript.
 *
 * A hallucinated segment id is the failure mode that matters here: it would
 * pass validation, be stored as evidence, and resolve to nothing — or worse, to
 * an unrelated line — the first time the user clicked it.
 */
export function pruneUnknownCitations(
  objects: readonly ExtractedMemoryObject[],
  knownSegmentIds: Iterable<string>
): ExtractedMemoryObject[] {
  const known = knownSegmentIds instanceof Set ? knownSegmentIds : new Set(knownSegmentIds);
  return objects
    .map((object) => ({
      ...object,
      source_segments: (Array.isArray(object.source_segments) ? object.source_segments : []).filter(
        (id) => known.has(id)
      ),
    }))
    .filter((object) => object.source_segments.length > 0);
}
