import type { MemoryObjectRow, SpaceItem } from "../../types/electron";
import type { ContainerScope } from "../../types/chat";
import type { ToolDefinition, ToolResult } from "./ToolRegistry";

/**
 * Queries the durable claims extracted from meetings (spec §19).
 *
 * Every meeting produces nine kinds of memory object — decisions, commitments,
 * deadlines, risks, open questions and more — each citing the transcript
 * segments it came from. Before this tool, chat could read two of them, so
 * "what did I commit to" and "what is overdue" had no answer: `status` and
 * `due_at` were columns nothing could filter.
 *
 * This is not search_notes with a different index. search_notes ranks passages
 * by similarity and cannot express "still open" or "due this week"; this ranks
 * nothing and filters exactly. Asked "what did we decide about pricing", the
 * right move is usually both: this for the decision, search_notes for what was
 * said around it.
 */

/** The vocabulary the extractor emits (utils/memoryExtraction.ts). */
const MEMORY_TYPES = [
  "decision",
  "action_item",
  "commitment",
  "deadline",
  "project_fact",
  "person_fact",
  "preference",
  "risk",
  "open_question",
] as const;

/** Types that answer "what do I owe someone", grouped for the description. */
const ACTIONABLE_TYPES = ["action_item", "commitment", "deadline"];

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;

interface SearchMemoryOptions {
  /** Pins every query to this container; the LLM cannot widen it. */
  fixedScope?: ContainerScope;
}

function normalizeTypes(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const allowed = new Set<string>(MEMORY_TYPES);
  const types = value.filter((t): t is string => typeof t === "string" && allowed.has(t));
  return types.length > 0 ? types : null;
}

function normalizeDate(value: unknown): string | null {
  return typeof value === "string" && DATE_PATTERN.test(value.trim()) ? value.trim() : null;
}

function normalizeLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(value)));
}

function normalizeEnum(value: unknown, allowed: readonly string[]): string | null {
  return typeof value === "string" && allowed.includes(value) ? value : null;
}

export function createSearchMemoryTool(options: SearchMemoryOptions): ToolDefinition {
  const { fixedScope } = options;

  return {
    name: "search_memory",
    description:
      "Query durable facts extracted from the user's meetings: decisions, action items, " +
      "commitments, deadlines, risks, open questions, project and person facts. " +
      "Use this — not search_notes — for what was decided, what someone committed to, " +
      "what is still open, and anything due or overdue, because only this can filter on " +
      "status and due date. Returns each claim with its type, status, due date, owner and " +
      "the note it came from, plus the exact total that matched. " +
      "Use search_notes instead for what was said or discussed in a meeting.",
    parameters: {
      type: "object",
      properties: {
        types: {
          type: "array",
          items: { type: "string", enum: [...MEMORY_TYPES] },
          description:
            `Kinds of claim to return. Omit for all. Use [${ACTIONABLE_TYPES.map((t) => `"${t}"`).join(", ")}] ` +
            "for what the user or someone else owes.",
        },
        subject: {
          type: "string",
          enum: ["user", "other"],
          description:
            'Whose claim this is. "user" is about the person recording; "other" is about ' +
            "anyone else. Omit to cover both.",
        },
        status: {
          type: "string",
          enum: ["open", "done", "superseded", "dismissed"],
          description:
            "Filter to one status. Omit to get everything current — superseded and dismissed " +
            "claims are excluded unless you ask for them by name.",
        },
        due_after: {
          type: "string",
          description: "Only claims due on or after this date (YYYY-MM-DD). Omit for no bound.",
        },
        due_before: {
          type: "string",
          description:
            "Only claims due on or before this date (YYYY-MM-DD). Pass today's date to find " +
            'what is overdue, together with status "open".',
        },
        limit: {
          type: "number",
          description: `Maximum claims to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}). The total is reported regardless.`,
        },
      },
      required: [],
      additionalProperties: false,
    },
    readOnly: true,

    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const types = normalizeTypes(args.types);
      const subject = normalizeEnum(args.subject, ["user", "other"]);
      const status = normalizeEnum(args.status, ["open", "done", "superseded", "dismissed"]);
      const dueAfter = normalizeDate(args.due_after);
      const dueBefore = normalizeDate(args.due_before);
      const limit = normalizeLimit(args.limit);

      const result = await window.electronAPI.searchMemory?.({
        types,
        subject,
        status,
        dueAfter,
        dueBefore,
        // Asking for the superseded half of a chain by name is the only way to
        // see it; a bare query never returns a reversed decision as current.
        includeSuperseded: status === "superseded",
        spaceId: fixedScope?.spaceId ?? null,
        folderId: fixedScope?.folderId ?? null,
        limit,
      });
      if (!result) {
        return { success: false, data: null, displayText: "Memory is unavailable" };
      }

      const spaces: SpaceItem[] = (await window.electronAPI.getSpaces?.()) ?? [];
      const noteTitles = await resolveNoteTitles(result.objects);

      const claims = result.objects.map((row: MemoryObjectRow) => ({
        type: row.type,
        // A row whose meeting key is gone still has a real type and due date.
        // Saying the content is unreadable beats implying the claim is empty.
        content: row.content ?? (row.content_available ? null : "(content unavailable)"),
        subject: row.subject,
        owner: row.owner,
        status: row.status,
        dueAt: row.due_at,
        confidence: row.confidence,
        recordedAt: row.created_at,
        // Named `noteId` so the model can cite it with the [[note:ID]] marker
        // it already uses for search_notes and list_meetings results.
        noteId: row.note_id,
        noteTitle: row.note_id != null ? (noteTitles.get(row.note_id) ?? null) : null,
      }));

      const noteRefs = claims
        .filter((c) => c.noteId != null && c.noteTitle)
        .map((c) => ({ id: c.noteId as number, title: c.noteTitle as string }));

      return {
        success: true,
        data: {
          total: result.total,
          listed: claims.length,
          note:
            claims.length < result.total
              ? `Showing ${claims.length} of ${result.total} matching claims. State the total, not the number shown.`
              : "This is every matching claim.",
          claims,
        },
        // Deduped: several claims routinely come from one meeting, and a
        // repeated ref would cite the same note many times over.
        noteRefs: dedupeRefs(noteRefs),
        displayText: summaryText(result.total, claims.length, spaces, fixedScope),
      };
    },
  };
}

function dedupeRefs(refs: { id: number; title: string }[]): { id: number; title: string }[] {
  const seen = new Set<number>();
  return refs.filter((ref) => (seen.has(ref.id) ? false : (seen.add(ref.id), true)));
}

/**
 * Note titles are not on the memory row, and one read per claim would be a
 * request per result. One batched read over the distinct notes instead.
 */
async function resolveNoteTitles(rows: MemoryObjectRow[]): Promise<Map<number, string>> {
  const ids = [...new Set(rows.map((r) => r.note_id).filter((id): id is number => id != null))];
  const titles = new Map<number, string>();
  if (ids.length === 0) return titles;

  const notes = await Promise.all(
    ids.map((id) => window.electronAPI.getNote?.(id).catch(() => null))
  );
  for (const note of notes) {
    if (note?.id != null && note.title) titles.set(note.id, note.title);
  }
  return titles;
}

function summaryText(
  total: number,
  listed: number,
  spaces: SpaceItem[],
  fixedScope?: ContainerScope
): string {
  const space = fixedScope ? spaces.find((s) => s.id === fixedScope.spaceId) : undefined;
  const scope = space ? ` in ${space.name}` : "";
  if (total === 0) return `No memory matched${scope}`;
  const shown = listed < total ? `, showing ${listed}` : "";
  return `Found ${total} claim${total === 1 ? "" : "s"}${scope}${shown}`;
}
