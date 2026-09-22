import { defaultModelForProvider } from "./scopeModelDefaults";

/**
 * What happens to the AI model when the key of the provider it runs on goes.
 *
 * It moves to the next provider that still has a key, on that provider's
 * default — the same default a first key applies — and when no keyed
 * provider is left it is cleared to "needs a model", which Home's card, the
 * dot's badge and the write-up's error already know how to show. Never to a
 * local model: a removed key stops at "needs a model" (client decision,
 * 2026-09-22). Before this a removed key left the route in place, and every
 * request after it failed with "<provider> API key not configured" until
 * someone worked out why (client, 2026-09-22).
 *
 * Pure: the store hands in what the model resolves to and which keyed
 * provider comes next, and applies the move it gets back.
 */

export interface ModelRoute {
  /** The resolved mode: "providers", "local", "self-hosted", "enterprise"… */
  mode: string;
  provider: string;
}

export interface RerouteMove {
  from: string;
  /** The provider the model moves to, or null when none has a key. */
  to: string | null;
  model: string | null;
}

/** The move to make, or null when the model did not run on that provider. */
export function planRerouteOffProvider(
  route: ModelRoute,
  removedProvider: string,
  nextProvider: string | null
): RerouteMove | null {
  if (route.mode !== "providers" || route.provider !== removedProvider) return null;
  const model = nextProvider ? defaultModelForProvider(nextProvider) : null;
  return { from: removedProvider, to: model ? nextProvider : null, model };
}
