// Provider overrides for Actions-scope ReasoningService.processText calls.
// Self-hosted must forward remoteUrl as lanUrl — without it, processText
// would use the dictation-cleanup scope instead of this scope's endpoint.
export function buildActionsOverrides(actions) {
  const mode = actions?.mode;

  if (mode === "self-hosted") {
    return {
      inferenceScope: /** @type {const} */ ("actions"),
      provider: undefined,
      baseUrl: undefined,
      customApiKey: actions?.customApiKey || undefined,
      lanUrl: actions?.remoteUrl || undefined,
    };
  }

  // Local and enterprise must pin their providers too, or processText would
  // use the dictation-cleanup scope when this scope has no route override.
  const provider =
    mode === "local"
      ? "local"
      : mode === "providers" || mode === "enterprise"
        ? actions?.provider || undefined
        : undefined;
  const isCustom = provider === "custom";
  return {
    inferenceScope: /** @type {const} */ ("actions"),
    provider,
    baseUrl: isCustom ? actions?.cloudBaseUrl || undefined : undefined,
    customApiKey: isCustom ? actions?.customApiKey || undefined : undefined,
    lanUrl: undefined,
  };
}
