/**
 * Where each BYOK provider hands out API keys, plus any qualifier worth
 * showing before the user commits to one. Shared by the Settings key panel
 * and the model-selection editors, so the story is written once.
 */
export const CLOUD_PROVIDER_KEY_LINKS: Record<string, { url: string; noteKey?: string }> = {
  openai: { url: "https://platform.openai.com/api-keys" },
  anthropic: { url: "https://console.anthropic.com/settings/keys" },
  gemini: { url: "https://aistudio.google.com/app/api-keys" },
  groq: { url: "https://console.groq.com/keys" },
  openrouter: { url: "https://openrouter.ai/keys" },
  tinfoil: { url: "https://tinfoil.sh/inference" },
  corti: { url: "https://www.corti.ai/", noteKey: "reasoning.corti.euOnly" },
};
