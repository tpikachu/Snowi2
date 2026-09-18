import type { AgentStreamChunk } from "../services/ReasoningService";
import type { AssistWebSource } from "./meetingAssistState";

/**
 * Folds a streamed answer into text plus what the web search returned.
 *
 * The cue card shows sources as its own row of links, so the text is kept
 * clean of the inline citation parentheticals a provider appends — OpenAI
 * writes "($20/month. ([notion.com](https://…utm_source=openai)))" into the
 * answer itself, which on a glanceable card is noise next to a link row that
 * says the same. A search counts as made when the provider ran its tool,
 * whether or not it surfaced a page: the source line says "Searched the
 * web" for an honest search that found nothing, and never for a request
 * whose tool was refused.
 *
 * Pure over the chunk stream, so it is tested with a fake generator.
 */
export interface CollectedAnswer {
  text: string;
  sources: AssistWebSource[];
  searched: boolean;
}

export interface CollectAnswerHandlers {
  /** Every text update, already stripped of inline citations. */
  onText?: (text: string) => void;
  /** Fired when the search ran, with the sources known so far (deduplicated). */
  onSearch?: (sources: AssistWebSource[]) => void;
}

/** Provider search tools, by the names their SDK descriptors carry. */
export const WEB_SEARCH_TOOL_NAMES: ReadonlySet<string> = new Set([
  "web_search",
  "web_search_preview",
  "google_search",
]);

/** How many sources the card lists under an answer. */
export const MAX_WEB_SOURCES = 3;

const MARKDOWN_LINK = String.raw`\[[^\]\n]*\]\(https?:\/\/[^\s)]*\)`;
/** "([site](url))", also "([a](u), [b](v))" — the parenthetical, links and all. */
const CITATION_GROUP = new RegExp(
  String.raw`[ \t]*\((?:${MARKDOWN_LINK})(?:,\s*(?:${MARKDOWN_LINK}))*\)`,
  "g"
);
/** A bare "(https://…)" the same way — but never the URL half of a markdown link. */
const BARE_URL_GROUP = /(?<!\])[ \t]*\(https?:\/\/[^\s)]*\)/g;

export function stripInlineCitations(text: string): string {
  return text
    .replace(CITATION_GROUP, "")
    .replace(BARE_URL_GROUP, "")
    .replace(/ +([.,;:!?])/g, "$1");
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** The link's label on the card: its title, else its host. */
export function sourceLabel(source: AssistWebSource): string {
  return source.title.trim() || hostnameOf(source.url);
}

export async function collectAnswerStream(
  stream: AsyncGenerator<AgentStreamChunk>,
  handlers: CollectAnswerHandlers = {}
): Promise<CollectedAnswer> {
  let raw = "";
  let searched = false;
  const sources: AssistWebSource[] = [];
  const seen = new Set<string>();
  for await (const chunk of stream) {
    if (chunk.type === "content") {
      raw += chunk.text;
      handlers.onText?.(stripInlineCitations(raw));
    } else if (chunk.type === "source") {
      if (!chunk.url || seen.has(chunk.url)) continue;
      seen.add(chunk.url);
      sources.push({ url: chunk.url, title: chunk.title?.trim() || "" });
      searched = true;
      handlers.onSearch?.([...sources]);
    } else if (chunk.type === "tool_calls") {
      if (chunk.calls.some((call) => WEB_SEARCH_TOOL_NAMES.has(call.name))) {
        if (!searched) {
          searched = true;
          handlers.onSearch?.([...sources]);
        }
      }
    }
  }
  return { text: stripInlineCitations(raw), sources, searched };
}
