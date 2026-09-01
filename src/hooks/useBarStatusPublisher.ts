import { useEffect } from "react";
import {
  useSettingsStore,
  selectResolvedLLMConfig,
  selectLLMConfigReady,
  selectResolvedMeetingTranscription,
  BYOK_PROVIDER_KEY_FIELDS,
  type SettingsState,
} from "../stores/settingsStore";

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
  useEffect(() => {
    window.electronAPI?.publishBarStatus?.({ speechOk, actionsOk, chatOk });
  }, [speechOk, actionsOk, chatOk]);
}
