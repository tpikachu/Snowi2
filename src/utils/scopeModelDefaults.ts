/**
 * The model the app starts on the moment a provider key arrives.
 *
 * One model serves everything intelligent (client direction, 2026-09-22):
 * chat, the cue card's answers, the meeting write-up, the note title and the
 * follow-up email. Until then chat and write-ups were two scopes with two
 * defaults, write-ups on the cheapest one — a split that showed nowhere but
 * in write-up quality. Entering an API key IS the whole setup — Settings
 * never asks for a model — so each provider names its balanced everyday
 * model here; the meeting assistant's fast lane derives the small sibling on
 * its own (assistFastLane.ts).
 *
 * A key arriving applies the default only when the model cannot currently
 * serve (`applyDefaultModelsForNewKey` in settingsStore): a model someone
 * picked, on any provider whose key is present, is never overridden by
 * adding another key. Choosing a provider card in Settings
 * (`setCoreCloudProvider`) is the deliberate switch. OpenRouter's entry is a
 * slug from the curated slice in `src/config/openrouterModels.ts`; `custom`
 * has no entry — there is nothing safe to default to on someone else's model
 * list.
 *
 * Pure — no store, no Electron — so the mapping is testable, and the test can
 * hold every id here against the model registry.
 */

const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-5-mini",
  anthropic: "claude-sonnet-5",
  gemini: "gemini-3.5-flash",
  groq: "openai/gpt-oss-120b",
  tinfoil: "kimi-k2-6",
  corti: "corti-s1",
  openrouter: "openai/gpt-5-mini",
};

export function defaultModelForProvider(providerId: string): string | null {
  return DEFAULT_MODELS[providerId] ?? null;
}
