import { TFunction } from "i18next";

type RecordingError = {
  code?: string;
  title: string;
  description?: string;
  /** i18n key for the title; wins over `title` when the error carries one. */
  titleKey?: string;
  messageKey?: string;
  /** Interpolation values for `titleKey` / `messageKey`. */
  messageParams?: Record<string, unknown>;
  /** Toast variant; defaults to destructive for genuine failures. */
  variant?: "default" | "destructive";
};

export function getRecordingErrorTitle(error: RecordingError, t: TFunction): string {
  if (error.code?.startsWith("SELECTION_EDIT_")) {
    return t("hooks.audioRecording.selectionEditing.notAppliedTitle");
  }
  if (error.code === "NETWORK_ERROR") return t(error.title);
  if (error.code === "AUTH_EXPIRED" || error.code === "AUTH_REQUIRED") {
    return t("hooks.audioRecording.errorTitles.sessionExpired");
  }
  if (error.code === "OFFLINE") return t("hooks.audioRecording.errorTitles.offline");
  if (error.code === "AGENT_REASONING_FAILED") {
    return t("hooks.audioRecording.errorTitles.agentUnavailable");
  }
  if (error.code === "SCREEN_CONTEXT_SKIPPED") {
    return t("hooks.audioRecording.errorTitles.screenContextSkipped");
  }
  if (error.code === "LIMIT_REACHED")
    return t("hooks.audioRecording.errorTitles.dailyLimitReached");
  if (error.code === "PROVIDER_RATE_LIMITED")
    return t("hooks.audioRecording.errorTitles.providerRateLimited");
  // Errors that name their own key (microphone failures) translate themselves;
  // `title` stays as the fallback for a key that has gone missing.
  if (error.titleKey) {
    return t(error.titleKey, { ...error.messageParams, defaultValue: error.title });
  }
  return error.title;
}

export function getRecordingErrorDescription(error: RecordingError, t: TFunction): string {
  if (error.messageKey) {
    return t(error.messageKey, { ...error.messageParams, defaultValue: error.description ?? "" });
  }
  return error.description ?? "";
}
