import modelRegistryData from "../models/modelRegistryData.json";

/**
 * The OpenRouter slice of the model picker.
 *
 * OpenRouter has no catalog of its own in the registry: it fronts hundreds of
 * ids that change weekly, and a static copy would be stale on day one. So the
 * picker offers a short curated slice — the same models the registry already
 * knows under their vendors, addressed by their OpenRouter slugs — and a
 * free-text row for any other id (`ModelPickerChip`). Labels and one-liners
 * come from the vendor's registry entry, so nothing here needs translating.
 *
 * Slugs verified against https://openrouter.ai/api/v1/models on 2026-09-15.
 * OpenRouter writes Anthropic versions with a dot (claude-haiku-4.5) where the
 * registry writes a dash (claude-haiku-4-5); the upstream id is the registry's.
 */
export interface OpenRouterCuratedModel {
  /** The OpenRouter slug sent as the model id. */
  id: string;
  upstreamProvider: string;
  upstreamId: string;
}

export const OPENROUTER_CURATED_MODELS: readonly OpenRouterCuratedModel[] = [
  { id: "openai/gpt-5-mini", upstreamProvider: "openai", upstreamId: "gpt-5-mini" },
  { id: "openai/gpt-5-nano", upstreamProvider: "openai", upstreamId: "gpt-5-nano" },
  { id: "openai/gpt-5.5", upstreamProvider: "openai", upstreamId: "gpt-5.5" },
  { id: "anthropic/claude-sonnet-5", upstreamProvider: "anthropic", upstreamId: "claude-sonnet-5" },
  {
    id: "anthropic/claude-haiku-4.5",
    upstreamProvider: "anthropic",
    upstreamId: "claude-haiku-4-5",
  },
  { id: "anthropic/claude-opus-5", upstreamProvider: "anthropic", upstreamId: "claude-opus-5" },
  { id: "google/gemini-3.5-flash", upstreamProvider: "gemini", upstreamId: "gemini-3.5-flash" },
  {
    id: "google/gemini-2.5-flash-lite",
    upstreamProvider: "gemini",
    upstreamId: "gemini-2.5-flash-lite",
  },
];

export interface OpenRouterPickerModel {
  id: string;
  label: string;
  descriptionKey?: string;
  description?: string;
}

/** The curated slice with the vendor's label and one-liner attached. */
export function openrouterPickerModels(): OpenRouterPickerModel[] {
  return OPENROUTER_CURATED_MODELS.map((entry) => {
    const provider = modelRegistryData.cloudProviders.find((p) => p.id === entry.upstreamProvider);
    const upstream = provider?.models.find((m) => m.id === entry.upstreamId);
    return {
      id: entry.id,
      label: upstream?.name ?? entry.id,
      descriptionKey: upstream?.descriptionKey,
      description: upstream?.description,
    };
  });
}

/** The curated label for a slug, or null for an id typed in by hand. */
export function openrouterModelLabel(modelId: string): string | null {
  const hit = openrouterPickerModels().find((m) => m.id === modelId);
  return hit ? hit.label : null;
}
