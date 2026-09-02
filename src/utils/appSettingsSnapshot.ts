/**
 * The app-settings snapshot the chat agent's get_app_settings tool returns.
 *
 * Pure and narrow on purpose: the input carries exactly the fields the
 * snapshot may contain — never a whole settings state or a resolved LLM
 * config, both of which hold API keys. A secret cannot leak through this
 * module because no secret can arrive here.
 */

export interface HotkeySnapshotInput {
  dictation: string;
  voiceAgent: string;
  translation: string;
  meeting: string;
  chatAgent: string;
  activationMode: string;
}

export interface ModelScopeSnapshot {
  /** "local" | "cloud" | "byok" — never credentials. */
  mode: string;
  provider: string;
  model: string;
}

export interface AppSettingsSnapshotInput {
  hotkeys: HotkeySnapshotInput;
  /** Dictation is feature-gated; its three hotkey slots follow the gate. */
  dictationEnabled: boolean;
  appearance: {
    theme: string;
    uiLanguage: string;
    uiTextScale: string;
  };
  aiModels: Record<string, ModelScopeSnapshot>;
  notifications: {
    meetingDetection: boolean;
  };
}

const describeHotkey = (value: string) => (value.trim() ? value : "not set");

/** The object the model reads. Every field is a plain string or boolean. */
export function buildAppSettingsSnapshot(input: AppSettingsSnapshotInput) {
  const hotkeys: Record<string, string> = {
    meeting: describeHotkey(input.hotkeys.meeting),
    chatAgent: describeHotkey(input.hotkeys.chatAgent),
  };
  if (input.dictationEnabled) {
    hotkeys.dictation = describeHotkey(input.hotkeys.dictation);
    hotkeys.voiceAgent = describeHotkey(input.hotkeys.voiceAgent);
    hotkeys.translation = describeHotkey(input.hotkeys.translation);
    hotkeys.activationMode = input.hotkeys.activationMode;
  }

  return {
    hotkeys,
    appearance: {
      theme: input.appearance.theme,
      uiLanguage: input.appearance.uiLanguage,
      textSize: input.appearance.uiTextScale,
    },
    aiModels: Object.fromEntries(
      Object.entries(input.aiModels).map(([scope, config]) => [
        scope,
        { mode: config.mode, provider: config.provider, model: config.model },
      ])
    ),
    notifications: { ...input.notifications },
  };
}
