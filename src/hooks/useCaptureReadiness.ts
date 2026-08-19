import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { usePermissions } from "./usePermissions";
import { useSystemAudioPermission } from "./useSystemAudioPermission";
import { useUpcomingEvents } from "./useUpcomingEvents";
import { useSettingsStore, selectResolvedMeetingTranscription } from "../stores/settingsStore";
import { canManageSystemAudioInApp } from "../utils/systemAudioAccess";

export type ReadinessTone = "ok" | "attention" | "unknown";

export interface ReadinessRow {
  id: "microphone" | "systemAudio" | "transcription" | "calendar";
  label: string;
  /** What is true right now, in the user's terms. */
  detail: string;
  tone: ReadinessTone;
  /** Present only when there is something the user can do about it. */
  action?: { label: string; run: () => void };
}

/**
 * The four things that decide whether the next meeting will actually be
 * captured, answered before it starts rather than discovered afterwards.
 *
 * Deliberately not a health dashboard: every row is something that can stop a
 * recording from working, and a row that is fine says so in one line and
 * offers nothing to click. Anything the user cannot act on does not belong
 * here — it would be noise wearing the same badge as a real problem.
 */
export function useCaptureReadiness(enabled: boolean): ReadinessRow[] {
  const { t } = useTranslation();
  const { micPermissionGranted, openMicPrivacySettings } = usePermissions();
  const systemAudio = useSystemAudioPermission();
  const { isConnected: calendarConnected } = useUpcomingEvents();
  const transcription = useSettingsStore(selectResolvedMeetingTranscription);

  return useMemo(() => {
    if (!enabled) return [];

    const rows: ReadinessRow[] = [];

    rows.push({
      id: "microphone",
      label: t("home.status.microphone"),
      detail: micPermissionGranted
        ? t("home.status.microphoneReady")
        : t("home.status.microphoneBlocked"),
      tone: micPermissionGranted ? "ok" : "attention",
      action: micPermissionGranted
        ? undefined
        : { label: t("home.status.openSettings"), run: () => void openMicPrivacySettings() },
    });

    // Only claimed as a problem where the app can actually do something about
    // it: on platforms that capture loopback without a grant there is nothing
    // to fix, and a warning there would be permanently wrong.
    const systemAudioActionable = canManageSystemAudioInApp(systemAudio);
    rows.push({
      id: "systemAudio",
      label: t("home.status.systemAudio"),
      detail: systemAudio.granted
        ? t("home.status.systemAudioReady")
        : systemAudioActionable
          ? t("home.status.systemAudioBlocked")
          : t("home.status.systemAudioUnavailable"),
      tone: systemAudio.granted ? "ok" : systemAudioActionable ? "attention" : "unknown",
      action:
        systemAudio.granted || !systemAudioActionable
          ? undefined
          : { label: t("home.status.grant"), run: () => void systemAudio.request() },
    });

    // Names the engine that will run, so "why is this slow / why did this go
    // to a server" is answerable before the meeting rather than after.
    const isLocal = transcription.useLocalWhisper;
    const localName =
      transcription.localTranscriptionProvider === "nvidia"
        ? transcription.parakeetModel || t("home.status.transcriptionUnset")
        : transcription.whisperModel || t("home.status.transcriptionUnset");
    const cloudName =
      transcription.cloudTranscriptionModel ||
      transcription.cloudTranscriptionProvider ||
      t("home.status.transcriptionUnset");
    rows.push({
      id: "transcription",
      label: t("home.status.transcription"),
      detail: isLocal
        ? t("home.status.transcriptionLocal", { model: localName })
        : t("home.status.transcriptionCloud", { model: cloudName }),
      tone: "ok",
    });

    rows.push({
      id: "calendar",
      label: t("home.status.calendar"),
      detail: calendarConnected
        ? t("home.status.calendarConnected")
        : t("home.status.calendarDisconnected"),
      // Not a fault: meetings work without a calendar, they just arrive
      // unannounced. Flagging it red would cry wolf.
      tone: calendarConnected ? "ok" : "unknown",
    });

    return rows;
  }, [
    enabled,
    t,
    micPermissionGranted,
    openMicPrivacySettings,
    systemAudio,
    transcription,
    calendarConnected,
  ]);
}
