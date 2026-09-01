import { useEffect } from "react";
import {
  useSettingsStore,
  selectResolvedLLMConfig,
  selectLLMConfigReady,
  selectResolvedMeetingTranscription,
  BYOK_PROVIDER_KEY_FIELDS,
  type SettingsState,
} from "../stores/settingsStore";
import { useSpeechModelDownloadStatus } from "./useSpeechModelDownloadStatus";

const selectSpeechOk = (state: SettingsState): boolean => {
  const cfg = selectResolvedMeetingTranscription(state);
  // Local and self-hosted setups are covered elsewhere (the download gate on
  // the bar's start button); the one gap a finished onboarding can quietly
  // develop is a cloud provider whose key was later removed.
  if (cfg.transcriptionMode !== "providers") return true;
  if (cfg.cloudTranscriptionProvider === "corti") {
    return state.cortiClientId.trim().length > 0 && state.cortiClientSecret.trim().length > 0;
  }
  const field = BYOK_PROVIDER_KEY_FIELDS[cfg.cloudTranscriptionProvider];
  if (!field) return true;
  const value = state[field];
  return typeof value === "string" ? value.trim().length > 0 : true;
};

// The two AI scopes are published separately so the bar can mirror the Home
// card's capability rows exactly: actions writes the meeting note, and
// chatIntelligence answers the bar's own questions (screen questions included
// — they ride the chat model, there is no separate vision setup).
const selectActionsOk = (state: SettingsState): boolean =>
  selectLLMConfigReady(state, selectResolvedLLMConfig(state, "actions"));

const selectChatOk = (state: SettingsState): boolean =>
  selectLLMConfigReady(state, selectResolvedLLMConfig(state, "chatIntelligence"));

/**
 * Publishes the bar's setup readiness from the control panel window — the
 * one whose settings store is always current, because settings change there.
 * The bar window's own store only reads localStorage once at load, so
 * computing readiness over there shows stale answers; this hook is why the
 * bar's icons react the moment a key or model is saved.
 */
export function useBarStatusPublisher() {
  const speechOk = useSettingsStore(selectSpeechOk);
  const actionsOk = useSettingsStore(selectActionsOk);
  const chatOk = useSettingsStore(selectChatOk);

  // Download state rides the same channel, and for the same reason: the
  // download's progress events only reach the window that started it — this
  // one. The bar's own hooks would hydrate once at mount and then sit
  // frozen; published from here, the bar's percentage moves.
  const speechDownload = useSpeechModelDownloadStatus();
  const download = speechDownload.active;
  const displayName = download?.displayName ?? "";
  const percentage = download ? Math.round(download.percentage) : 0;
  const isInstalling = download?.isInstalling ?? false;
  const downloadActive = download != null;
  const downloadBlocksMeetingStart = speechDownload.blocksMeetingStart;

  useEffect(() => {
    window.electronAPI?.publishBarStatus?.({
      speechOk,
      actionsOk,
      chatOk,
      downloadBlocksMeetingStart,
      download: downloadActive ? { displayName, percentage, isInstalling } : null,
    });
  }, [
    speechOk,
    actionsOk,
    chatOk,
    downloadBlocksMeetingStart,
    downloadActive,
    displayName,
    percentage,
    isInstalling,
  ]);
}
