import type { SpaceItem, MeetingListRow } from "../../types/electron";
import type { ContainerScope } from "../../types/chat";
import type { ToolDefinition, ToolResult } from "./ToolRegistry";
import { resolveSpace } from "./utils";

/**
 * Enumerates meetings, structurally.
 *
 * This exists because search_notes cannot answer "how many meetings did we
 * have". Semantic search returns the nearest K passages and has no notion of
 * "all" — asked to count, an agent counts the results it was handed and states
 * the number with total confidence. A SQL COUNT is the only honest answer.
 *
 * Which is also why `total` is reported separately from the listed rows: a page
 * of 20 out of 43 would reproduce exactly the failure this tool replaces.
 */

/** Enough to summarise a period without burying the answer in the context. */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

interface ListMeetingsOptions {
  /** Pins every listing to this container; the LLM's space arg is dropped. */
  fixedScope?: ContainerScope;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDate(value: unknown): string | null {
  return typeof value === "string" && DATE_PATTERN.test(value.trim()) ? value.trim() : null;
}

function normalizeLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(value)));
}

/** Minutes, rounded — nobody asks how many seconds a meeting ran. */
function durationMinutes(seconds: number | null): number | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.max(1, Math.round(seconds / 60));
}

function parseParticipants(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) =>
          typeof entry === "string" ? entry : String((entry as { name?: string })?.name ?? "")
        )
        .filter(Boolean);
    }
  } catch {
    // Older rows stored a plain comma-separated string.
  }
  return raw
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

export function createListMeetingsTool(options: ListMeetingsOptions): ToolDefinition {
  const { fixedScope } = options;

  const spaceParameter = fixedScope
    ? {}
    : {
        space: {
          type: "string",
          description: "Space name to list within. Omit to cover every accessible space.",
        },
      };

  return {
    name: "list_meetings",
    description:
      "List the user's recorded meetings, newest first, with an exact total. " +
      "Use this — never search_notes — for questions about how many meetings there were, " +
      "which meetings happened in a period, or to enumerate meetings. " +
      "Returns each meeting's note id, title, date, duration and participants, plus the " +
      "total number that matched, which may be larger than the number listed. " +
      "Use search_notes instead when the question is about what was said or decided.",
    parameters: {
      type: "object",
      properties: {
        from: {
          type: "string",
          description: "Earliest meeting date to include, as YYYY-MM-DD. Omit for no lower bound.",
        },
        to: {
          type: "string",
          description: "Latest meeting date to include, as YYYY-MM-DD. Omit for no upper bound.",
        },
        limit: {
          type: "number",
          description: `Maximum meetings to list (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}). The total is reported regardless.`,
        },
        ...spaceParameter,
      },
      required: [],
      additionalProperties: false,
    },
    readOnly: true,

    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const spaceName = fixedScope ? undefined : (args.space as string | undefined);

      const spaces = (await window.electronAPI.getSpaces?.()) ?? [];
      let space: SpaceItem | undefined;
      if (fixedScope) {
        space = spaces.find((s) => s.id === fixedScope.spaceId);
      } else if (spaceName) {
        const resolved = resolveSpace(spaces, spaceName);
        if (resolved.error) return { success: false, data: null, displayText: resolved.error };
        space = resolved.space;
      }

      const from = normalizeDate(args.from);
      const to = normalizeDate(args.to);
      const limit = normalizeLimit(args.limit);

      const result = await window.electronAPI.listMeetings?.({
        spaceId: fixedScope?.spaceId ?? space?.id ?? null,
        folderId: fixedScope?.folderId ?? null,
        from,
        to,
        limit,
      });
      if (!result) {
        return { success: false, data: null, displayText: "Meeting list is unavailable" };
      }

      const spaceNameById = new Map(spaces.map((s) => [s.id, s.name]));
      const meetings = result.meetings.map((row: MeetingListRow) => ({
        // Named `id` to match search_notes, so the same [[note:ID]] citation
        // the model already knows how to write links a listed meeting.
        id: row.id,
        title: row.title,
        date: row.created_at,
        durationMinutes: durationMinutes(row.audio_duration_seconds),
        participants: parseParticipants(row.participants),
        space: row.space_id != null ? (spaceNameById.get(row.space_id) ?? null) : null,
        fromCalendar: !!row.calendar_event_id,
        hasNotes: !!row.has_notes,
        hasTranscript: !!row.has_transcript,
      }));

      return {
        success: true,
        data: {
          total: result.total,
          listed: meetings.length,
          // Spelled out rather than left for the model to infer from two
          // numbers: "you had 20 meetings" is the failure being designed out.
          note:
            meetings.length < result.total
              ? `Showing the ${meetings.length} most recent of ${result.total} matching meetings. State the total, not the number shown.`
              : "This is every matching meeting.",
          meetings,
        },
        // What lets the model's [[note:ID]] markers survive citation filtering,
        // which drops ids it was never shown. Without these, a listed meeting
        // renders as plain text instead of a link to its note.
        noteRefs: meetings.map((meeting) => ({ id: meeting.id, title: meeting.title })),
        displayText: summaryText(result.total, meetings.length, space, from, to),
      };
    },
  };
}

function summaryText(
  total: number,
  listed: number,
  space: SpaceItem | undefined,
  from: string | null,
  to: string | null
): string {
  const scope = space ? ` in ${space.name}` : "";
  const period =
    from && to ? ` between ${from} and ${to}` : from ? ` since ${from}` : to ? ` up to ${to}` : "";
  if (total === 0) return `No meetings found${scope}${period}`;
  const shown = listed < total ? `, showing ${listed}` : "";
  return `Found ${total} meeting${total === 1 ? "" : "s"}${scope}${period}${shown}`;
}
