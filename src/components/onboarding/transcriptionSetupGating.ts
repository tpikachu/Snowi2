/**
 * Whether the onboarding setup step is complete enough to leave.
 *
 * Extracted from OnboardingFlow's canProceed() so the rule is testable and so
 * the one deliberate loosening is visible: an *active download of a selected
 * local model* counts as complete. The download is main-process-owned and
 * survives navigation, so holding the wizard hostage to bandwidth would gate
 * the remaining steps on nothing the user can act on. A finished-but-failed
 * download simply flips `downloadActive` off and the gate closes again.
 */

export interface TranscriptionSetupKeys {
  openaiApiKey: string;
  groqApiKey: string;
  xaiApiKey: string;
  mistralApiKey: string;
  cortiClientId: string;
  cortiClientSecret: string;
  tinfoilApiKey: string;
}

export interface TranscriptionSetupGate {
  useLocalWhisper: boolean;
  localTranscriptionProvider: string;
  whisperModel: string;
  parakeetModel: string;
  /** The selected local model is on disk. */
  modelDownloaded: boolean;
  /** A whisper/parakeet download is currently running. */
  downloadActive: boolean;
  cloudTranscriptionProvider: string;
  keys: TranscriptionSetupKeys;
}

export function canProceedSetup(gate: TranscriptionSetupGate): boolean {
  if (gate.useLocalWhisper) {
    const modelToCheck =
      gate.localTranscriptionProvider === "nvidia" ? gate.parakeetModel : gate.whisperModel;
    return modelToCheck !== "" && (gate.modelDownloaded || gate.downloadActive);
  }

  const { keys } = gate;
  switch (gate.cloudTranscriptionProvider) {
    case "groq":
      return keys.groqApiKey.trim().length > 0;
    case "xai":
      return keys.xaiApiKey.trim().length > 0;
    case "mistral":
      return keys.mistralApiKey.trim().length > 0;
    case "corti":
      return keys.cortiClientId.trim().length > 0 && keys.cortiClientSecret.trim().length > 0;
    case "tinfoil":
      return keys.tinfoilApiKey.trim().length > 0;
    case "custom":
      // Custom can work without an API key for local endpoints.
      return true;
    case "openai":
    default:
      return keys.openaiApiKey.trim().length > 0;
  }
}
