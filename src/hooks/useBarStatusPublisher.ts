import { useEffect } from "react";
import {
  useSettingsStore,
  selectResolvedLLMConfig,
  selectLLMConfigReady,
  selectMeetingSpeechReadiness,
  type SettingsState,
} from "../stores/settingsStore";
import { useSpeechModelDownloadStatus } from "./useSpeechModelDownloadStatus";

// Local and self-hosted setups are covered elsewhere (the download gate on
// the bar's start button); the gap a finished onboarding can quietly develop
// is a cloud provider whose key was never entered or later removed. One
// predicate with Home's transcription row, so the two never disagree.
const selectSpeechOk = (state: SettingsState): boolean =>
  selectMeetingSpeechReadiness(state) === "ready";

// One model answers the bar's questions and writes the meeting note; the
// wire still carries both booleans, from the same answer.
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
  const chatOk = useSettingsStore(selectChatOk);
  const actionsOk = chatOk;

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
