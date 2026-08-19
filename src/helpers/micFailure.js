/**
 * One owner for "the microphone did not work" messages.
 *
 * These were previously built inline as hardcoded English in two places
 * (batch and streaming capture), which broke the i18n rule and, worse, told
 * the user nothing they could act on: "your microphones stayed muted" names no
 * device and suggests no fix. Each failure now carries a code that
 * `src/utils/recordingErrors.ts` resolves into a translated string.
 */

/** getUserMedia / capture error names that mean "the input failed", not "the app failed". */
export const MIC_FAILURE_NAMES = new Set([
  "NotAllowedError",
  "PermissionDeniedError",
  "NotFoundError",
  "DevicesNotFoundError",
  "NotReadableError",
  "TrackStartError",
  "MicUnusableError",
]);

const FAILURE_BY_NAME = {
  NotAllowedError: { code: "MIC_PERMISSION_DENIED", key: "permissionDenied" },
  PermissionDeniedError: { code: "MIC_PERMISSION_DENIED", key: "permissionDenied" },
  NotFoundError: { code: "MIC_NOT_FOUND", key: "notFound" },
  DevicesNotFoundError: { code: "MIC_NOT_FOUND", key: "notFound" },
  NotReadableError: { code: "MIC_IN_USE", key: "inUse" },
  TrackStartError: { code: "MIC_IN_USE", key: "inUse" },
  MicUnusableError: { code: "MIC_UNUSABLE", key: "unusable" },
};

const GENERIC = { code: "MIC_ERROR", key: "generic" };

/**
 * @param {Error} error   the failure thrown by the capture path
 * @param {string} [deviceLabel]  the input the user picked, when one is pinned
 * @returns {{code: string, title: string, titleKey: string, messageKey: string, messageParams: object}}
 */
export function describeMicFailure(error, deviceLabel = "") {
  const { code, key } = FAILURE_BY_NAME[error?.name] ?? GENERIC;
  // Only the "nothing worked" case is worth naming a device in; the others are
  // about the system, not about which input was chosen.
  const suffix = key === "unusable" && deviceLabel ? "WithDevice" : "";

  return {
    code,
    // Pre-i18n fallback, used only if the key is ever missing from a locale.
    title: key === "unusable" ? "No Working Microphone" : "Recording Error",
    titleKey: `hooks.audioRecording.micErrors.${key}.title`,
    messageKey: `hooks.audioRecording.micErrors.${key}.description${suffix}`,
    messageParams: {
      device: deviceLabel,
      reason: error?.message ?? "",
    },
  };
}
