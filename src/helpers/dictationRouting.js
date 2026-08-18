export function resolveModeReachability({ mode, provider, model, isSelfHosted }) {
  if (mode === "self-hosted") return isSelfHosted;

  const hasModel = (model?.trim()?.length ?? 0) > 0;
  if (mode === "local") return hasModel;
  if (mode === "providers" || mode === "enterprise") {
    return !!provider?.trim() && hasModel;
  }
  return false;
}

export function resolveDictationAgentReachability({
  useDictationAgent,
  dictationAgentMode,
  dictationAgentProvider,
  dictationAgentModel,
  isSelfHostedAgent,
}) {
  if (!useDictationAgent) return false;
  return resolveModeReachability({
    mode: dictationAgentMode,
    provider: dictationAgentProvider,
    model: dictationAgentModel,
    isSelfHosted: isSelfHostedAgent,
  });
}

// Picks which model receives a captured screenshot, or drops it. An
// explicitly configured vision override is trusted without a capability check
// (custom and OpenRouter model ids aren't in the registry); an override that
// is toggled on but never configured inherits the agent's own config, so it
// falls through to the base rules rather than forcing an image onto a
// possibly text-only model. Dropping the image always beats failing the
// dictation.
export function resolveAgentImageTarget({
  hasScreenContext,
  visionOverrideActive,
  visionProviderImageWired,
  baseProviderImageWired,
  baseModelSupportsVision,
}) {
  if (!hasScreenContext) {
    return { attach: false, useVisionOverride: false };
  }
  if (visionOverrideActive) {
    // Configured but unable to send images: drop rather than quietly
    // redirecting the screenshot to a model the user didn't choose.
    return visionProviderImageWired
      ? { attach: true, useVisionOverride: true }
      : { attach: false, useVisionOverride: false };
  }
  if (baseProviderImageWired && baseModelSupportsVision) {
    return { attach: true, useVisionOverride: false };
  }
  return { attach: false, useVisionOverride: false };
}

// Decides whether a finished dictation's translation step is reachable. A
// translation recording degrades to cleanup instead of failing: the transcript
// is still a useful dictation without the translation step.
export function resolveDictationTranslationReachability({
  useDictationTranslation,
  translationTargetLanguage,
  translationMode,
  translationProvider,
  translationModel,
  isSelfHostedTranslation,
}) {
  if (!useDictationTranslation) return false;
  if (!translationTargetLanguage?.trim()) return false;
  return resolveModeReachability({
    mode: translationMode,
    provider: translationProvider,
    model: translationModel,
    isSelfHosted: isSelfHostedTranslation,
  });
}

export function resolveModeProvider({ mode, provider }) {
  switch (mode) {
    case "local":
      return "local";
    case "self-hosted":
      return undefined;
    case "providers":
    case "enterprise":
      return provider?.trim() || undefined;
    default:
      return undefined;
  }
}

export function resolveDictationAgentProvider({ dictationAgentMode, dictationAgentProvider }) {
  return resolveModeProvider({
    mode: dictationAgentMode,
    provider: dictationAgentProvider,
  });
}

function resolveModeDisplayProvider(mode, provider) {
  if (mode === "local") return "local";
  if (mode === "self-hosted") return "self-hosted";
  return provider?.trim() || "none";
}

export function resolveDictationAgentDisplayProvider({
  dictationAgentMode,
  dictationAgentProvider,
}) {
  return resolveModeDisplayProvider(dictationAgentMode, dictationAgentProvider);
}

export function resolveTranslationProviderId({ translationMode, translationProvider }) {
  return resolveModeProvider({
    mode: translationMode,
    provider: translationProvider,
  });
}

export function resolveTranslationDisplayProvider({ translationMode, translationProvider }) {
  return resolveModeDisplayProvider(translationMode, translationProvider);
}

// Decides which reasoning path ("translation" | "agent" | "cleanup" | "skip")
// a finished dictation takes. A recording started via the voice agent hotkey
// always takes the agent path — no wake word needed — and never falls back to
// cleanup. A translation recording degrades to cleanup instead: the transcript
// is still a useful dictation without the translation step.
export function resolveDictationRouteKind({
  cleanupReachable,
  agentReachable,
  agentInvoked,
  voiceAgentRequested,
  translationRequested,
  translationReachable,
}) {
  if (translationRequested) {
    if (translationReachable) return "translation";
    return cleanupReachable ? "cleanup" : "skip";
  }
  if (voiceAgentRequested) {
    return agentReachable ? "agent" : "skip";
  }
  if (agentReachable && agentInvoked) {
    return "agent";
  }
  if (cleanupReachable) {
    return "cleanup";
  }
  return "skip";
}
