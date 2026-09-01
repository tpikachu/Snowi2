import type { SettingsState } from "../stores/settingsStore";

export interface InferenceScopeStoreKeys {
  mode: keyof SettingsState;
  provider: keyof SettingsState;
  model: keyof SettingsState;
  cloudMode?: keyof SettingsState;
  cloudBaseUrl?: keyof SettingsState;
  remoteUrl?: keyof SettingsState;
  customApiKey?: keyof SettingsState;
  disableThinking?: keyof SettingsState;
}

export interface InferenceScopeDefinition {
  storeKeys: InferenceScopeStoreKeys;
  fallbackScope?: string;
}

export const INFERENCE_SCOPES = {
  dictationCleanup: {
    storeKeys: {
      mode: "cleanupMode",
      provider: "cleanupProvider",
      model: "cleanupModel",
      cloudMode: "cleanupCloudMode",
      cloudBaseUrl: "cleanupCloudBaseUrl",
      remoteUrl: "cleanupRemoteUrl",
      customApiKey: "cleanupCustomApiKey",
      disableThinking: "cleanupDisableThinking",
    },
  },
  dictationAgent: {
    storeKeys: {
      mode: "dictationAgentMode",
      provider: "dictationAgentProvider",
      model: "dictationAgentModel",
      cloudMode: "dictationAgentCloudMode",
      cloudBaseUrl: "dictationAgentCloudBaseUrl",
      remoteUrl: "dictationAgentRemoteUrl",
      customApiKey: "dictationAgentCustomApiKey",
      disableThinking: "dictationAgentDisableThinking",
    },
  },
  // Optional override used only when a voice-agent request carries a screen
  // context screenshot. Unset fields resolve to the dictationAgent scope, and
  // the UI offers only cloud/BYOK modes, so remoteUrl is deliberately absent.
  dictationAgentVision: {
    storeKeys: {
      mode: "dictationAgentVisionMode",
      provider: "dictationAgentVisionProvider",
      model: "dictationAgentVisionModel",
      cloudMode: "dictationAgentVisionCloudMode",
      cloudBaseUrl: "dictationAgentVisionCloudBaseUrl",
      customApiKey: "dictationAgentVisionCustomApiKey",
      disableThinking: "dictationAgentVisionDisableThinking",
    },
    fallbackScope: "dictationAgent",
  },
  actions: {
    storeKeys: {
      mode: "actionsMode",
      provider: "actionsProvider",
      model: "actionsModel",
      cloudMode: "actionsCloudMode",
      cloudBaseUrl: "actionsCloudBaseUrl",
      remoteUrl: "actionsRemoteUrl",
      customApiKey: "actionsCustomApiKey",
      disableThinking: "actionsDisableThinking",
    },
    fallbackScope: "dictationCleanup",
  },
  chatIntelligence: {
    storeKeys: {
      mode: "chatAgentMode",
      provider: "chatAgentProvider",
      model: "chatAgentModel",
      cloudMode: "chatAgentCloudMode",
      cloudBaseUrl: "chatAgentCloudBaseUrl",
      remoteUrl: "chatAgentRemoteUrl",
      customApiKey: "chatAgentCustomApiKey",
      disableThinking: "chatAgentDisableThinking",
    },
  },
  // Optional override for the meeting assistant's fast lane — the model that
  // answers Fast questions mid-call, where time-to-first-token is the whole
  // point. Unset fields resolve to chatIntelligence; when the override is off
  // entirely, the fast lane derives a small sibling of the chat model instead
  // (see src/utils/assistFastLane.ts). BYOK providers only, like the vision
  // override, so remoteUrl and the custom-endpoint fields are absent.
  chatFast: {
    storeKeys: {
      mode: "chatFastMode",
      provider: "chatFastProvider",
      model: "chatFastModel",
      cloudMode: "chatFastCloudMode",
      disableThinking: "chatFastDisableThinking",
    },
    fallbackScope: "chatIntelligence",
  },
  dictationTranslation: {
    storeKeys: {
      mode: "translationMode",
      provider: "translationProvider",
      model: "translationModel",
      cloudMode: "translationCloudMode",
      cloudBaseUrl: "translationCloudBaseUrl",
      remoteUrl: "translationRemoteUrl",
      customApiKey: "translationCustomApiKey",
      disableThinking: "translationDisableThinking",
    },
  },
} as const satisfies Record<string, InferenceScopeDefinition>;

export type InferenceScope = keyof typeof INFERENCE_SCOPES;
