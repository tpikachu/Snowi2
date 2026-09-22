import { type DefaultableScope, defaultModelForScope } from "./scopeModelDefaults";

/**
 * What happens to the features a provider was serving when its key goes.
 *
 * Several providers can hold keys at once and every feature routes on its
 * own (chat on one, meeting write-ups on another), so removing a key must
 * only touch the scopes that pointed at that provider. Each of those moves
 * to the next provider that still has a key, on that provider's defaults —
 * the same defaults a first key applies — and when no keyed provider is
 * left the scope is cleared to "needs a model", which Home and the dot's
 * badge already know how to show. Before this a removed key left the route
 * in place, and every request after it failed with "<provider> API key not
 * configured" until someone worked out why (client, 2026-09-22).
 *
 * Pure: the store hands in what each scope resolves to and which keyed
 * provider comes next, and applies the moves it gets back.
 */

export interface ScopeRoute {
  scope: DefaultableScope;
  /** The resolved mode: "providers", "local", "self-hosted", "enterprise"… */
  mode: string;
  provider: string;
}

export interface RerouteMove {
  scope: DefaultableScope;
  from: string;
  /** The provider the scope moves to, or null when none has a key. */
  to: string | null;
  model: string | null;
}

export function planRerouteOffProvider(
  routes: readonly ScopeRoute[],
  removedProvider: string,
  nextProvider: string | null
): RerouteMove[] {
  const moves: RerouteMove[] = [];
  for (const route of routes) {
    if (route.mode !== "providers" || route.provider !== removedProvider) continue;
    const model = nextProvider ? defaultModelForScope(nextProvider, route.scope) : null;
    moves.push({
      scope: route.scope,
      from: removedProvider,
      to: model ? nextProvider : null,
      model,
    });
  }
  return moves;
}
