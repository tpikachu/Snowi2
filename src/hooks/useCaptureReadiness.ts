import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { useSystemAudioPermission } from "./useSystemAudioPermission";
import { useSettingsStore, selectResolvedMeetingTranscription } from "../stores/settingsStore";
import { canManageSystemAudioInApp } from "../utils/systemAudioAccess";

export type ReadinessTone = "ok" | "attention" | "unknown";

/**
 * Microphone access, read directly rather than through `usePermissions`.
 *
 * That hook also chases paste tools and polls accessibility every two seconds
 * on macOS — machinery this panel neither shows nor needs, and which would run
 * for as long as Home is open. Rechecked on window focus so granting the
 * permission in System Settings is reflected when the user comes back.
 */
function useMicrophoneAccess(enabled: boolean) {
  const [micPermissionGranted, setMicPermissionGranted] = useState(true);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const check = () => {
      void Promise.resolve(window.electronAPI?.checkMicrophoneAccess?.())
        .then((result) => {
          if (!cancelled && result) setMicPermissionGranted(result.granted);
        })
        // Optimistic on failure: claiming the microphone is blocked when the
        // check itself broke would send the user to fix a setting that is fine.
        .catch(() => {});
    };
    check();
    window.addEventListener("focus", check);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", check);
    };
  }, [enabled]);

  const openMicPrivacySettings = useCallback(() => {
    void window.electronAPI?.openMicrophoneSettings?.();
  }, []);

  return { micPermissionGranted, openMicPrivacySettings };
}

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
  const { micPermissionGranted, openMicPrivacySettings } = useMicrophoneAccess(enabled);
  const systemAudio = useSystemAudioPermission();
  // The connection flags, not `useUpcomingEvents` — this row only needs to
  // know whether a calendar is attached, and mounting that hook here would
  // fetch and subscribe to events a second time behind the panel that already
  // lists them.
  const gcalCount = useSettingsStore((s) => s.gcalAccounts.length);
  const mcalCount = useSettingsStore((s) => s.mcalAccounts.length);
  const appleCalendarConnected = useSettingsStore((s) => s.appleCalendarConnected);
  const calendarConnected = gcalCount > 0 || mcalCount > 0 || appleCalendarConnected;
  // useShallow is required, not stylistic: the selector builds a fresh object
  // on every call, and Zustand compares snapshots by identity — without it the
  // store reports a change on every render and React loops until it gives up.
  const transcription = useSettingsStore(
    useShallow((state) => selectResolvedMeetingTranscription(state))
  );

  // Pulled out as primitives so the rows below are recomputed when something
  // actually changed. `useSystemAudioPermission` rebuilds its result object
  // every render, so depending on it directly would rebuild the rows every
  // render too, and hand StatusPanel a new array each time.
  const systemAudioGranted = systemAudio.granted;
  const systemAudioMode = systemAudio.mode;
  const requestSystemAudio = systemAudio.request;

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
    const systemAudioActionable = canManageSystemAudioInApp({ mode: systemAudioMode });
    rows.push({
      id: "systemAudio",
      label: t("home.status.systemAudio"),
      detail: systemAudioGranted
        ? t("home.status.systemAudioReady")
        : systemAudioActionable
          ? t("home.status.systemAudioBlocked")
          : t("home.status.systemAudioUnavailable"),
      tone: systemAudioGranted ? "ok" : systemAudioActionable ? "attention" : "unknown",
      action:
        systemAudioGranted || !systemAudioActionable
          ? undefined
          : { label: t("home.status.grant"), run: () => void requestSystemAudio() },
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
    systemAudioGranted,
    systemAudioMode,
    requestSystemAudio,
    transcription,
    calendarConnected,
  ]);
}
