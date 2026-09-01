import { useEffect, useState } from "react";
import {
  useSettingsStore,
  selectResolvedLLMConfig,
  selectLLMConfigReady,
  selectResolvedMeetingTranscription,
  BYOK_PROVIDER_KEY_FIELDS,
  type SettingsState,
} from "../stores/settingsStore";

export type BarSetupItemId = "microphone" | "speech" | "aiModel";

/**
 * The assistant bar's warning icons: which pieces of setup are still missing.
 * Deliberately coarse — each item answers "will this step of a meeting work?",
 * not "is every related preference filled in".
 */
export function useBarSetupStatus(): BarSetupItemId[] {
  // Microphone: the OS check is authoritative where it exists (macOS); the
  // onboarding grant flag covers platforms whose check always says yes.
  const [micOk, setMicOk] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const access = await window.electronAPI?.checkMicrophoneAccess?.();
        if (cancelled) return;
        if (access && access.granted === false) {
          setMicOk(false);
          return;
        }
        setMicOk(localStorage.getItem("micPermissionGranted") === "true");
      } catch {
        if (!cancelled) setMicOk(true);
      }
    };
    void check();
    const onWake = () => void check();
    window.addEventListener("focus", onWake);
    window.addEventListener("storage", onWake);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onWake);
      window.removeEventListener("storage", onWake);
    };
  }, []);

  // Speech-to-text: the one gap a finished onboarding can still have is a
  // cloud provider whose key was later removed. Local models are covered by
  // the download gate on the Listen button, not here.
  const speechOk = useSettingsStore((state: SettingsState) => {
    const cfg = selectResolvedMeetingTranscription(state);
    if (cfg.transcriptionMode !== "providers") return true;
    if (cfg.cloudTranscriptionProvider === "corti") {
      return state.cortiClientId.trim().length > 0 && state.cortiClientSecret.trim().length > 0;
    }
    const field = BYOK_PROVIDER_KEY_FIELDS[cfg.cloudTranscriptionProvider];
    if (!field) return true;
    const value = state[field];
    return typeof value === "string" ? value.trim().length > 0 : true;
  });

  // The AI that writes meeting summaries — the actions scope.
  const aiOk = useSettingsStore((state: SettingsState) =>
    selectLLMConfigReady(state, selectResolvedLLMConfig(state, "actions"))
  );

  const missing: BarSetupItemId[] = [];
  if (!micOk) missing.push("microphone");
  if (!speechOk) missing.push("speech");
  if (!aiOk) missing.push("aiModel");
  return missing;
}
