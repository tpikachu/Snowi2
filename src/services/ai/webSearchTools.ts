import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { Tool } from "ai";

/**
 * The provider's own web search, as a tool the streaming request carries.
 *
 * Each SDK exposes its provider's server-side search as a provider-defined
 * tool descriptor: the provider runs the search inside the response, and the
 * stream reports the pages it read as `source` parts, which the meeting
 * assistant turns into the card's source links. No key is needed to build
 * the descriptor — the provider instances below exist only for their tool
 * factories; the request's own key travels with the model.
 *
 * Bounded on purpose: every search is seconds the user waits through
 * mid-call. Two is enough to check a claim and read the page behind it, and
 * OpenAI's smallest context size keeps the tokens it returns from crowding
 * out the answer (a searched gpt-5-mini answer at the default budget came
 * back empty — probe, 2026-09-18). OpenRouter is not here: it grounds any
 * model through the web option on the model id (`openrouterOnlineModel`).
 */
export const WEB_SEARCH_MAX_USES = 2;

/** A searched answer carries the pages it read; the default cap swallowed it. */
export const WEB_SEARCH_MAX_OUTPUT_TOKENS = 8192;

const openaiTools = createOpenAI({ apiKey: "unused" }).tools;
const anthropicTools = createAnthropic({ apiKey: "unused" }).tools;
const googleTools = createGoogleGenerativeAI({ apiKey: "unused" }).tools;

export function webSearchToolsFor(provider: string): Record<string, Tool> | null {
  switch (provider) {
    case "openai":
      return { web_search: openaiTools.webSearch({ searchContextSize: "low" }) };
    case "anthropic":
      return { web_search: anthropicTools.webSearch_20250305({ maxUses: WEB_SEARCH_MAX_USES }) };
    case "gemini":
      return { google_search: googleTools.googleSearch({}) };
    default:
      return null;
  }
}
