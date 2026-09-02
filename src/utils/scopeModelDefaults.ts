/**
 * The model each feature starts on the moment a provider key arrives.
 *
 * The contract behind the keys-only Settings page: entering an API key IS the
 * whole setup — Settings never asks for a model. Chat (which also serves the
 * meeting assistant) gets the provider's balanced everyday model; actions
 * (meeting write-ups, follow-up emails) get its cheapest capable one, because
 * write-ups run in the background where latency is invisible and volume adds
 * up. The user changes either later from the chips, never from Settings.
 *
 * Applied only to a scope that cannot currently serve (see
 * `applyDefaultModelsForNewKey` in settingsStore): a model someone picked, on
 * any provider whose key is present, is never overridden by adding another
 * key. Providers without a static catalog (openrouter, custom) have no entry
 * — there is nothing safe to default to on someone else's model list.
 *
 * Pure — no store, no Electron — so the mapping is testable, and the test can
 * hold every id here against the model registry.
 */

export type DefaultableScope = "chatIntelligence" | "actions";

export const DEFAULTABLE_SCOPES: readonly DefaultableScope[] = ["chatIntelligence", "actions"];

const SCOPE_DEFAULT_MODELS: Record<string, Record<DefaultableScope, string>> = {
  openai: { chatIntelligence: "gpt-5-mini", actions: "gpt-5-nano" },
  anthropic: { chatIntelligence: "claude-sonnet-5", actions: "claude-haiku-4-5" },
  gemini: { chatIntelligence: "gemini-3.5-flash", actions: "gemini-2.5-flash-lite" },
  groq: { chatIntelligence: "openai/gpt-oss-120b", actions: "openai/gpt-oss-20b" },
  tinfoil: { chatIntelligence: "kimi-k2-6", actions: "gpt-oss-120b" },
  corti: { chatIntelligence: "corti-s1", actions: "corti-s1-instant" },
};

export function defaultModelForScope(providerId: string, scope: DefaultableScope): string | null {
  return SCOPE_DEFAULT_MODELS[providerId]?.[scope] ?? null;
}
