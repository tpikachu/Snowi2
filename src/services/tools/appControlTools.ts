import type { ToolDefinition, ToolResult } from "./ToolRegistry";
import { useSettingsStore, selectResolvedLLMConfig } from "../../stores/settingsStore";
import { buildAppSettingsSnapshot } from "../../utils/appSettingsSnapshot";
import { validateHotkeyForSlot } from "../../utils/hotkeyValidation";
import { DICTATION_ENABLED } from "../../config/features";
import { SETTINGS_SECTIONS, resolveSectionId } from "../../components/settings/settingsNav";
import i18n from "../../i18n";

/**
 * The agent's hands on the app itself: read the current setup, change a
 * hotkey, open a Settings page. The client's ask was "the global agent should
 * be able to control the app" — these three cover what a user actually asks
 * for ("what's my meeting shortcut?", "change it to Ctrl+Alt+M", "open the
 * hotkey settings") without ever touching a credential.
 *
 * Every mutation goes through the SAME code path the Settings UI uses (the
 * store's registered setters, the meeting-hotkey IPC), so registration,
 * rollback-on-failure and persistence behave identically whether a human or
 * the agent moved the control.
 */

interface HotkeySlotDef {
  /** i18n key of the slot's label — the same one the Settings page shows. */
  labelKey: string;
  read: () => string;
  write: (hotkey: string) => Promise<{ ok: boolean; message?: string }>;
}

const registeredSetterSlot = (
  labelKey: string,
  read: () => string,
  setter: () => (hotkey: string) => Promise<boolean>
): HotkeySlotDef => ({
  labelKey,
  read,
  write: async (hotkey) => ({ ok: await setter()(hotkey) }),
});

/** The dictation trio only exists while the feature is on — a tool offering a
 *  slot the hotkey manager never registers would "succeed" into a void. */
const HOTKEY_SLOTS: Record<string, HotkeySlotDef> = {
  meeting: {
    labelKey: "settingsPage.general.meetingHotkey.title",
    read: () => useSettingsStore.getState().meetingKey,
    write: async (hotkey) => {
      const result = await window.electronAPI?.registerMeetingHotkey?.(hotkey);
      if (!result?.success) return { ok: false, message: result?.message };
      useSettingsStore.getState().setMeetingKey(hotkey);
      return { ok: true };
    },
  },
  chatAgent: registeredSetterSlot(
    "agentMode.settings.hotkey",
    () => useSettingsStore.getState().chatAgentKey,
    () => (hotkey) => useSettingsStore.getState().setChatAgentKey(hotkey)
  ),
  ...(DICTATION_ENABLED
    ? {
        dictation: {
          labelKey: "settingsPage.general.hotkey.title",
          read: () => useSettingsStore.getState().dictationKey,
          write: async (hotkey) => {
            useSettingsStore.getState().setDictationKey(hotkey);
            return { ok: true };
          },
        },
        voiceAgent: registeredSetterSlot(
          "settingsPage.general.voiceAgentHotkey.title",
          () => useSettingsStore.getState().voiceAgentKey,
          () => (hotkey) => useSettingsStore.getState().setVoiceAgentKey(hotkey)
        ),
        translation: registeredSetterSlot(
          "settingsPage.general.translationHotkey.title",
          () => useSettingsStore.getState().translationKey,
          () => (hotkey) => useSettingsStore.getState().setTranslationKey(hotkey)
        ),
      }
    : {}),
};

const SLOT_NAMES = Object.keys(HOTKEY_SLOTS);
const SECTION_IDS = SETTINGS_SECTIONS.map((section) => section.id);

export const getAppSettingsTool: ToolDefinition = {
  name: "get_app_settings",
  description:
    "Read Snowy's own current settings: hotkeys (with which slots exist), " +
    "appearance (theme, UI language, text size), which AI provider and model " +
    "each feature uses, and notification preferences. Never contains API " +
    "keys or other credentials. Use it before answering questions about how " +
    "the app is configured or before changing a hotkey.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,

  async execute(): Promise<ToolResult> {
    const state = useSettingsStore.getState();
    const pick = (scope: "chatIntelligence" | "actions") => {
      const config = selectResolvedLLMConfig(state, scope);
      return { mode: config.mode, provider: config.provider, model: config.model };
    };
    const snapshot = buildAppSettingsSnapshot({
      hotkeys: {
        dictation: state.dictationKey,
        voiceAgent: state.voiceAgentKey,
        translation: state.translationKey,
        meeting: state.meetingKey,
        chatAgent: state.chatAgentKey,
        activationMode: state.activationMode,
      },
      dictationEnabled: DICTATION_ENABLED,
      appearance: {
        theme: state.theme,
        uiLanguage: state.uiLanguage,
        uiTextScale: state.uiTextScale,
      },
      aiModels: { chatIntelligence: pick("chatIntelligence"), actions: pick("actions") },
      notifications: { meetingDetection: state.notifyMeetingDetection },
    });
    return {
      success: true,
      data: snapshot,
      displayText: i18n.t("agentMode.tools.appSettingsRead"),
    };
  },
};

export const setHotkeyTool: ToolDefinition = {
  name: "set_hotkey",
  description:
    `Change one of Snowy's global hotkeys. Slots: ${SLOT_NAMES.join(", ")}. ` +
    "The hotkey is an Electron accelerator such as 'Control+Shift+M' or 'F8'; " +
    "pass an empty string to unbind the slot. The change is validated against " +
    "the other slots and takes effect immediately. Confirm the exact " +
    "combination with the user before calling this.",
  parameters: {
    type: "object",
    properties: {
      slot: { type: "string", enum: SLOT_NAMES, description: "Which hotkey to change" },
      hotkey: {
        type: "string",
        description: "The new accelerator (e.g. 'Control+Shift+M'), or '' to unbind",
      },
    },
    required: ["slot", "hotkey"],
    additionalProperties: false,
  },
  readOnly: false,

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const slotName = String(args.slot ?? "");
    const hotkey = String(args.hotkey ?? "").trim();
    const slot = HOTKEY_SLOTS[slotName];
    if (!slot) {
      return {
        success: false,
        data: null,
        displayText: `Unknown hotkey slot "${slotName}". Slots: ${SLOT_NAMES.join(", ")}`,
      };
    }

    // An empty hotkey is an explicit unbind and skips format validation.
    if (hotkey) {
      const otherSlots: Record<string, string> = {};
      for (const [name, def] of Object.entries(HOTKEY_SLOTS)) {
        if (name !== slotName) otherSlots[def.labelKey] = def.read();
      }
      const error = validateHotkeyForSlot(hotkey, otherSlots, i18n.t);
      if (error) return { success: false, data: null, displayText: error };
    }

    const result = await slot.write(hotkey);
    if (!result.ok) {
      return {
        success: false,
        data: null,
        displayText: result.message || i18n.t("hooks.hotkeyRegistration.errors.failedToRegister"),
      };
    }
    const label = i18n.t(slot.labelKey);
    return {
      success: true,
      data: { slot: slotName, hotkey: hotkey || null },
      displayText: hotkey
        ? i18n.t("agentMode.tools.hotkeySet", { label, hotkey })
        : i18n.t("agentMode.tools.hotkeyCleared", { label }),
    };
  },
};

export const openSettingsTool: ToolDefinition = {
  name: "open_settings",
  description:
    "Open Snowy's Settings window for the user, at a named section. " +
    `Sections: ${SECTION_IDS.join(", ")}. Use it to take the user to the ` +
    "control you are talking about — after changing a hotkey, or when a " +
    "change is better made by hand.",
  parameters: {
    type: "object",
    properties: {
      section: {
        type: "string",
        enum: SECTION_IDS,
        description: "The settings section to open (defaults to general)",
      },
      panel: {
        type: "string",
        description: "Optional sub-panel id within the section (e.g. 'chatIntelligence')",
      },
    },
    additionalProperties: false,
  },
  readOnly: false,

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const section = resolveSectionId(typeof args.section === "string" ? args.section : undefined);
    const panel = typeof args.panel === "string" && args.panel ? args.panel : undefined;
    await window.electronAPI?.openControlPanel?.({
      settings: { section, ...(panel ? { panel } : {}) },
    });
    const sectionDef = SETTINGS_SECTIONS.find((entry) => entry.id === section);
    const label = sectionDef ? i18n.t(sectionDef.labelKey) : section;
    return {
      success: true,
      data: { section, panel: panel ?? null },
      displayText: i18n.t("agentMode.tools.settingsOpened", { section: label }),
    };
  },
};
