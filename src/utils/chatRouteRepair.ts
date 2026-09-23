import { defaultModelForProvider } from "./scopeModelDefaults";

/**
 * One model, on an install that had two.
 *
 * Until rc10 chat and the write-up were separate scopes with separate
 * defaults, and a chat route that could not serve was rescued on the read
 * path (the first keyed provider's default) without ever being written down.
 * rc10 reads the stored chat route as it is and runs the write-up on it too
 * (client direction, 2026-09-22). So an rc9 install whose only key was not
 * OpenAI — the chat default it never wrote — or whose key sat on the
 * write-up's provider alone would update into "needs a model" on every
 * surface, with the key still there. This decides, once the keys have
 * hydrated at startup, what the model should be; the store applies it.
 *
 * A model that can serve is never touched: a pick is a pick, and a second
 * key never overrides one (the same rule a new key follows). Otherwise the
 * write-up's own stored route is adopted when it is a keyed cloud route —
 * that is where this install's notes were being written — and failing that
 * the first keyed provider's default, the same default a first key applies.
 * With no key anywhere there is nothing to repair: Home and the dot already
 * say "needs a model".
 */

export interface StoredRoute {
  /** The stored mode: "providers", "local", "self-hosted", "enterprise" or "". */
  mode: string;
  provider: string;
  model: string;
}

export interface ChatRouteRepairInput {
  /** Whether the chat model, as it resolves now, can serve a request. */
  chatReady: boolean;
  /** The chat model's resolved mode. */
  chatMode: string;
  /** The write-up's stored route, as rc9 kept it. */
  actions: StoredRoute;
  /** Whether a key is stored for this cloud provider. */
  isKeyed: (provider: string) => boolean;
  /** Whether the id names a cloud provider (not a local model family). */
  isCloudProvider: (provider: string) => boolean;
  /** The first provider with a key and a default model, if any. */
  firstKeyedProvider: string | null;
}

export interface ChatRouteRepair {
  provider: string;
  model: string;
}

/** The cloud route to write for the chat model, or null to leave it alone. */
export function planChatRouteRepair(input: ChatRouteRepairInput): ChatRouteRepair | null {
  if (input.chatReady || input.chatMode === "enterprise") return null;

  const { actions } = input;
  // A cloud provider id under local mode is the contradiction the read path
  // already treats as cloud (normalizeLocalMode); "" reads as local there too.
  const cloudShaped =
    actions.mode === "providers" ||
    ((actions.mode || "local") === "local" && input.isCloudProvider(actions.provider));
  if (
    cloudShaped &&
    actions.provider &&
    actions.model &&
    input.isCloudProvider(actions.provider) &&
    input.isKeyed(actions.provider)
  ) {
    return { provider: actions.provider, model: actions.model };
  }

  const provider = input.firstKeyedProvider;
  const model = provider ? defaultModelForProvider(provider) : null;
  return provider && model ? { provider, model } : null;
}
