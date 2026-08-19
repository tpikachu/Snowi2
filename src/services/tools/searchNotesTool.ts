import type { SpaceItem } from "../../types/electron";
import type { ContainerScope } from "../../types/chat";
import type { ToolDefinition, ToolResult } from "./ToolRegistry";
import { resolveSpace } from "./utils";

const MAX_CONTENT_LENGTH = 500;

interface SearchToolOptions {
  /** Pins every search to this container; the LLM's space arg is dropped. */
  fixedScope?: ContainerScope;
}

export function createSearchNotesTool(options: SearchToolOptions): ToolDefinition {
  const { fixedScope } = options;

  const spaceParameter = fixedScope
    ? {}
    : {
        space: {
          type: "string",
          description: "Space name to search within. Omit to search all accessible spaces.",
        },
      };

  return {
    name: "search_notes",
    description: fixedScope
      ? "Search the notes in the folder or space the user is currently viewing, using semantic search. Understands meaning and context, not just keywords. Returns matching notes with title, date, relevance score, space, and a preview of content."
      : "Search the user's notes using semantic search. Understands meaning and context, not just keywords. Searches every space the user can access by default; pass space to search within a single space. Returns matching notes with title, date, relevance score, space, and a preview of content.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to find relevant notes",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return (default 5)",
        },
        ...spaceParameter,
      },
      required: ["query"],
      additionalProperties: false,
    },
    readOnly: true,

    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const query = args.query as string;
      const limit = typeof args.limit === "number" ? args.limit : 5;
      const spaceName = fixedScope ? undefined : (args.space as string | undefined);

      const spaces = (await window.electronAPI.getSpaces?.()) ?? [];
      let space: SpaceItem | undefined;
      if (fixedScope) {
        space = spaces.find((s) => s.id === fixedScope.spaceId);
      } else if (spaceName) {
        const resolved = resolveSpace(spaces, spaceName);
        if (resolved.error) {
          return { success: false, data: null, displayText: resolved.error };
        }
        space = resolved.space;
      }
      const spaceId = fixedScope?.spaceId ?? space?.id ?? null;
      const folderId = fixedScope?.folderId ?? null;

      // Fallback chain: local semantic (hybrid RRF) → FTS5 keyword.
      const strategies: Array<() => Promise<ToolResult>> = [];
      strategies.push(() =>
        executeLocalSearch(query, limit, true, space, spaces, spaceId, folderId)
      );
      strategies.push(() =>
        executeLocalSearch(query, limit, false, space, spaces, spaceId, folderId)
      );

      for (let i = 0; i < strategies.length; i++) {
        try {
          return await strategies[i]();
        } catch (error) {
          if (i === strategies.length - 1) {
            return {
              success: false,
              data: null,
              displayText: `Failed to search notes: ${(error as Error).message}`,
            };
          }
        }
      }

      return { success: false, data: null, displayText: "No search strategies available" };
    },
  };
}

function summaryText(
  count: number,
  query: string,
  space: SpaceItem | undefined,
  semantic: boolean
): string {
  const scope = space ? ` in ${space.name}` : "";
  if (count === 0) return `No notes found for "${query}"${scope}`;
  return `Found ${count} note${count === 1 ? "" : "s"} for "${query}"${scope}${semantic ? " (semantic search)" : ""}`;
}

async function executeLocalSearch(
  query: string,
  limit: number,
  semantic: boolean,
  space: SpaceItem | undefined,
  spaces: SpaceItem[],
  spaceId: number | null,
  folderId: number | null
): Promise<ToolResult> {
  const notes = semantic
    ? await window.electronAPI.semanticSearchNotes(query, limit, spaceId, folderId)
    : await window.electronAPI.searchNotes(query, limit, spaceId, folderId);

  const spaceNameById = new Map(spaces.map((s) => [s.id, s.name]));
  const results = notes.map((note) => ({
    id: note.id,
    title: note.title,
    date: note.created_at,
    type: note.note_type,
    space: spaceNameById.get(note.space_id) ?? null,
    // The passage that matched when semantic search could name one. The note's
    // opening is a poor stand-in for a long meeting: the vector matched
    // something in the middle and the agent would be shown the beginning.
    content:
      note.matched_snippet?.trim() ||
      (note.enhanced_content || note.content || note.transcript || "").slice(0, MAX_CONTENT_LENGTH),
  }));

  return {
    success: true,
    data: results,
    // Lets the model cite what it found here. Citation filtering drops ids it
    // was never shown, and a search hit is otherwise invisible to it.
    noteRefs: results.map((note) => ({ id: note.id, title: note.title })),
    displayText: summaryText(results.length, query, space, semantic),
  };
}
