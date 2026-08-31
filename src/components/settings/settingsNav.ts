/**
 * The settings information architecture, in one place.
 *
 * Three kinds of navigation live here and they are deliberately distinct:
 *
 *  - `sections`  the six top-level surfaces. Their IDs are load-bearing:
 *                deep links from elsewhere in the app resolve to them through
 *                `SECTION_ALIASES`, so they must not be renamed.
 *  - `panels`    real sub-surfaces with their own state (Speech-to-Text and
 *                Language Models). Only one is mounted-and-visible at a time;
 *                switching them is a navigation, not a scroll.
 *  - `anchors`   scroll targets inside a single scrolling section. Every group
 *                rendered by `SettingsGroup` registers one.
 *
 * `SETTINGS_SEARCH_INDEX` maps user-visible labels onto those three, so the
 * search field in the nav pane can only ever point at something that exists.
 */

import type React from "react";
import {
  CALENDAR_ENABLED,
  DICTATION_ENABLED,
  DICTATION_SETTINGS_IDS,
  UPLOAD_ENABLED,
  UPLOAD_SETTINGS_IDS,
} from "../../config/features";
import {
  ListChecks,
  Brain,
  FileAudio,
  Keyboard,
  Languages,
  MessageSquare,
  Mic,
  Shield,
  Sliders,
  Sparkles,
  Upload,
  Wand2,
  Wrench,
} from "lucide-react";

export type SettingsSectionType =
  "general" | "hotkeys" | "speechToText" | "llms" | "privacyData" | "system";

/** DOM id a `SettingsGroup` publishes for its anchor. */
export function settingsGroupDomId(id: string): string {
  return `settings-group-${id}`;
}

export type SpeechTab = "dictation" | "noteRecording" | "upload";

export type LlmTab =
  "dictationCleanup" | "dictationAgent" | "dictationTranslation" | "actions" | "chatIntelligence";

const ALL_SPEECH_TABS: readonly SpeechTab[] = ["dictation", "noteRecording", "upload"] as const;

/**
 * Hidden features take their settings with them: a panel for a surface the user
 * cannot reach is a dead end, and an anchor pointing at an unrendered group
 * would leave the nav pane with a link to nothing.
 */
export const isVisibleEntry = (id: string) =>
  (DICTATION_ENABLED || !DICTATION_SETTINGS_IDS.has(id)) &&
  (UPLOAD_ENABLED || !UPLOAD_SETTINGS_IDS.has(id));

export const SPEECH_TABS: readonly SpeechTab[] = ALL_SPEECH_TABS.filter(isVisibleEntry);

// Same order as the panel list below, and for the same reason.
const ALL_LLM_TABS: readonly LlmTab[] = [
  "actions",
  "chatIntelligence",
  "dictationCleanup",
  "dictationAgent",
  "dictationTranslation",
] as const;

export const LLM_TABS: readonly LlmTab[] = ALL_LLM_TABS.filter(isVisibleEntry);

export const SPEECH_TAB_STORAGE_KEY = "settings.speechToTextTab";
export const LLM_TAB_STORAGE_KEY = "settings.llmsTab";

/**
 * The old AI Models sidebar had four items (transcription, meetings,
 * intelligence, agentMode) — they now collapse into two: speechToText + llms.
 * Legacy deep-links land on the matching sub-panel via `LEGACY_SUB_TAB`.
 */
export const SECTION_ALIASES: Record<string, SettingsSectionType> = {
  aiModels: "llms",
  agentConfig: "llms",
  agentMode: "llms",
  intelligence: "llms",
  meetings: "llms",
  prompts: "llms",
  transcription: "speechToText",
  uploadTranscription: "speechToText",
  softwareUpdates: "system",
  privacy: "privacyData",
  permissions: "privacyData",
  developer: "system",
  // Cloud-era sections that no longer exist; land deep links somewhere sane.
  account: "general",
  plansBilling: "general",
  workspace: "general",
};

export const LEGACY_SUB_TAB: Record<string, string> = {
  transcription: "dictation",
  uploadTranscription: "upload",
  meetings: "actions",
  intelligence: "dictationCleanup",
  agentMode: "chatIntelligence",
  agentConfig: "chatIntelligence",
  aiModels: "dictationCleanup",
  prompts: "dictationCleanup",
};

export function resolveSectionId(section: string | undefined): SettingsSectionType {
  if (!section) return "general";
  return (SECTION_ALIASES[section] ?? section) as SettingsSectionType;
}

export interface ResolvedDeepLink {
  section: SettingsSectionType;
  /** Set only when the link named a panel that section actually has. */
  speechTab?: SpeechTab;
  llmTab?: LlmTab;
}

/**
 * Where a deep link lands: a section, plus the sub-panel to open with it.
 *
 * A panel is only returned when the resolved section really has it, because the
 * caller's fallback is a *stored* tab from an earlier visit — so a link naming a
 * panel that does not exist, or one belonging to a different section, would not
 * land on some neutral default but on wherever the user happened to be last.
 */
export function resolveDeepLink(section: string, panel?: string): ResolvedDeepLink {
  const resolved = resolveSectionId(section);
  const subTab = panel ?? LEGACY_SUB_TAB[section];
  if (!subTab) return { section: resolved };
  if (resolved === "speechToText" && SPEECH_TABS.includes(subTab as SpeechTab)) {
    return { section: resolved, speechTab: subTab as SpeechTab };
  }
  if (resolved === "llms" && LLM_TABS.includes(subTab as LlmTab)) {
    return { section: resolved, llmTab: subTab as LlmTab };
  }
  return { section: resolved };
}

type IconComponent = React.ComponentType<{ className?: string; size?: number }>;

export interface SettingsPanelDef {
  id: string;
  labelKey: string;
  icon: IconComponent;
}

export interface SettingsAnchorDef {
  /** Matches the `id` passed to `<SettingsGroup>`. */
  id: string;
  labelKey: string;
}

export interface SettingsSectionDef {
  id: SettingsSectionType;
  labelKey: string;
  descriptionKey: string;
  icon: IconComponent;
  groupKey: string;
  /** Sub-surfaces with their own state. Mutually exclusive with `anchors`. */
  panels?: SettingsPanelDef[];
  /** Scroll targets inside this section. */
  anchors?: SettingsAnchorDef[];
  /**
   * Wide windows lay these sections out in two balanced columns; the model
   * pickers in speechToText / llms need the full measure, so they opt out.
   */
  twoColumn?: boolean;
}

const ALL_SETTINGS_SECTIONS: SettingsSectionDef[] = [
  {
    id: "general",
    labelKey: "settingsModal.sections.general.label",
    descriptionKey: "settingsModal.sections.general.description",
    icon: Sliders,
    groupKey: "settingsModal.groups.app",
    twoColumn: true,
    anchors: [
      { id: "appearance", labelKey: "settingsPage.general.appearance.title" },
      { id: "language", labelKey: "settings.language.sectionTitle" },
      { id: "sound", labelKey: "settingsPage.general.soundEffects.title" },
      { id: "notifications", labelKey: "settingsPage.general.notifications.title" },
      { id: "clipboard", labelKey: "settingsPage.general.clipboard.title" },
      { id: "noteFiles", labelKey: "settings.noteFiles.title" },
      { id: "floatingIcon", labelKey: "settingsPage.general.floatingIcon.title" },
      { id: "startup", labelKey: "settingsPage.general.startup.title" },
      { id: "microphone", labelKey: "settingsPage.general.microphone.title" },
      { id: "dictionary", labelKey: "settingsPage.dictionary.autoLearnTitle" },
      { id: "waylandPaste", labelKey: "settingsPage.general.waylandPaste.title" },
    ],
  },
  {
    id: "hotkeys",
    labelKey: "settingsModal.sections.hotkeys.label",
    descriptionKey: "settingsModal.sections.hotkeys.description",
    icon: Keyboard,
    groupKey: "settingsModal.groups.app",
    twoColumn: true,
    anchors: [
      { id: "dictationHotkey", labelKey: "settingsPage.general.hotkey.title" },
      { id: "voiceAgentHotkey", labelKey: "settingsPage.general.voiceAgentHotkey.title" },
      { id: "translationHotkey", labelKey: "settingsPage.general.translationHotkey.title" },
      { id: "meetingHotkey", labelKey: "settingsPage.general.meetingHotkey.title" },
      { id: "chatAgentHotkey", labelKey: "agentMode.settings.hotkey" },
    ],
  },
  {
    id: "speechToText",
    labelKey: "settingsModal.sections.speechToText.label",
    descriptionKey: "settingsModal.sections.speechToText.description",
    icon: Mic,
    groupKey: "settingsModal.groups.aiModels",
    panels: [
      { id: "dictation", labelKey: "settingsPage.speechToText.tabs.dictation", icon: Mic },
      {
        id: "noteRecording",
        labelKey: "settingsPage.speechToText.tabs.noteRecording",
        icon: FileAudio,
      },
      { id: "upload", labelKey: "settingsPage.speechToText.tabs.upload", icon: Upload },
    ],
  },
  {
    id: "llms",
    labelKey: "settingsModal.sections.llms.label",
    descriptionKey: "settingsModal.sections.llms.description",
    icon: Brain,
    groupKey: "settingsModal.groups.aiModels",
    // Ordered by what this app is. Actions and Chat are two of the three
    // things Snowy does — the third, transcription, has its own section — and
    // the dictation trio below them is the smaller, older surface.
    //
    // `actions` was called `noteFormatting` until it became clear that note
    // formatting is not a peer of Chat but one of the things Actions does:
    // writing up a meeting *is* the built-in Generate Notes action. A stored
    // `noteFormatting` tab id is rewritten by migrateActionsScopeKeys, and any
    // that escapes it fails the LLM_TABS membership check in SettingsModal and
    // lands on the first tab — which is this one.
    panels: [
      { id: "actions", labelKey: "settingsPage.llms.tabs.actions", icon: ListChecks },
      {
        id: "chatIntelligence",
        labelKey: "settingsPage.llms.tabs.chatIntelligence",
        icon: MessageSquare,
      },
      {
        id: "dictationCleanup",
        labelKey: "settingsPage.llms.tabs.dictationCleanup",
        icon: Wand2,
      },
      { id: "dictationAgent", labelKey: "settingsPage.llms.tabs.dictationAgent", icon: Sparkles },
      {
        id: "dictationTranslation",
        labelKey: "settingsPage.llms.tabs.dictationTranslation",
        icon: Languages,
      },
    ],
  },
  {
    id: "privacyData",
    labelKey: "settingsModal.sections.privacyData.label",
    descriptionKey: "settingsModal.sections.privacyData.description",
    icon: Shield,
    groupKey: "settingsModal.groups.system",
    twoColumn: true,
    anchors: [
      { id: "audioRetention", labelKey: "settingsPage.privacy.audioRetention" },
      { id: "dataRetention", labelKey: "settingsPage.privacy.dataRetention" },
      { id: "permissions", labelKey: "settingsPage.permissions.title" },
    ],
  },
  {
    id: "system",
    labelKey: "settingsModal.sections.system.label",
    descriptionKey: "settingsModal.sections.system.description",
    icon: Wrench,
    groupKey: "settingsModal.groups.system",
    twoColumn: true,
    anchors: [
      { id: "updates", labelKey: "settingsPage.general.updates.title" },
      { id: "developerTools", labelKey: "developerSection.title" },
      { id: "dataManagement", labelKey: "settingsPage.developer.dataManagementTitle" },
    ],
  },
];

export const SETTINGS_SECTIONS: SettingsSectionDef[] = ALL_SETTINGS_SECTIONS.map((section) => ({
  ...section,
  ...(section.panels ? { panels: section.panels.filter((panel) => isVisibleEntry(panel.id)) } : {}),
  ...(section.anchors
    ? { anchors: section.anchors.filter((anchor) => isVisibleEntry(anchor.id)) }
    : {}),
}));

export const SECTION_BY_ID: Record<SettingsSectionType, SettingsSectionDef> =
  SETTINGS_SECTIONS.reduce(
    (acc, section) => {
      acc[section.id] = section;
      return acc;
    },
    {} as Record<SettingsSectionType, SettingsSectionDef>
  );

export interface SettingsSearchEntry {
  section: SettingsSectionType;
  /** Sub-surface to open before scrolling, for panelled sections. */
  panel?: string;
  /** Group to scroll to once the section is on screen. */
  anchor?: string;
  labelKey: string;
}

/**
 * Every label the nav-pane search can match. Entries point at a section and,
 * where one exists, the panel or group that actually contains the control —
 * search never promises a destination the UI cannot reach.
 */
const ALL_SETTINGS_SEARCH_INDEX: SettingsSearchEntry[] = [
  // ---- General ------------------------------------------------------------
  { section: "general", anchor: "appearance", labelKey: "settingsPage.general.appearance.theme" },
  { section: "general", anchor: "language", labelKey: "settings.language.uiLabel" },
  { section: "general", anchor: "language", labelKey: "settings.language.transcriptionLabel" },
  { section: "general", anchor: "language", labelKey: "settings.language.chineseScriptLabel" },
  {
    section: "general",
    anchor: "sound",
    labelKey: "settingsPage.general.soundEffects.dictationSounds",
  },
  { section: "general", anchor: "sound", labelKey: "settingsPage.general.soundEffects.pauseMedia" },
  {
    section: "general",
    anchor: "notifications",
    labelKey: "settingsPage.general.notifications.disableAll",
  },
  {
    section: "general",
    anchor: "notifications",
    labelKey: "settingsPage.general.notifications.meetingDetection",
  },
  // Calendar reminders ride the calendar feature: no toggle is rendered while
  // it is off, so search must not promise one.
  ...(CALENDAR_ENABLED
    ? [
        {
          section: "general" as const,
          anchor: "notifications",
          labelKey: "settingsPage.general.notifications.calendarReminders",
        },
      ]
    : []),
  {
    section: "general",
    anchor: "notifications",
    labelKey: "settingsPage.general.notifications.updates",
  },
  { section: "general", anchor: "clipboard", labelKey: "settingsPage.general.clipboard.autoPaste" },
  {
    section: "general",
    anchor: "clipboard",
    labelKey: "settingsPage.general.clipboard.keepInClipboard",
  },
  { section: "general", anchor: "noteFiles", labelKey: "settings.noteFiles.title" },
  { section: "general", anchor: "noteFiles", labelKey: "settings.noteFiles.path" },
  { section: "general", anchor: "noteFiles", labelKey: "settings.noteFiles.rebuild" },
  {
    section: "general",
    anchor: "floatingIcon",
    labelKey: "settingsPage.general.floatingIcon.autoHide",
  },
  {
    section: "general",
    anchor: "floatingIcon",
    labelKey: "settingsPage.general.floatingIcon.startPosition",
  },
  {
    section: "general",
    anchor: "startup",
    labelKey: "settingsPage.general.startup.launchAtLogin",
  },
  {
    section: "general",
    anchor: "startup",
    labelKey: "settingsPage.general.startup.startMinimized",
  },
  { section: "general", anchor: "microphone", labelKey: "settingsPage.general.microphone.title" },
  { section: "general", anchor: "dictionary", labelKey: "settingsPage.dictionary.autoLearnTitle" },
  {
    section: "general",
    anchor: "waylandPaste",
    labelKey: "settingsPage.general.waylandPaste.title",
  },

  // ---- Hotkeys ------------------------------------------------------------
  { section: "hotkeys", anchor: "dictationHotkey", labelKey: "settingsPage.general.hotkey.title" },
  {
    section: "hotkeys",
    anchor: "dictationHotkey",
    labelKey: "settingsPage.general.hotkey.activationMode",
  },
  {
    section: "hotkeys",
    anchor: "voiceAgentHotkey",
    labelKey: "settingsPage.general.voiceAgentHotkey.title",
  },
  {
    section: "hotkeys",
    anchor: "translationHotkey",
    labelKey: "settingsPage.general.translationHotkey.title",
  },
  {
    section: "hotkeys",
    anchor: "meetingHotkey",
    labelKey: "settingsPage.general.meetingHotkey.title",
  },
  {
    section: "hotkeys",
    anchor: "meetingHotkey",
    labelKey: "settingsPage.general.meetingHotkey.layoutLabel",
  },
  { section: "hotkeys", anchor: "chatAgentHotkey", labelKey: "agentMode.settings.hotkey" },

  // ---- Speech-to-Text -----------------------------------------------------
  {
    section: "speechToText",
    panel: "dictation",
    anchor: "dictationEngine",
    labelKey: "settingsPage.speechToText.tabs.dictation",
  },
  {
    section: "speechToText",
    panel: "dictation",
    anchor: "dictationEngine",
    labelKey: "settingsPage.transcription.transcriptionPreview",
  },
  {
    section: "speechToText",
    panel: "dictation",
    anchor: "dictationVad",
    labelKey: "settingsPage.transcription.vad.title",
  },
  {
    section: "speechToText",
    panel: "noteRecording",
    anchor: "noteRecordingEngine",
    labelKey: "settingsPage.speechToText.tabs.noteRecording",
  },
  {
    section: "speechToText",
    panel: "noteRecording",
    anchor: "noteRecordingEngine",
    labelKey: "settings.meeting.speakerDetection.title",
  },
  {
    section: "speechToText",
    panel: "upload",
    anchor: "uploadEngine",
    labelKey: "settingsPage.speechToText.tabs.upload",
  },

  // ---- Language models ----------------------------------------------------
  {
    section: "llms",
    panel: "dictationCleanup",
    anchor: "cleanupModel",
    labelKey: "settingsPage.aiModels.enableTextCleanup",
  },
  {
    section: "llms",
    panel: "dictationCleanup",
    anchor: "cleanupPrompts",
    labelKey: "settingsPage.prompts.title",
  },
  {
    section: "llms",
    panel: "dictationAgent",
    anchor: "dictationAgentModel",
    labelKey: "dictationAgent.enabled",
  },
  {
    section: "llms",
    panel: "dictationAgent",
    anchor: "dictationAgentScreenContext",
    labelKey: "dictationAgent.screenContext.title",
  },
  {
    section: "llms",
    panel: "dictationAgent",
    anchor: "dictationAgentIdentity",
    labelKey: "settingsPage.agentConfig.agentName",
  },
  {
    section: "llms",
    panel: "dictationTranslation",
    anchor: "translationModel",
    labelKey: "dictationTranslation.enabled",
  },
  {
    section: "llms",
    panel: "actions",
    anchor: "actionsOptions",
    labelKey: "settingsPage.actions.autoGenerateTitle",
  },
  {
    section: "llms",
    panel: "actions",
    anchor: "actionsList",
    labelKey: "notes.actions.manageTitle",
  },
  {
    section: "llms",
    panel: "chatIntelligence",
    anchor: "chatAgentPrompt",
    labelKey: "agentMode.settings.systemPrompt",
  },

  // ---- Privacy & data -----------------------------------------------------
  {
    section: "privacyData",
    anchor: "audioRetention",
    labelKey: "settingsPage.privacy.audioRetention",
  },
  {
    section: "privacyData",
    anchor: "audioRetention",
    labelKey: "settingsPage.privacy.audioStorageUsage",
  },
  {
    section: "privacyData",
    anchor: "dataRetention",
    labelKey: "settingsPage.privacy.transcriptRetention",
  },
  {
    section: "privacyData",
    anchor: "dataRetention",
    labelKey: "settingsPage.privacy.saveDiscarded",
  },
  {
    section: "privacyData",
    anchor: "permissions",
    labelKey: "settingsPage.permissions.microphoneTitle",
  },
  {
    section: "privacyData",
    anchor: "permissions",
    labelKey: "settingsPage.permissions.accessibilityTitle",
  },
  {
    section: "privacyData",
    anchor: "permissions",
    labelKey: "settingsPage.permissions.systemAudioTitle",
  },

  // ---- System -------------------------------------------------------------
  { section: "system", anchor: "updates", labelKey: "settingsPage.general.updates.title" },
  { section: "system", anchor: "developerTools", labelKey: "developerSection.title" },
  { section: "system", anchor: "dataManagement", labelKey: "settingsPage.developer.modelCache" },
  { section: "system", anchor: "dataManagement", labelKey: "settingsPage.developer.resetAppData" },
];

/**
 * Search can only offer what the nav can actually reach, so entries whose panel
 * or anchor belongs to a hidden feature are dropped with it.
 */
export const SETTINGS_SEARCH_INDEX: SettingsSearchEntry[] = ALL_SETTINGS_SEARCH_INDEX.filter(
  (entry) => isVisibleEntry(entry.panel ?? "") && isVisibleEntry(entry.anchor ?? "")
);
