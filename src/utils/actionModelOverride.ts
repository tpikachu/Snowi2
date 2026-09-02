/**
 * Per-action model overrides: an action (or the follow-up email) can name its
 * own model; everything else about the request — endpoints, credentials —
 * still comes from the provider key store at request time.
 *
 * Pure and defensive: rows written by other builds may hold any strings, so
 * an override only *reads* as one when it is complete and its mode is one the
 * point-of-use picker can produce. Whether the override is USABLE (key
 * present, local model on disk) is the caller's judgment via
 * selectLLMConfigReady — this module only shapes.
 */

export interface ActionModelOverride {
  mode: "providers" | "local";
  provider: string;
  model: string;
}

export function readActionModelOverride(source: {
  model_mode?: string | null;
  model_provider?: string | null;
  model_id?: string | null;
}): ActionModelOverride | null {
  const mode = source.model_mode;
  const provider = source.model_provider?.trim();
  const model = source.model_id?.trim();
  if ((mode !== "providers" && mode !== "local") || !provider || !model) return null;
  return { mode, provider, model };
}

/**
 * The override applied to a resolved actions config: mode/provider/model are
 * replaced, and every endpoint-shaped field is CLEARED — the default scope's
 * custom base URL or LAN endpoint must never leak under an override that
 * named a different provider. BYOK keys re-resolve from the provider fields
 * on the request path.
 */
export function applyActionModelOverride<
  T extends {
    mode: string;
    provider: string;
    model: string;
    cloudMode?: string;
    cloudBaseUrl?: string;
    remoteUrl?: string;
    customApiKey?: string;
  },
>(base: T, override: ActionModelOverride): T {
  return {
    ...base,
    mode: override.mode,
    provider: override.provider,
    model: override.model,
    cloudMode: undefined,
    cloudBaseUrl: undefined,
    remoteUrl: undefined,
    customApiKey: undefined,
  };
}
