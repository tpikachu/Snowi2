/**
 * Whether the meeting assistant can search the web on the chat scope's route.
 *
 * Search is the provider's own server tool, attached to the request (see
 * `services/ai/webSearchTools.ts`) — no separate search vendor, no extra key,
 * and the citations come from the provider. So availability is a fact about
 * the route: OpenAI's Responses API, Anthropic, Gemini and OpenRouter (which
 * grounds any model through the web option on its id) can; a custom
 * OpenAI-compatible endpoint, a LAN server, a local model and the enterprise
 * clouds cannot, and the cue card shows its toggle disabled for them rather
 * than failing the question. Pure — the caller hands in the resolved chat
 * scope.
 */
export const WEB_SEARCH_PROVIDERS: ReadonlySet<string> = new Set([
  "openai",
  "anthropic",
  "gemini",
  "openrouter",
]);

export interface WebSearchRoute {
  mode?: string;
  provider: string;
}

export function webSearchAvailable(route: WebSearchRoute): boolean {
  if ((route.mode || "") !== "providers") return false;
  return WEB_SEARCH_PROVIDERS.has(route.provider);
}

/** OpenRouter grounds any model when its id carries the web option. */
export function openrouterOnlineModel(model: string): string {
  return model.endsWith(":online") ? model : `${model}:online`;
}
