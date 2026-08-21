import type { SettingsDeepLink } from "../stores/settingsNavigationStore";

/**
 * Failures the user can only fix in Settings, and where that fix lives.
 *
 * Producers name a remedy; only this file knows the route. An error raised in
 * the main process or a store has no business knowing that note formatting is
 * configured under Language Models — and when the settings IA moves, it should
 * move in one place rather than in every error path.
 */
export type SettingsRemedy =
  | "configureActions"
  | "configureChatIntelligence"
  | "configureMeetingTranscription"
  | "configureUploadTranscription"
  | "configureDictationTranscription";

export const SETTINGS_REMEDIES: Record<SettingsRemedy, SettingsDeepLink> = {
  configureActions: { section: "llms", panel: "actions" },
  configureChatIntelligence: { section: "llms", panel: "chatIntelligence" },
  configureMeetingTranscription: { section: "speechToText", panel: "noteRecording" },
  configureUploadTranscription: { section: "speechToText", panel: "upload" },
  configureDictationTranscription: { section: "speechToText", panel: "dictation" },
};

/** Which transcription surface an error came from, so it lands on that tab. */
export type TranscriptionScope = "meeting" | "upload" | "dictation";

const TRANSCRIPTION_REMEDIES: Record<TranscriptionScope, SettingsRemedy> = {
  meeting: "configureMeetingTranscription",
  upload: "configureUploadTranscription",
  dictation: "configureDictationTranscription",
};

/**
 * Failure codes that mean "nothing is wrong with the audio, the feature was
 * never set up". Retrying these does nothing, which is what separates them
 * from a network blip or a bad file.
 */
const CONFIGURATION_CODES = new Set([
  "CUSTOM_ENDPOINT_INVALID",
  "TRANSCRIPTION_NOT_CONFIGURED",
  "MISSING_API_KEY",
  "MODEL_NOT_DOWNLOADED",
  // The local inference runtime is missing. It reads like a broken install,
  // but the fix is in Settings either way: pick a cloud provider, or download
  // the local model that ships the runtime.
  "LLAMASERVER_NOT_FOUND",
  "MODEL_NOT_FOUND",
]);

/**
 * Errors raised in the main process as bare `new Error(...)` — there are a few
 * dozen of them and they predate any code. Narrow on purpose: a false positive
 * sends the user to a settings page that will not help, so this matches only
 * the phrasings those throw sites actually use.
 */
const CONFIGURATION_MESSAGES = [
  /\bnot configured\b/i,
  /\bnot downloaded\b/i,
  /\bno api key\b/i,
  /\badd (?:your|them|the) (?:key|credentials)\b/i,
  // "llama-server binary not found. Please ensure the app is installed
  // correctly." — thrown with a code, but the code is lost whenever the error
  // crosses IPC as a plain message. Scoped to a named binary so this cannot
  // match an unrelated "file not found".
  /\b(?:llama-server|whisper-server|sherpa-onnx)\b[^.]*\bnot found\b/i,
];

interface FailureLike {
  code?: string;
  message?: string;
}

/** True when the failure is a missing setup rather than a runtime problem. */
export function isConfigurationFailure(failure: unknown): boolean {
  if (!failure) return false;
  const { code, message } = (failure as FailureLike) ?? {};
  if (code && CONFIGURATION_CODES.has(code)) return true;
  if (typeof message !== "string" || !message.trim()) return false;
  return CONFIGURATION_MESSAGES.some((pattern) => pattern.test(message));
}

/**
 * The remedy for a transcription failure, or null when the failure is not a
 * configuration problem and a Configure button would be a dead end.
 */
export function transcriptionRemedy(
  scope: TranscriptionScope,
  failure: unknown
): SettingsRemedy | null {
  return isConfigurationFailure(failure) ? TRANSCRIPTION_REMEDIES[scope] : null;
}

/** Which model-backed feature an error came from, so it lands on that tab. */
export type LlmScope = "actions" | "chatIntelligence";

const LLM_REMEDIES: Record<LlmScope, SettingsRemedy> = {
  actions: "configureActions",
  chatIntelligence: "configureChatIntelligence",
};

/**
 * The remedy for a model failure, or null when the model was reachable and
 * something else went wrong — a rate limit or a network blip is worth
 * retrying, and a Configure button there is a dead end.
 */
export function llmRemedy(scope: LlmScope, failure: unknown): SettingsRemedy | null {
  return isConfigurationFailure(failure) ? LLM_REMEDIES[scope] : null;
}

export function remedyTarget(remedy: SettingsRemedy): SettingsDeepLink {
  return SETTINGS_REMEDIES[remedy];
}
