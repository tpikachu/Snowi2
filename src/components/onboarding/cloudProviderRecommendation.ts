/**
 * Which cloud transcription provider to put forward during onboarding.
 *
 * The audience is someone who has never bought an API key and cannot rank six
 * vendors; the badge exists so the grid has an obvious first click. The logic
 * is deliberately shallow: OpenAI unless the person told us they work in
 * healthcare, in which case Corti (clinical transcription, HIPAA posture) —
 * the same gate FinishStep uses for its Corti pitch.
 */

// Mirrors USE_CASE_IDS.healthcare in ./useCases. Kept as a literal so this
// module has no React/icon imports and stays loadable from plain node tests.
const HEALTHCARE_USE_CASE = "healthcare";

/**
 * The providers onboarding shows as friendly cards, in display order.
 * "custom" is deliberately absent — a base-URL form is an Advanced concern.
 */
export const FRIENDLY_CLOUD_PROVIDERS = [
  "openai",
  "groq",
  "mistral",
  "xai",
  "corti",
  "tinfoil",
] as const;

export function recommendCloudProvider(useCases: string[], availableProviderIds: string[]): string {
  if (useCases.includes(HEALTHCARE_USE_CASE) && availableProviderIds.includes("corti")) {
    return "corti";
  }
  if (availableProviderIds.includes("openai")) {
    return "openai";
  }
  return availableProviderIds[0] ?? "openai";
}

/**
 * Display order for the onboarding grid: the recommended provider first, the
 * rest in the fixed friendly order. Providers missing from the registry are
 * dropped rather than rendered as dead cards.
 */
export function orderCloudProviders(
  availableProviderIds: string[],
  recommendedId: string
): string[] {
  const available: string[] = FRIENDLY_CLOUD_PROVIDERS.filter((id) =>
    availableProviderIds.includes(id)
  );
  return [recommendedId, ...available.filter((id) => id !== recommendedId)].filter((id) =>
    available.includes(id)
  );
}
