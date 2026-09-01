import React, { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import ActionManagerDialog from "./notes/ActionManagerDialog";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import {
  RefreshCw,
  Download,
  Mic,
  Shield,
  FolderOpen,
  Sun,
  Moon,
  Monitor,
  Key,
  Cpu,
  Network,
  AlertTriangle,
  Loader2,
  CircleCheck,
  CircleX,
  RotateCw,
  BookOpen,
  Copy,
  Info,
  ChevronDown,
  Languages,
  MessageSquare,
  Video,
  Wand2,
  Rocket,
  Minimize2,
  PanelTop,
  EyeOff,
} from "lucide-react";
import MicPermissionWarning from "./ui/MicPermissionWarning";
import MicrophoneSettings from "./ui/MicrophoneSettings";
import PermissionCard from "./ui/PermissionCard";
import PasteToolsInfo from "./ui/PasteToolsInfo";
import NixOsPasteInfo from "./ui/NixOsPasteInfo";
import TranscriptionModelPicker from "./TranscriptionModelPicker";
import SelfHostedPanel from "./SelfHostedPanel";
import {
  ConfirmDialog,
  AlertDialog,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Alert, AlertTitle, AlertDescription } from "./ui/alert";
import { useSettings } from "../hooks/useSettings";
import { useDialogs } from "../hooks/useDialogs";
import { useStartOnboarding } from "../hooks/useStartOnboarding";
import { useWhisper } from "../hooks/useWhisper";
import { usePermissions } from "../hooks/usePermissions";
import { useSystemAudioPermission } from "../hooks/useSystemAudioPermission";
import { useClipboard } from "../hooks/useClipboard";
import { useUpdater } from "../hooks/useUpdater";

import PromptStudio from "./ui/PromptStudio";
import { HotkeyListInput } from "./ui/HotkeyListInput";
import { useHotkeyRegistration } from "../hooks/useHotkeyRegistration";
import { useHotkeyModeInfo } from "../hooks/useHotkeyModeInfo";
import { validateHotkeyForSlot } from "../utils/hotkeyValidation";
import { getCachedPlatform } from "../utils/platform";
import { formatHotkeyLabel, getSuggestedHotkey } from "../utils/hotkeys";
import HotkeyMap, { type HotkeyMapRow } from "./settings/HotkeyMap";
import { CALENDAR_ENABLED, DICTATION_ENABLED, DICTATION_SETTINGS_IDS } from "../config/features";
import { ActivationModeSelector } from "./ui/ActivationModeSelector";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import LinuxPttSetupInfo from "./ui/LinuxPttSetupInfo";
import { Toggle } from "./ui/toggle";
import DeveloperSection from "./DeveloperSection";
import ChatAgentSettings from "./settings/ChatAgentSettings";
import DictationAgentSettings from "./settings/DictationAgentSettings";
import DictationTranslationSettings from "./settings/DictationTranslationSettings";
import InferenceConfigEditor from "./settings/InferenceConfigEditor";
import { MeetingTranscriptionPanel } from "./settings/MeetingSettings";
import { UploadTranscriptionPanel } from "./settings/UploadSettings";
import LanguageSelector from "./ui/LanguageSelector";
import { useToast } from "./ui/useToast";
import { useTheme } from "../hooks/useTheme";
import type {
  ChineseScriptPreference,
  GpuDevice,
  LocalTranscriptionProvider,
  InferenceMode,
} from "../types/electron";
import logger from "../utils/logger";
import {
  SettingsRow,
  SettingsPanel,
  SettingsPanelRow,
  InferenceModeSelector,
} from "./ui/SettingsSection";
import type { InferenceModeOption } from "./ui/SettingsSection";
import SettingsGroup, {
  SettingsFieldGrid,
  SettingsPanelBody,
  SettingsSectionBody,
} from "./settings/SettingsGroup";
import { LLM_TABS, SPEECH_TABS } from "./settings/settingsNav";
import type { LlmTab, SettingsSectionType, SpeechTab } from "./settings/settingsNav";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { formatBytes } from "../utils/formatBytes";
import { clearMissingLocalModelSelections, useSettingsStore } from "../stores/settingsStore";
import { canManageSystemAudioInApp } from "../utils/systemAudioAccess";
import { restartTour } from "../stores/tourStore";

export type { SettingsSectionType };

interface SettingsPageProps {
  activeSection?: SettingsSectionType;
  /** Active sub-surface of the panelled sections. Owned by SettingsModal. */
  speechTab?: SpeechTab;
  llmTab?: LlmTab;
  /** Dismisses the containing modal, for actions that act on the window behind it. */
  onRequestClose?: () => void;
}

const UI_LANGUAGE_OPTIONS: import("./ui/LanguageSelector").LanguageOption[] = [
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "es", label: "Español", flag: "🇪🇸" },
  { value: "fr", label: "Français", flag: "🇫🇷" },
  { value: "de", label: "Deutsch", flag: "🇩🇪" },
  { value: "pt", label: "Português", flag: "🇵🇹" },
  { value: "it", label: "Italiano", flag: "🇮🇹" },
  { value: "ru", label: "Русский", flag: "🇷🇺" },
  { value: "ja", label: "日本語", flag: "🇯🇵" },
  { value: "zh-CN", label: "简体中文", flag: "🇨🇳" },
  { value: "zh-TW", label: "繁體中文", flag: "🇹🇼" },
];

const RETENTION_DAY_OPTIONS = [1, 7, 14, 30, 60, 90];

/** Shared chrome for the small inline `<select>` controls in this page. */
const SELECT_CLASS =
  "h-8 rounded-md border border-border bg-input px-2.5 text-xs font-medium text-foreground transition-colors duration-150 ease-snap hover:border-border-hover focus:border-border-active focus:outline-none focus:ring-2 focus:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50";

const noop = () => {};

interface TranscriptionSectionProps {
  cloudTranscriptionMode: string;
  setCloudTranscriptionMode: (mode: string) => void;
  useLocalWhisper: boolean;
  setUseLocalWhisper: (value: boolean) => void;
  updateTranscriptionSettings: (settings: { useLocalWhisper: boolean }) => void;
  cloudTranscriptionProvider: string;
  setCloudTranscriptionProvider: (provider: string) => void;
  cloudTranscriptionModel: string;
  setCloudTranscriptionModel: (model: string) => void;
  localTranscriptionProvider: string;
  setLocalTranscriptionProvider: (provider: LocalTranscriptionProvider) => void;
  whisperModel: string;
  setWhisperModel: (model: string) => void;
  parakeetModel: string;
  setParakeetModel: (model: string) => void;
  cloudTranscriptionBaseUrl?: string;
  setCloudTranscriptionBaseUrl: (url: string) => void;
  transcriptionMode: InferenceMode;
  setTranscriptionMode: (mode: InferenceMode) => void;
  remoteTranscriptionUrl: string;
  setRemoteTranscriptionUrl: (url: string) => void;
  remoteTranscriptionModel: string;
  setRemoteTranscriptionModel: (model: string) => void;
  showTranscriptionPreview: boolean;
  setShowTranscriptionPreview: (value: boolean) => void;
  toast: (opts: {
    title: string;
    description: string;
    variant?: "default" | "destructive" | "success";
    duration?: number;
  }) => void;
}

function TranscriptionSection({
  cloudTranscriptionMode,
  setCloudTranscriptionMode,
  useLocalWhisper,
  setUseLocalWhisper,
  updateTranscriptionSettings,
  cloudTranscriptionProvider,
  setCloudTranscriptionProvider,
  cloudTranscriptionModel,
  setCloudTranscriptionModel,
  localTranscriptionProvider,
  setLocalTranscriptionProvider,
  whisperModel,
  setWhisperModel,
  parakeetModel,
  setParakeetModel,
  cloudTranscriptionBaseUrl,
  setCloudTranscriptionBaseUrl,
  transcriptionMode,
  setTranscriptionMode,
  remoteTranscriptionUrl,
  setRemoteTranscriptionUrl,
  remoteTranscriptionModel,
  setRemoteTranscriptionModel,
  showTranscriptionPreview,
  setShowTranscriptionPreview,
  toast,
}: TranscriptionSectionProps) {
  const { t } = useTranslation();
  const transcriptionModes: InferenceModeOption[] = [
    {
      id: "providers",
      label: t("settingsPage.transcription.modes.providers"),
      description: t("settingsPage.transcription.modes.providersDesc"),
      icon: <Key className="w-4 h-4" />,
    },
    {
      id: "local",
      label: t("settingsPage.transcription.modes.local"),
      description: t("settingsPage.transcription.modes.localDesc"),
      icon: <Cpu className="w-4 h-4" />,
    },
    {
      id: "self-hosted",
      label: t("settingsPage.transcription.modes.selfHosted"),
      description: t("settingsPage.transcription.modes.selfHostedDesc"),
      icon: <Network className="w-4 h-4" />,
    },
  ];
  const handleTranscriptionModeSelect = (mode: InferenceMode) => {
    if (mode === transcriptionMode) return;
    setTranscriptionMode(mode);
    setUseLocalWhisper(mode === "local");
    updateTranscriptionSettings({ useLocalWhisper: mode === "local" });
    setCloudTranscriptionMode("byok");

    const toastKey = {
      providers: "switchedProviders",
      local: "switchedLocal",
      "self-hosted": "switchedSelfHosted",
    }[mode];
    toast({
      title: t(`settingsPage.transcription.toasts.${toastKey}.title`),
      description: t(`settingsPage.transcription.toasts.${toastKey}.description`),
      variant: "success",
      duration: 3000,
    });
  };

  const handleLocalModelSelect = useCallback(
    (modelId: string) => {
      if (localTranscriptionProvider === "nvidia") {
        setParakeetModel(modelId);
      } else {
        setWhisperModel(modelId);
      }
    },
    [localTranscriptionProvider, setParakeetModel, setWhisperModel]
  );

  const renderPreviewToggle = () => (
    <SettingsPanel>
      <SettingsPanelRow>
        <SettingsRow
          label={t("settingsPage.transcription.transcriptionPreview")}
          description={t("settingsPage.transcription.transcriptionPreviewDescription")}
        >
          <Toggle checked={showTranscriptionPreview} onChange={setShowTranscriptionPreview} />
        </SettingsRow>
      </SettingsPanelRow>
    </SettingsPanel>
  );

  const renderTranscriptionPicker = (mode?: "cloud" | "local") => (
    <TranscriptionModelPicker
      selectedCloudProvider={cloudTranscriptionProvider}
      onCloudProviderSelect={setCloudTranscriptionProvider}
      selectedCloudModel={cloudTranscriptionModel}
      onCloudModelSelect={setCloudTranscriptionModel}
      selectedLocalModel={localTranscriptionProvider === "nvidia" ? parakeetModel : whisperModel}
      onLocalModelSelect={handleLocalModelSelect}
      selectedLocalProvider={localTranscriptionProvider}
      onLocalProviderSelect={setLocalTranscriptionProvider}
      useLocalWhisper={mode === "local" || (!mode && useLocalWhisper)}
      onModeChange={
        mode
          ? noop
          : (isLocal) => {
              setUseLocalWhisper(isLocal);
              updateTranscriptionSettings({ useLocalWhisper: isLocal });
              if (isLocal) setCloudTranscriptionMode("byok");
            }
      }
      mode={mode}
      cloudTranscriptionBaseUrl={cloudTranscriptionBaseUrl}
      setCloudTranscriptionBaseUrl={setCloudTranscriptionBaseUrl}
      variant="settings"
    />
  );

  return (
    <>
      <SettingsGroup
        id="dictationEngine"
        title={t("settingsModal.groupTitles.engine")}
        description={t("settingsModal.groupTitles.engineDescription")}
      >
        <InferenceModeSelector
          modes={transcriptionModes}
          activeMode={transcriptionMode}
          onSelect={handleTranscriptionModeSelect}
        />

        {transcriptionMode === "providers" && renderTranscriptionPicker("cloud")}
        {transcriptionMode === "local" && (
          <>
            {renderTranscriptionPicker("local")}
            {renderPreviewToggle()}
          </>
        )}

        {transcriptionMode === "self-hosted" && (
          <SelfHostedPanel
            service="transcription"
            url={remoteTranscriptionUrl}
            onUrlChange={setRemoteTranscriptionUrl}
            model={remoteTranscriptionModel}
            onModelChange={setRemoteTranscriptionModel}
          />
        )}
      </SettingsGroup>

      <GpuDeviceSelector purpose="transcription" anchorId="dictationGpu" />
    </>
  );
}

interface AiModelsSectionProps {
  useCleanupModel: boolean;
  setUseCleanupModel: (value: boolean) => void;
  toast: (opts: {
    title: string;
    description: string;
    variant?: "default" | "destructive" | "success";
    duration?: number;
  }) => void;
}

const CLEANUP_MODE_TOAST_KEY: Record<InferenceMode, string> = {
  providers: "switchedProviders",
  local: "switchedLocal",
  "self-hosted": "switchedSelfHosted",
  enterprise: "switchedEnterprise",
};

function ActionsSettings() {
  const { t } = useTranslation();
  const autoGenerateNoteTitle = useSettingsStore((s) => s.autoGenerateNoteTitle);
  const setAutoGenerateNoteTitle = useSettingsStore((s) => s.setAutoGenerateNoteTitle);
  const [showActionManager, setShowActionManager] = useState(false);

  // Actions first: this panel is about them. Writing up a meeting is not a
  // separate feature from "Generate Notes" — it *is* that action, run
  // automatically — so the panel leads with the actions, then names the model
  // they all run on, then the odds and ends.
  return (
    <SettingsPanelBody>
      <SettingsGroup
        id="actionsList"
        title={t("settingsPage.actions.actionsTitle")}
        description={t("settingsPage.actions.actionsDescription")}
      >
        <SettingsPanel>
          <SettingsPanelRow>
            <SettingsRow
              label={t("notes.actions.manageTitle")}
              description={t("settingsPage.actions.actionsRowDescription")}
            >
              <Button variant="outline" size="sm" onClick={() => setShowActionManager(true)}>
                {t("settingsPage.actions.manageActions")}
              </Button>
            </SettingsRow>
          </SettingsPanelRow>
        </SettingsPanel>
      </SettingsGroup>

      <SettingsGroup
        id="actionsModel"
        title={t("common.model")}
        description={t("settingsPage.actions.modelDescription")}
      >
        <InferenceConfigEditor scope="actions" />
      </SettingsGroup>

      <SettingsGroup id="actionsOptions" title={t("settingsModal.groupTitles.options")}>
        <SettingsPanel>
          <SettingsPanelRow>
            <SettingsRow
              label={t("settingsPage.actions.autoGenerateTitle")}
              description={t("settingsPage.actions.autoGenerateTitleDescription")}
            >
              <Toggle checked={autoGenerateNoteTitle} onChange={setAutoGenerateNoteTitle} />
            </SettingsRow>
          </SettingsPanelRow>
        </SettingsPanel>
      </SettingsGroup>

      <ActionManagerDialog open={showActionManager} onOpenChange={setShowActionManager} />
    </SettingsPanelBody>
  );
}

function AiModelsSection({ useCleanupModel, setUseCleanupModel, toast }: AiModelsSectionProps) {
  const { t } = useTranslation();

  const handleCleanupModeChange = (mode: InferenceMode) => {
    const toastKey = CLEANUP_MODE_TOAST_KEY[mode];
    toast({
      title: t(`settingsPage.aiModels.toasts.${toastKey}.title`),
      description: t(`settingsPage.aiModels.toasts.${toastKey}.description`),
      variant: "success",
      duration: 3000,
    });
  };

  return (
    <>
      <SettingsGroup
        id="cleanupModel"
        title={t("common.model")}
        description={t("settingsPage.aiModels.description")}
      >
        <SettingsPanel>
          <SettingsPanelRow>
            <SettingsRow
              label={t("settingsPage.aiModels.enableTextCleanup")}
              description={t("settingsPage.aiModels.enableTextCleanupDescription")}
            >
              <Toggle checked={useCleanupModel} onChange={setUseCleanupModel} />
            </SettingsRow>
          </SettingsPanelRow>
        </SettingsPanel>

        {useCleanupModel && (
          <InferenceConfigEditor scope="dictationCleanup" onModeChange={handleCleanupModeChange} />
        )}
      </SettingsGroup>

      {useCleanupModel && <GpuDeviceSelector purpose="intelligence" anchorId="cleanupGpu" />}
    </>
  );
}

function VADLabelWithInfo({
  htmlFor,
  label,
  description,
}: {
  htmlFor: string;
  label: string;
  description: string;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
      <label htmlFor={htmlFor}>{label}</label>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground transition-colors"
            aria-label={label}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="max-w-sm p-3">
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function TabPanel({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <div className={active ? undefined : "hidden"}>{children}</div>;
}

function GpuDeviceSelector({
  purpose,
  anchorId,
}: {
  purpose: "transcription" | "intelligence";
  anchorId: string;
}) {
  const { t } = useTranslation();
  const [gpus, setGpus] = useState<GpuDevice[]>([]);
  const [selectedUuid, setSelectedUuid] = useState("");
  const [loaded, setLoaded] = useState(false);
  const selectId = `gpu-device-${purpose}`;

  useEffect(() => {
    Promise.all([
      window.electronAPI?.listGpus?.() ?? Promise.resolve([]),
      window.electronAPI?.getGpuDeviceIndex?.(purpose) ?? Promise.resolve(""),
    ])
      .then(([gpuList, savedUuid]) => {
        setGpus(gpuList);
        setSelectedUuid(savedUuid || gpuList[0]?.uuid || "");
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [purpose]);

  if (!loaded || gpus.length < 2) return null;

  return (
    <SettingsGroup
      id={anchorId}
      title={t(`settingsPage.${purpose}.gpuDevice.title`)}
      description={t(`settingsPage.${purpose}.gpuDevice.description`)}
    >
      <SettingsPanel>
        <SettingsPanelRow>
          <label htmlFor={selectId} className="sr-only">
            {t(`settingsPage.${purpose}.gpuDevice.title`)}
          </label>
          <div className="relative w-full">
            <select
              id={selectId}
              value={selectedUuid}
              onChange={async (e) => {
                const uuid = e.target.value;
                setSelectedUuid(uuid);
                await window.electronAPI?.setGpuDeviceIndex?.(purpose, uuid);
              }}
              className={`${SELECT_CLASS} h-9 w-full appearance-none pr-9`}
            >
              {gpus.map((gpu) => (
                <option key={gpu.uuid} value={gpu.uuid}>
                  GPU {gpu.index}: {gpu.name} ({Math.round(gpu.vramMb / 1024)}GB)
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            />
          </div>
        </SettingsPanelRow>
      </SettingsPanel>
    </SettingsGroup>
  );
}

export default function SettingsPage({
  activeSection = "general",
  // The first *visible* tab, not a literal: "dictation" and "dictationCleanup"
  // are both hidden, so a render without these props would open straight onto
  // a panel the nav cannot even show a tab for.
  speechTab = SPEECH_TABS[0],
  llmTab = LLM_TABS[0],
  onRequestClose,
}: SettingsPageProps) {
  const {
    confirmDialog,
    alertDialog,
    showConfirmDialog,
    showAlertDialog,
    hideConfirmDialog,
    hideAlertDialog,
  } = useDialogs();

  const startOnboarding = useStartOnboarding();

  const {
    useLocalWhisper,
    whisperModel,
    localTranscriptionProvider,
    parakeetModel,
    uiLanguage,
    preferredLanguage,
    chineseScriptPreference,
    cloudTranscriptionProvider,
    cloudTranscriptionModel,
    cloudTranscriptionBaseUrl,
    useCleanupModel,
    dictationKey,
    activationMode,
    setActivationMode,
    preferBuiltInMic,
    selectedMicDeviceId,
    selectedMicDeviceLabel,
    micWarmHoldSeconds,
    setPreferBuiltInMic,
    setSelectedMicDevice,
    setMicWarmHoldSeconds,
    setUseLocalWhisper,
    setUiLanguage,
    setWhisperModel,
    setLocalTranscriptionProvider,
    setParakeetModel,
    setCloudTranscriptionProvider,
    setCloudTranscriptionModel,
    setCloudTranscriptionBaseUrl,
    setUseCleanupModel,
    setDictationKey,
    meetingKey,
    setMeetingKey,
    meetingHotkeyLayoutMode,
    setMeetingHotkeyLayoutMode,
    autoLearnCorrections,
    setAutoLearnCorrections,
    updateTranscriptionSettings,
    updateCleanupSettings,
    cloudTranscriptionMode,
    setCloudTranscriptionMode,
    transcriptionMode,
    setTranscriptionMode,
    remoteTranscriptionUrl,
    setRemoteTranscriptionUrl,
    remoteTranscriptionModel,
    setRemoteTranscriptionModel,
    notificationsEnabled,
    setNotificationsEnabled,
    notifyMeetingDetection,
    setNotifyMeetingDetection,
    autoStartDetectedMeetings,
    setAutoStartDetectedMeetings,
    meetingPreRollEnabled,
    setMeetingPreRollEnabled,
    notifyCalendarReminders,
    setNotifyCalendarReminders,
    notifyUpdates,
    setNotifyUpdates,
    audioCuesEnabled,
    setAudioCuesEnabled,
    pauseMediaOnDictation,
    setPauseMediaOnDictation,
    showTranscriptionPreview,
    setShowTranscriptionPreview,
    autoPasteEnabled,
    setAutoPasteEnabled,
    keepTranscriptionInClipboard,
    setKeepTranscriptionInClipboard,
    floatingIconAutoHide,
    setFloatingIconAutoHide,
    startMinimized,
    setStartMinimized,
    showBarAtStartup,
    setShowBarAtStartup,
    overlayStealth,
    setOverlayStealth,
    panelStartPosition,
    setPanelStartPosition,
    audioRetentionDays,
    setAudioRetentionDays,
    transcriptRetentionDays,
    setTranscriptRetentionDays,
    dataRetentionEnabled,
    setDataRetentionEnabled,
    saveDiscardedTranscriptions,
    setSaveDiscardedTranscriptions,
    customDictionary,
    noteFilesEnabled,
    setNoteFilesEnabled,
    noteFilesPath,
    setNoteFilesPath,
    dictationSileroEnabled,
    setDictationSileroEnabled,
    noteRecordingSileroEnabled,
    setNoteRecordingSileroEnabled,
    meetingSileroEnabled,
    setMeetingSileroEnabled,
    whisperVadThreshold,
    setWhisperVadThreshold,
    whisperVadMinSpeechDurationMs,
    setWhisperVadMinSpeechDurationMs,
    whisperVadMinSilenceDurationMs,
    setWhisperVadMinSilenceDurationMs,
    whisperVadMaxSpeechDurationS,
    setWhisperVadMaxSpeechDurationS,
    whisperVadSpeechPadMs,
    setWhisperVadSpeechPadMs,
    whisperVadSamplesOverlap,
    setWhisperVadSamplesOverlap,
  } = useSettings();

  const chatAgentKey = useSettingsStore((s) => s.chatAgentKey);
  const setChatAgentKey = useSettingsStore((s) => s.setChatAgentKey);
  const voiceAgentKey = useSettingsStore((s) => s.voiceAgentKey);
  const setVoiceAgentKey = useSettingsStore((s) => s.setVoiceAgentKey);
  const translationKey = useSettingsStore((s) => s.translationKey);
  const setTranslationKey = useSettingsStore((s) => s.setTranslationKey);

  const { t } = useTranslation();
  const { toast } = useToast();

  const [currentVersion, setCurrentVersion] = useState<string>("");
  const [isRemovingModels, setIsRemovingModels] = useState(false);
  const [cachePathHint, setCachePathHint] = useState(
    typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent)
      ? "%USERPROFILE%\\.cache\\snowy"
      : "~/.cache/snowy"
  );
  useEffect(() => {
    window.electronAPI
      ?.getModelCacheRoot?.()
      .then((root) => {
        if (root) setCachePathHint(root);
      })
      .catch(() => {});
  }, []);

  const {
    status: updateStatus,
    info: updateInfo,
    downloadProgress: updateDownloadProgress,
    isChecking: checkingForUpdates,
    isDownloading: downloadingUpdate,
    isInstalling: installInitiated,
    checkForUpdates,
    downloadUpdate,
    installUpdate: installUpdateAction,
    getAppVersion,
    error: updateError,
    clearError: clearUpdateError,
  } = useUpdater();

  const isUpdateAvailable =
    !updateStatus.isDevelopment && (updateStatus.updateAvailable || updateStatus.updateDownloaded);

  const { checkWhisperInstallation } = useWhisper();
  const permissionsHook = usePermissions(showAlertDialog);
  const systemAudio = useSystemAudioPermission();
  useClipboard(showAlertDialog);
  const [audioStorageUsage, setAudioStorageUsage] = useState<{
    fileCount: number;
    totalBytes: number;
  }>({ fileCount: 0, totalBytes: 0 });

  useEffect(() => {
    if (activeSection !== "privacyData") return;
    window.electronAPI
      ?.getAudioStorageUsage?.()
      .then((usage: { fileCount: number; totalBytes: number }) => {
        if (usage) setAudioStorageUsage(usage);
      })
      .catch(() => {});
  }, [activeSection]);

  // Lazy keep-alive: mount AI sections only after the user has visited them once,
  // then keep them mounted so model-download progress and IPC listeners survive
  // section switches. The setState-during-render pattern flips the flag in the
  // same commit as the section change, so there's no blank frame on first visit.
  const [hasMountedSpeechToText, setHasMountedSpeechToText] = useState(
    activeSection === "speechToText"
  );
  const [hasMountedLlms, setHasMountedLlms] = useState(activeSection === "llms");
  if (activeSection === "speechToText" && !hasMountedSpeechToText) {
    setHasMountedSpeechToText(true);
  }
  if (activeSection === "llms" && !hasMountedLlms) {
    setHasMountedLlms(true);
  }

  const handleClearAllAudio = async () => {
    if (!window.electronAPI?.deleteAllAudio) return;
    try {
      await window.electronAPI.deleteAllAudio();
      setAudioStorageUsage({ fileCount: 0, totalBytes: 0 });
      toast({ title: t("settingsPage.privacy.clearAllAudio"), variant: "default" });
    } catch {
      // silent fail
    }
  };

  // ydotool status for Wayland paste diagnostics
  const [ydotoolStatus, setYdotoolStatus] = useState<{
    isLinux: boolean;
    isWayland: boolean;
    hasYdotool: boolean;
    hasYdotoold: boolean;
    daemonRunning: boolean;
    hasService: boolean;
    hasUinput: boolean;
    hasUdevRule: boolean;
    hasGroup: boolean;
    allGood: boolean;
    isKde?: boolean;
    hasXclip?: boolean;
    hasXsel?: boolean;
    isNixOS?: boolean;
  } | null>(null);
  const [ydotoolGuideKey, setYdotoolGuideKey] = useState<string | null>(null);

  const refreshYdotoolStatus = useCallback(async () => {
    try {
      const status = await window.electronAPI?.getYdotoolStatus?.();
      if (status) setYdotoolStatus(status);
    } catch {}
  }, []);

  useEffect(() => {
    refreshYdotoolStatus();
  }, [refreshYdotoolStatus]);

  const { theme, setTheme } = useTheme();

  const installTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { registerHotkey, isRegistering: isHotkeyRegistering } = useHotkeyRegistration({
    onSuccess: (registeredHotkey) => {
      setDictationKey(registeredHotkey);
    },
    showSuccessToast: false,
    showErrorToast: true,
    showAlert: showAlertDialog,
  });

  const meetingRegisterFn = useCallback(async (hotkey: string) => {
    const result = await window.electronAPI?.registerMeetingHotkey?.(hotkey);
    return result ?? { success: false, message: "Electron API unavailable" };
  }, []);

  const { registerHotkey: registerMeetingHotkey, isRegistering: isMeetingHotkeyRegistering } =
    useHotkeyRegistration({
      onSuccess: (registeredHotkey) => {
        setMeetingKey(registeredHotkey);
      },
      showSuccessToast: false,
      showErrorToast: true,
      showAlert: showAlertDialog,
      registerFn: meetingRegisterFn,
    });

  // Agent hotkey setters resolve to false when main-process registration fails;
  // surface it and return the result so HotkeyListInput rolls the row back.
  const [isAgentHotkeyCommitting, setIsAgentHotkeyCommitting] = useState(false);
  const commitAgentHotkey = useCallback(
    async (setter: (key: string) => Promise<boolean>, key: string) => {
      setIsAgentHotkeyCommitting(true);
      try {
        const ok = await setter(key);
        if (!ok) {
          showAlertDialog({
            title: t("hooks.hotkeyRegistration.titles.notRegistered"),
            description: t("hooks.hotkeyRegistration.errors.failedToRegister"),
          });
        }
        return ok;
      } finally {
        setIsAgentHotkeyCommitting(false);
      }
    },
    [showAlertDialog, t]
  );

  const validateDictationHotkey = useCallback(
    (hotkey: string) =>
      validateHotkeyForSlot(
        hotkey,
        {
          "settingsPage.general.meetingHotkey.title": meetingKey,
          "agentMode.settings.hotkey": chatAgentKey,
          "settingsPage.general.voiceAgentHotkey.title": voiceAgentKey,
          "settingsPage.general.translationHotkey.title": translationKey,
        },
        t
      ),
    [meetingKey, chatAgentKey, voiceAgentKey, translationKey, t]
  );

  const validateMeetingHotkey = useCallback(
    (hotkey: string) =>
      validateHotkeyForSlot(
        hotkey,
        {
          "settingsPage.general.hotkey.title": dictationKey,
          "agentMode.settings.hotkey": chatAgentKey,
          "settingsPage.general.voiceAgentHotkey.title": voiceAgentKey,
          "settingsPage.general.translationHotkey.title": translationKey,
        },
        t
      ),
    [dictationKey, chatAgentKey, voiceAgentKey, translationKey, t]
  );

  const validateChatAgentHotkey = useCallback(
    (hotkey: string) =>
      validateHotkeyForSlot(
        hotkey,
        {
          "settingsPage.general.hotkey.title": dictationKey,
          "settingsPage.general.meetingHotkey.title": meetingKey,
          "settingsPage.general.voiceAgentHotkey.title": voiceAgentKey,
          "settingsPage.general.translationHotkey.title": translationKey,
        },
        t
      ),
    [dictationKey, meetingKey, voiceAgentKey, translationKey, t]
  );

  const validateVoiceAgentHotkey = useCallback(
    (hotkey: string) =>
      validateHotkeyForSlot(
        hotkey,
        {
          "settingsPage.general.hotkey.title": dictationKey,
          "settingsPage.general.meetingHotkey.title": meetingKey,
          "agentMode.settings.hotkey": chatAgentKey,
          "settingsPage.general.translationHotkey.title": translationKey,
        },
        t
      ),
    [dictationKey, meetingKey, chatAgentKey, translationKey, t]
  );

  const validateTranslationHotkey = useCallback(
    (hotkey: string) =>
      validateHotkeyForSlot(
        hotkey,
        {
          "settingsPage.general.hotkey.title": dictationKey,
          "settingsPage.general.meetingHotkey.title": meetingKey,
          "agentMode.settings.hotkey": chatAgentKey,
          "settingsPage.general.voiceAgentHotkey.title": voiceAgentKey,
        },
        t
      ),
    [dictationKey, meetingKey, chatAgentKey, voiceAgentKey, t]
  );

  const { isUsingNativeShortcut, isUsingHyprland, hyprlandConfigStatus, supportsPushToTalk } =
    useHotkeyModeInfo("settings");
  const [effectiveDefaultHotkey, setEffectiveDefaultHotkey] = useState<string | null>(null);
  const [linuxPttAvailable, setLinuxPttAvailable] = useState(true);

  const platform = getCachedPlatform();

  const [autoStartEnabled, setAutoStartEnabled] = useState(false);
  const [autoStartNeedsApproval, setAutoStartNeedsApproval] = useState(false);
  const [autoStartLoading, setAutoStartLoading] = useState(true);

  const readAutoStartState = useCallback(async () => {
    if (!window.electronAPI?.getAutoStartEnabled) return;
    try {
      const state = await window.electronAPI.getAutoStartEnabled();
      setAutoStartEnabled(state.enabled);
      setAutoStartNeedsApproval(state.requiresApproval);
    } catch (error) {
      logger.error("Failed to get auto-start status", error, "settings");
    }
  }, []);

  useEffect(() => {
    readAutoStartState().finally(() => setAutoStartLoading(false));
  }, [readAutoStartState]);

  useEffect(() => {
    window.electronAPI?.syncNotificationPreferences?.({
      notificationsEnabled,
      notifyMeetingDetection,
      notifyCalendarReminders,
      notifyUpdates,
      autoStartDetectedMeetings,
    });
  }, [
    notificationsEnabled,
    notifyMeetingDetection,
    notifyCalendarReminders,
    notifyUpdates,
    autoStartDetectedMeetings,
  ]);

  const handleAutoStartChange = async (enabled: boolean) => {
    if (!window.electronAPI?.setAutoStartEnabled) return;
    try {
      setAutoStartLoading(true);
      const result = await window.electronAPI.setAutoStartEnabled(enabled);
      // Read the state back rather than assuming: on Windows the OS can have the
      // item disabled out from under us, and on macOS it can need approval first.
      if (result.success) await readAutoStartState();
    } catch (error) {
      logger.error("Failed to set auto-start", error, "settings");
    } finally {
      setAutoStartLoading(false);
    }
  };

  const [noteFilesDefaultPath, setNoteFilesDefaultPath] = useState("");
  const [noteFilesRebuilding, setNoteFilesRebuilding] = useState(false);

  useEffect(() => {
    if (!noteFilesEnabled) return;
    window.electronAPI?.noteFilesGetDefaultPath?.().then((p) => {
      if (p) setNoteFilesDefaultPath(p);
    });
  }, [noteFilesEnabled]);

  const handleNoteFilesToggle = useCallback(
    async (enabled: boolean) => {
      setNoteFilesEnabled(enabled);
      await window.electronAPI?.noteFilesSetEnabled?.(enabled, noteFilesPath || undefined);
    },
    [setNoteFilesEnabled, noteFilesPath]
  );

  const handleNoteFilesChangePath = useCallback(async () => {
    const result = await window.electronAPI?.noteFilesPickFolder?.();
    if (result?.canceled || !result?.path) return;
    setNoteFilesPath(result.path);
    await window.electronAPI?.noteFilesSetPath?.(result.path);
  }, [setNoteFilesPath]);

  const handleNoteFilesRebuild = useCallback(async () => {
    setNoteFilesRebuilding(true);
    try {
      const result = await window.electronAPI?.noteFilesRebuild?.();
      if (result && !result.success) {
        toast({
          title: t("settings.noteFiles.rebuildError.title"),
          description: result.error || t("settings.noteFiles.rebuildError.description"),
          variant: "destructive",
        });
      }
    } finally {
      setNoteFilesRebuilding(false);
    }
  }, [toast, t]);

  useEffect(() => {
    let mounted = true;

    const timer = setTimeout(async () => {
      if (!mounted) return;

      const version = await getAppVersion();
      if (version && mounted) setCurrentVersion(version);

      if (mounted) {
        checkWhisperInstallation();
      }
    }, 100);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [checkWhisperInstallation, getAppVersion]);

  useEffect(() => {
    if (isUsingNativeShortcut && !supportsPushToTalk) {
      setActivationMode("tap");
    }
  }, [isUsingNativeShortcut, supportsPushToTalk, setActivationMode]);

  useEffect(() => {
    const loadEffectiveDefaultHotkey = async () => {
      try {
        const key = await window.electronAPI?.getEffectiveDefaultHotkey?.();
        if (key) setEffectiveDefaultHotkey(key);
      } catch (error) {
        logger.error("Failed to get effective default hotkey", error, "settings");
      }
    };
    loadEffectiveDefaultHotkey();
  }, []);

  useEffect(() => {
    const cleanup = window.electronAPI?.onLinuxPttPermissionDenied?.(() => {
      setLinuxPttAvailable(false);
      toast({
        title: t("settingsPage.general.hotkey.linuxPttPermissionTitle"),
        description: t("settingsPage.general.hotkey.linuxPttPermissionDescription"),
        variant: "destructive",
        duration: 15000,
      });
      setActivationMode("tap");
    });
    return () => cleanup?.();
  }, [toast, t, setActivationMode]);

  useEffect(() => {
    if (updateError) {
      showAlertDialog({
        title: t("settingsPage.general.updates.dialogs.updateError.title"),
        description: t("settingsPage.general.updates.dialogs.updateError.description"),
      });
      clearUpdateError();
    }
  }, [updateError, showAlertDialog, clearUpdateError, t]);

  useEffect(() => {
    if (installInitiated) {
      if (installTimeoutRef.current) {
        clearTimeout(installTimeoutRef.current);
      }
      installTimeoutRef.current = setTimeout(() => {
        showAlertDialog({
          title: t("settingsPage.general.updates.dialogs.almostThere.title"),
          description: t("settingsPage.general.updates.dialogs.almostThere.description"),
        });
      }, 10000);
    } else if (installTimeoutRef.current) {
      clearTimeout(installTimeoutRef.current);
      installTimeoutRef.current = null;
    }

    return () => {
      if (installTimeoutRef.current) {
        clearTimeout(installTimeoutRef.current);
        installTimeoutRef.current = null;
      }
    };
  }, [installInitiated, showAlertDialog, t]);

  const resetAccessibilityPermissions = () => {
    const message = t("settingsPage.permissions.resetAccessibility.description");

    showConfirmDialog({
      title: t("settingsPage.permissions.resetAccessibility.title"),
      description: message,
      onConfirm: () => {
        permissionsHook.requestAccessibilityPermission();
      },
    });
  };

  const handleRemoveModels = useCallback(() => {
    if (isRemovingModels) return;

    showConfirmDialog({
      title: t("settingsPage.developer.removeModels.title"),
      description: t("settingsPage.developer.removeModels.description", { path: cachePathHint }),
      confirmText: t("settingsPage.developer.removeModels.confirmText"),
      variant: "destructive",
      onConfirm: async () => {
        setIsRemovingModels(true);
        try {
          const results = await Promise.allSettled([
            window.electronAPI?.deleteAllWhisperModels?.(),
            window.electronAPI?.deleteAllParakeetModels?.(),
            window.electronAPI?.modelDeleteAll?.(),
          ]);

          const anyFailed = results.some(
            (r) =>
              r.status === "rejected" || (r.status === "fulfilled" && r.value && !r.value.success)
          );

          if (anyFailed) {
            showAlertDialog({
              title: t("settingsPage.developer.removeModels.failedTitle"),
              description: t("settingsPage.developer.removeModels.failedDescription"),
            });
          } else {
            // Every local model is gone, so no local selection can still resolve.
            clearMissingLocalModelSelections(() => false);
            window.dispatchEvent(new Event("snowy-models-cleared"));
            showAlertDialog({
              title: t("settingsPage.developer.removeModels.successTitle"),
              description: t("settingsPage.developer.removeModels.successDescription"),
            });
          }
        } catch {
          showAlertDialog({
            title: t("settingsPage.developer.removeModels.failedTitle"),
            description: t("settingsPage.developer.removeModels.failedDescriptionShort"),
          });
        } finally {
          setIsRemovingModels(false);
        }
      },
    });
  }, [isRemovingModels, cachePathHint, showConfirmDialog, showAlertDialog, t]);

  const renderWhisperVadSettings = (anchorId: string) => (
    <SettingsGroup
      id={anchorId}
      title={t("settingsPage.transcription.vad.title")}
      description={t("settingsPage.transcription.vad.description")}
    >
      <SettingsPanel>
        {/* This group is rendered under Note Recording as well, so the
            per-scope toggles have to be filtered individually — the group's
            own id is not "dictation". */}
        {DICTATION_ENABLED && (
          <SettingsPanelRow>
            <SettingsRow
              label={t("settingsPage.transcription.vad.toggles.dictation.title")}
              description={t("settingsPage.transcription.vad.toggles.dictation.description")}
            >
              <Toggle checked={dictationSileroEnabled} onChange={setDictationSileroEnabled} />
            </SettingsRow>
          </SettingsPanelRow>
        )}
        <SettingsPanelRow>
          <SettingsRow
            label={t("settingsPage.transcription.vad.toggles.noteRecording.title")}
            description={t("settingsPage.transcription.vad.toggles.noteRecording.description")}
          >
            <Toggle checked={noteRecordingSileroEnabled} onChange={setNoteRecordingSileroEnabled} />
          </SettingsRow>
        </SettingsPanelRow>
        <SettingsPanelRow>
          <SettingsRow
            label={t("settingsPage.transcription.vad.toggles.meeting.title")}
            description={t("settingsPage.transcription.vad.toggles.meeting.description")}
          >
            <Toggle checked={meetingSileroEnabled} onChange={setMeetingSileroEnabled} />
          </SettingsRow>
        </SettingsPanelRow>
        <SettingsPanelRow>
          <SettingsFieldGrid>
            <div className="space-y-1.5">
              <VADLabelWithInfo
                htmlFor="vad-threshold"
                label={t("settingsPage.transcription.vad.fields.threshold.label")}
                description={t("settingsPage.transcription.vad.fields.threshold.info")}
              />
              <Input
                id="vad-threshold"
                type="number"
                step="0.01"
                min="0.1"
                max="0.95"
                value={whisperVadThreshold}
                onChange={(e) => setWhisperVadThreshold(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <VADLabelWithInfo
                htmlFor="vad-min-speech"
                label={t("settingsPage.transcription.vad.fields.minSpeechDurationMs.label")}
                description={t("settingsPage.transcription.vad.fields.minSpeechDurationMs.info")}
              />
              <Input
                id="vad-min-speech"
                type="number"
                step="10"
                min="50"
                max="2000"
                value={whisperVadMinSpeechDurationMs}
                onChange={(e) => setWhisperVadMinSpeechDurationMs(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <VADLabelWithInfo
                htmlFor="vad-min-silence"
                label={t("settingsPage.transcription.vad.fields.minSilenceDurationMs.label")}
                description={t("settingsPage.transcription.vad.fields.minSilenceDurationMs.info")}
              />
              <Input
                id="vad-min-silence"
                type="number"
                step="10"
                min="50"
                max="2000"
                value={whisperVadMinSilenceDurationMs}
                onChange={(e) => setWhisperVadMinSilenceDurationMs(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <VADLabelWithInfo
                htmlFor="vad-max-speech"
                label={t("settingsPage.transcription.vad.fields.maxSpeechDurationS.label")}
                description={t("settingsPage.transcription.vad.fields.maxSpeechDurationS.info")}
              />
              <Input
                id="vad-max-speech"
                type="number"
                step="1"
                min="5"
                max="120"
                value={whisperVadMaxSpeechDurationS}
                onChange={(e) => setWhisperVadMaxSpeechDurationS(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <VADLabelWithInfo
                htmlFor="vad-speech-pad"
                label={t("settingsPage.transcription.vad.fields.speechPadMs.label")}
                description={t("settingsPage.transcription.vad.fields.speechPadMs.info")}
              />
              <Input
                id="vad-speech-pad"
                type="number"
                step="10"
                min="0"
                max="1000"
                value={whisperVadSpeechPadMs}
                onChange={(e) => setWhisperVadSpeechPadMs(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <VADLabelWithInfo
                htmlFor="vad-samples-overlap"
                label={t("settingsPage.transcription.vad.fields.samplesOverlap.label")}
                description={t("settingsPage.transcription.vad.fields.samplesOverlap.info")}
              />
              <Input
                id="vad-samples-overlap"
                type="number"
                step="0.01"
                min="0"
                max="0.95"
                value={whisperVadSamplesOverlap}
                onChange={(e) => setWhisperVadSamplesOverlap(Number(e.target.value))}
              />
            </div>
          </SettingsFieldGrid>
        </SettingsPanelRow>
      </SettingsPanel>
    </SettingsGroup>
  );

  const renderSectionContent = () => {
    switch (activeSection) {
      case "general":
        return (
          <SettingsSectionBody section="general">
            {/* Appearance */}
            <SettingsGroup
              id="appearance"
              title={t("settingsPage.general.appearance.title")}
              description={t("settingsPage.general.appearance.description")}
            >
              <SettingsPanel>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.general.appearance.theme")}
                    description={t("settingsPage.general.appearance.themeDescription")}
                  >
                    <div
                      role="group"
                      aria-label={t("settingsPage.general.appearance.theme")}
                      className="inline-flex items-center gap-px rounded-md bg-muted p-0.5"
                    >
                      {(
                        [
                          {
                            value: "light",
                            icon: Sun,
                            label: t("settingsPage.general.appearance.light"),
                          },
                          {
                            value: "dark",
                            icon: Moon,
                            label: t("settingsPage.general.appearance.dark"),
                          },
                          {
                            value: "auto",
                            icon: Monitor,
                            label: t("settingsPage.general.appearance.auto"),
                          },
                        ] as const
                      ).map((option) => {
                        const Icon = option.icon;
                        const isSelected = theme === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setTheme(option.value)}
                            aria-pressed={isSelected}
                            className={[
                              "flex items-center gap-1 rounded-sm px-2.5 py-1 text-xs font-medium",
                              "outline-none transition-colors duration-150 ease-snap",
                              "focus-visible:ring-2 focus-visible:ring-ring",
                              isSelected
                                ? "bg-surface-0 text-foreground shadow-(--shadow-card) dark:bg-surface-raised"
                                : "text-muted-foreground hover:text-foreground",
                            ].join(" ")}
                          >
                            <Icon className={`h-3 w-3 ${isSelected ? "text-primary" : ""}`} />
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </SettingsRow>
                </SettingsPanelRow>
              </SettingsPanel>
            </SettingsGroup>

            {/* Sound Effects */}
            <SettingsGroup id="sound" title={t("settingsPage.general.soundEffects.title")}>
              <SettingsPanel>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.general.soundEffects.dictationSounds")}
                    description={t("settingsPage.general.soundEffects.dictationSoundsDescription")}
                  >
                    <Toggle checked={audioCuesEnabled} onChange={setAudioCuesEnabled} />
                  </SettingsRow>
                </SettingsPanelRow>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.general.soundEffects.pauseMedia")}
                    description={t("settingsPage.general.soundEffects.pauseMediaDescription")}
                  >
                    <Toggle checked={pauseMediaOnDictation} onChange={setPauseMediaOnDictation} />
                  </SettingsRow>
                </SettingsPanelRow>
              </SettingsPanel>
            </SettingsGroup>

            {/* Notifications */}
            <SettingsGroup
              id="notifications"
              title={t("settingsPage.general.notifications.title")}
              description={t("settingsPage.general.notifications.description")}
            >
              <SettingsPanel>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.general.notifications.disableAll")}
                    description={t("settingsPage.general.notifications.disableAllDescription")}
                  >
                    <Toggle
                      checked={!notificationsEnabled}
                      onChange={(v) => setNotificationsEnabled(!v)}
                    />
                  </SettingsRow>
                </SettingsPanelRow>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.general.notifications.meetingDetection")}
                    description={t(
                      "settingsPage.general.notifications.meetingDetectionDescription"
                    )}
                  >
                    <Toggle
                      checked={notifyMeetingDetection}
                      onChange={setNotifyMeetingDetection}
                      disabled={!notificationsEnabled}
                    />
                  </SettingsRow>
                </SettingsPanelRow>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.general.notifications.autoStart")}
                    description={t("settingsPage.general.notifications.autoStartDescription")}
                  >
                    <Toggle
                      checked={autoStartDetectedMeetings}
                      onChange={setAutoStartDetectedMeetings}
                      disabled={!notificationsEnabled || !notifyMeetingDetection}
                    />
                  </SettingsRow>
                </SettingsPanelRow>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.general.notifications.meetingPreRoll")}
                    description={t("settingsPage.general.notifications.meetingPreRollDescription")}
                  >
                    <Toggle
                      checked={meetingPreRollEnabled}
                      onChange={setMeetingPreRollEnabled}
                      disabled={!notificationsEnabled || !notifyMeetingDetection}
                    />
                  </SettingsRow>
                </SettingsPanelRow>
                {CALENDAR_ENABLED && (
                  <SettingsPanelRow>
                    <SettingsRow
                      label={t("settingsPage.general.notifications.calendarReminders")}
                      description={t(
                        "settingsPage.general.notifications.calendarRemindersDescription"
                      )}
                    >
                      <Toggle
                        checked={notifyCalendarReminders}
                        onChange={setNotifyCalendarReminders}
                        disabled={!notificationsEnabled}
                      />
                    </SettingsRow>
                  </SettingsPanelRow>
                )}
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.general.notifications.updates")}
                    description={t("settingsPage.general.notifications.updatesDescription")}
                  >
                    <Toggle
                      checked={notifyUpdates}
                      onChange={setNotifyUpdates}
                      disabled={!notificationsEnabled}
                    />
                  </SettingsRow>
                </SettingsPanelRow>
              </SettingsPanel>
            </SettingsGroup>

            {/* Clipboard */}
            <SettingsGroup id="clipboard" title={t("settingsPage.general.clipboard.title")}>
              <SettingsPanel>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.general.clipboard.autoPaste")}
                    description={t("settingsPage.general.clipboard.autoPasteDescription")}
                  >
                    <Toggle checked={autoPasteEnabled} onChange={setAutoPasteEnabled} />
                  </SettingsRow>
                </SettingsPanelRow>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.general.clipboard.keepInClipboard")}
                    description={t("settingsPage.general.clipboard.keepInClipboardDescription")}
                  >
                    <Toggle
                      checked={keepTranscriptionInClipboard}
                      onChange={setKeepTranscriptionInClipboard}
                    />
                  </SettingsRow>
                </SettingsPanelRow>
              </SettingsPanel>
            </SettingsGroup>

            <SettingsGroup id="tour" title={t("tour.settings.title")}>
              <SettingsPanel>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("tour.settings.replay")}
                    description={t("tour.settings.replayDescription")}
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      // Closing Settings first: the tour points at the window
                      // behind this modal, and a spotlight under a dialog is
                      // just a dimmed dialog.
                      onClick={() => {
                        onRequestClose?.();
                        restartTour();
                      }}
                    >
                      {t("tour.settings.replayAction")}
                    </Button>
                  </SettingsRow>
                </SettingsPanelRow>
              </SettingsPanel>
            </SettingsGroup>

            {/* Save Notes as Files */}
            <SettingsGroup id="noteFiles" title={t("settings.noteFiles.title")}>
              <SettingsPanel>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settings.noteFiles.title")}
                    description={t("settings.noteFiles.description")}
                  >
                    <Toggle checked={noteFilesEnabled} onChange={handleNoteFilesToggle} />
                  </SettingsRow>
                </SettingsPanelRow>
                {noteFilesEnabled && (
                  <>
                    <SettingsPanelRow>
                      <SettingsRow
                        label={t("settings.noteFiles.path")}
                        description={noteFilesPath || noteFilesDefaultPath || "..."}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={handleNoteFilesChangePath}
                        >
                          {t("settings.noteFiles.changePath")}
                        </Button>
                      </SettingsRow>
                    </SettingsPanelRow>
                    <SettingsPanelRow>
                      <SettingsRow
                        label={t("settings.noteFiles.rebuild")}
                        description={t("settings.noteFiles.rebuildDescription")}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={noteFilesRebuilding}
                          onClick={handleNoteFilesRebuild}
                        >
                          {noteFilesRebuilding ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            t("settings.noteFiles.rebuild")
                          )}
                        </Button>
                      </SettingsRow>
                    </SettingsPanelRow>
                  </>
                )}
              </SettingsPanel>
            </SettingsGroup>

            {/* Floating Icon */}
            <SettingsGroup
              id="floatingIcon"
              title={t("settingsPage.general.floatingIcon.title")}
              description={t("settingsPage.general.floatingIcon.description")}
            >
              <SettingsPanel>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.general.floatingIcon.autoHide")}
                    description={t("settingsPage.general.floatingIcon.autoHideDescription")}
                  >
                    <Toggle checked={floatingIconAutoHide} onChange={setFloatingIconAutoHide} />
                  </SettingsRow>
                </SettingsPanelRow>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.general.floatingIcon.startPosition")}
                    description={t("settingsPage.general.floatingIcon.startPositionDescription")}
                  >
                    <select
                      aria-label={t("settingsPage.general.floatingIcon.startPosition")}
                      value={panelStartPosition}
                      onChange={(e) =>
                        setPanelStartPosition(
                          e.target.value as "bottom-right" | "center" | "bottom-left"
                        )
                      }
                      className={SELECT_CLASS}
                    >
                      <option value="bottom-right">
                        {t("settingsPage.general.floatingIcon.bottomRight")}
                      </option>
                      <option value="center">
                        {t("settingsPage.general.floatingIcon.center")}
                      </option>
                      <option value="bottom-left">
                        {t("settingsPage.general.floatingIcon.bottomLeft")}
                      </option>
                    </select>
                  </SettingsRow>
                </SettingsPanelRow>
              </SettingsPanel>
            </SettingsGroup>

            {/* Language */}
            <SettingsGroup
              id="language"
              title={t("settings.language.sectionTitle")}
              description={t("settings.language.sectionDescription")}
            >
              <SettingsPanel>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settings.language.uiLabel")}
                    description={t("settings.language.uiDescription")}
                  >
                    <LanguageSelector
                      value={uiLanguage}
                      onChange={setUiLanguage}
                      options={UI_LANGUAGE_OPTIONS}
                      className="min-w-32"
                    />
                  </SettingsRow>
                </SettingsPanelRow>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settings.language.transcriptionLabel")}
                    description={t("settings.language.transcriptionDescription")}
                  >
                    <LanguageSelector
                      value={preferredLanguage}
                      onChange={(value) =>
                        updateTranscriptionSettings({ preferredLanguage: value })
                      }
                    />
                  </SettingsRow>
                </SettingsPanelRow>
                {preferredLanguage === "auto" && (
                  <SettingsPanelRow>
                    <SettingsRow
                      label={t("settings.language.chineseScriptLabel")}
                      description={t("settings.language.chineseScriptDescription")}
                    >
                      <Select
                        value={chineseScriptPreference}
                        onValueChange={(value: ChineseScriptPreference) =>
                          updateTranscriptionSettings({ chineseScriptPreference: value })
                        }
                      >
                        <SelectTrigger className="h-7 w-44 text-xs rounded-lg px-2.5 [&>svg]:h-3 [&>svg]:w-3">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="as-transcribed">
                            {t("settings.language.chineseScriptAsTranscribed")}
                          </SelectItem>
                          <SelectItem value="simplified">
                            {t("settings.language.chineseScriptSimplified")}
                          </SelectItem>
                          <SelectItem value="traditional">
                            {t("settings.language.chineseScriptTraditional")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </SettingsRow>
                  </SettingsPanelRow>
                )}
              </SettingsPanel>
            </SettingsGroup>

            {/* Startup */}
            <SettingsGroup
              id="startup"
              title={t("settingsPage.general.startup.title")}
              description={t("settingsPage.general.startup.description")}
            >
              <SettingsPanel>
                <SettingsPanelRow>
                  <SettingsRow
                    icon={<Rocket size={16} />}
                    label={t("settingsPage.general.startup.launchAtLogin")}
                    description={t("settingsPage.general.startup.launchAtLoginDescription")}
                  >
                    <Toggle
                      checked={autoStartEnabled}
                      onChange={(checked: boolean) => handleAutoStartChange(checked)}
                      disabled={autoStartLoading}
                    />
                  </SettingsRow>
                </SettingsPanelRow>
                {autoStartNeedsApproval && (
                  <SettingsPanelRow>
                    <Alert variant="warning">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>
                        {t("settingsPage.general.startup.needsApproval.title")}
                      </AlertTitle>
                      <AlertDescription className="space-y-2">
                        <p>{t("settingsPage.general.startup.needsApproval.description")}</p>
                        <Button
                          onClick={() => void window.electronAPI?.openLoginItemsSettings?.()}
                          variant="outline"
                          size="sm"
                        >
                          {t("settingsPage.general.startup.needsApproval.action")}
                        </Button>
                      </AlertDescription>
                    </Alert>
                  </SettingsPanelRow>
                )}
                <SettingsPanelRow>
                  <SettingsRow
                    icon={<Minimize2 size={16} />}
                    label={t("settingsPage.general.startup.startMinimized")}
                    description={t("settingsPage.general.startup.startMinimizedDescription")}
                  >
                    <Toggle checked={startMinimized} onChange={setStartMinimized} />
                  </SettingsRow>
                </SettingsPanelRow>
                <SettingsPanelRow>
                  <SettingsRow
                    icon={<PanelTop size={16} />}
                    label={t("settingsPage.general.startup.showBar")}
                    description={t("settingsPage.general.startup.showBarDescription")}
                  >
                    <Toggle checked={showBarAtStartup} onChange={setShowBarAtStartup} />
                  </SettingsRow>
                </SettingsPanelRow>
                <SettingsPanelRow>
                  <SettingsRow
                    icon={<EyeOff size={16} />}
                    label={t("settingsPage.general.startup.barStealth")}
                    description={t("settingsPage.general.startup.barStealthDescription")}
                  >
                    <Toggle checked={overlayStealth} onChange={setOverlayStealth} />
                  </SettingsRow>
                </SettingsPanelRow>
              </SettingsPanel>
            </SettingsGroup>

            {/* Microphone */}
            <SettingsGroup
              id="microphone"
              title={t("settingsPage.general.microphone.title")}
              description={t("settingsPage.general.microphone.description")}
            >
              <SettingsPanel>
                <SettingsPanelRow>
                  <MicrophoneSettings
                    preferBuiltInMic={preferBuiltInMic}
                    selectedMicDeviceId={selectedMicDeviceId}
                    selectedMicDeviceLabel={selectedMicDeviceLabel}
                    micWarmHoldSeconds={micWarmHoldSeconds}
                    onPreferBuiltInChange={setPreferBuiltInMic}
                    onDeviceSelect={setSelectedMicDevice}
                    onMicWarmHoldSecondsChange={setMicWarmHoldSeconds}
                  />
                </SettingsPanelRow>
              </SettingsPanel>
            </SettingsGroup>

            {/* Dictionary */}
            <SettingsGroup
              id="dictionary"
              title={t("settingsPage.dictionary.autoLearnTitle", {
                defaultValue: "Auto-learn from corrections",
              })}
            >
              <SettingsPanel>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.dictionary.autoLearnTitle", {
                      defaultValue: "Auto-learn from corrections",
                    })}
                    description={t("settingsPage.dictionary.autoLearnDescription", {
                      defaultValue:
                        "When you correct a transcription in the target app, the corrected word is automatically added to your dictionary.",
                    })}
                  >
                    <Toggle checked={autoLearnCorrections} onChange={setAutoLearnCorrections} />
                  </SettingsRow>
                </SettingsPanelRow>
              </SettingsPanel>
            </SettingsGroup>

            {/* Wayland Paste Diagnostics — only on Linux + Wayland */}
            {ydotoolStatus?.isLinux && ydotoolStatus?.isWayland && (
              <SettingsGroup
                id="waylandPaste"
                title={t("settingsPage.general.waylandPaste.title", {
                  defaultValue: "Wayland Paste Setup",
                })}
                description={t("settingsPage.general.waylandPaste.description", {
                  defaultValue:
                    "Auto-paste on Wayland requires ydotool. Check the status of each component below.",
                })}
              >
                {(() => {
                  if (ydotoolStatus.isNixOS) {
                    return (
                      <NixOsPasteInfo status={ydotoolStatus} onRecheck={refreshYdotoolStatus} />
                    );
                  }
                  const checks = [
                    {
                      key: "hasYdotool",
                      label: "ydotool",
                      ok: ydotoolStatus.hasYdotool,
                      desc: t("settingsPage.general.waylandPaste.ydotoolDesc", {
                        defaultValue: "Input automation tool for Wayland",
                      }),
                      steps: [
                        {
                          title: t("settingsPage.general.waylandPaste.guide.ydotool.step1Title", {
                            defaultValue: "Install ydotool",
                          }),
                          desc: t("settingsPage.general.waylandPaste.guide.ydotool.step1Desc", {
                            defaultValue:
                              "Use your distribution's package manager to install ydotool.",
                          }),
                          cmds: [
                            { label: "Ubuntu / Pop!_OS / Debian", cmd: "sudo apt install ydotool" },
                            { label: "Fedora", cmd: "sudo dnf install ydotool" },
                            { label: "Arch Linux", cmd: "sudo pacman -S ydotool" },
                            { label: "openSUSE", cmd: "sudo zypper install ydotool" },
                          ],
                        },
                        {
                          title: t("settingsPage.general.waylandPaste.guide.ydotool.step2Title", {
                            defaultValue: "Verify installation",
                          }),
                          desc: t("settingsPage.general.waylandPaste.guide.ydotool.step2Desc", {
                            defaultValue: "Check that ydotool is available in your PATH.",
                          }),
                          cmds: [{ cmd: "which ydotool" }],
                        },
                      ],
                    },
                    {
                      key: "hasYdotoold",
                      label: "ydotoold",
                      ok: ydotoolStatus.hasYdotoold,
                      desc: t("settingsPage.general.waylandPaste.ydotooldDesc", {
                        defaultValue: "Daemon for ydotool (separate package on Ubuntu/Pop!_OS)",
                      }),
                      steps: [
                        {
                          title: t("settingsPage.general.waylandPaste.guide.ydotoold.step1Title", {
                            defaultValue: "Install ydotoold",
                          }),
                          desc: t("settingsPage.general.waylandPaste.guide.ydotoold.step1Desc", {
                            defaultValue:
                              "On Ubuntu and Pop!_OS, ydotoold is a separate package. On Fedora, it's included with ydotool.",
                          }),
                          cmds: [
                            {
                              label: "Ubuntu / Pop!_OS / Debian",
                              cmd: "sudo apt install ydotoold",
                            },
                            { label: "Fedora", cmd: "# Already included in the ydotool package" },
                            { label: "Arch Linux", cmd: "# Included in the ydotool package" },
                          ],
                        },
                      ],
                    },
                    {
                      key: "hasUinput",
                      label: "/dev/uinput",
                      ok: ydotoolStatus.hasUinput,
                      desc: t("settingsPage.general.waylandPaste.uinputDesc", {
                        defaultValue: "Kernel input device access",
                      }),
                      note: !ydotoolStatus.hasUinput
                        ? ydotoolStatus.hasUdevRule
                          ? t("settingsPage.general.waylandPaste.uinputRuleFound", {
                              defaultValue: "Rule present but not active. A reboot should fix it.",
                            })
                          : t("settingsPage.general.waylandPaste.uinputRuleMissing", {
                              defaultValue: "no udev rule found",
                            })
                        : undefined,
                      steps:
                        ydotoolStatus.hasUdevRule && !ydotoolStatus.hasUinput
                          ? [
                              {
                                title: t(
                                  "settingsPage.general.waylandPaste.guide.uinput.ruleFoundTitle",
                                  {
                                    defaultValue: "udev rule already configured",
                                  }
                                ),
                                desc: t(
                                  "settingsPage.general.waylandPaste.guide.uinput.ruleFoundDesc",
                                  {
                                    defaultValue:
                                      "The udev rule for /dev/uinput is already on your system but hasn't taken effect. Try reloading:",
                                  }
                                ),
                                cmds: [
                                  {
                                    cmd: "sudo udevadm control --reload-rules && sudo udevadm trigger /dev/uinput",
                                  },
                                ],
                              },
                              {
                                title: t(
                                  "settingsPage.general.waylandPaste.guide.uinput.rebootTitle",
                                  {
                                    defaultValue: "If reloading didn't help, reboot",
                                  }
                                ),
                                desc: t(
                                  "settingsPage.general.waylandPaste.guide.uinput.rebootDesc",
                                  {
                                    defaultValue:
                                      "On some distros, udev changes only apply after a full reboot. Restart your computer and come back to re-check.",
                                  }
                                ),
                              },
                            ]
                          : [
                              {
                                title: t(
                                  "settingsPage.general.waylandPaste.guide.uinput.step1Title",
                                  {
                                    defaultValue: "Create a udev rule",
                                  }
                                ),
                                desc: t(
                                  "settingsPage.general.waylandPaste.guide.uinput.step1Desc",
                                  {
                                    defaultValue:
                                      "This rule grants access to /dev/uinput for users in the input group.",
                                  }
                                ),
                                cmds: [
                                  {
                                    cmd: 'echo \'KERNEL=="uinput", GROUP="input", MODE="0660", TAG+="uaccess"\' | sudo tee /etc/udev/rules.d/70-uinput.rules',
                                  },
                                ],
                              },
                              {
                                title: t(
                                  "settingsPage.general.waylandPaste.guide.uinput.step2Title",
                                  {
                                    defaultValue: "Reload udev rules",
                                  }
                                ),
                                desc: t(
                                  "settingsPage.general.waylandPaste.guide.uinput.step2Desc",
                                  {
                                    defaultValue: "Apply the new rule without rebooting.",
                                  }
                                ),
                                cmds: [
                                  {
                                    cmd: "sudo udevadm control --reload-rules && sudo udevadm trigger /dev/uinput",
                                  },
                                ],
                              },
                            ],
                    },
                    {
                      key: "hasGroup",
                      label: t("settingsPage.general.waylandPaste.inputGroup", {
                        defaultValue: "input group",
                      }),
                      ok: ydotoolStatus.hasGroup,
                      desc: t("settingsPage.general.waylandPaste.inputGroupDesc", {
                        defaultValue: "User must be in the input group (requires re-login)",
                      }),
                      steps: [
                        {
                          title: t("settingsPage.general.waylandPaste.guide.group.step1Title", {
                            defaultValue: "Add your user to the input group",
                          }),
                          cmds: [{ cmd: "sudo usermod -aG input $USER" }],
                        },
                        {
                          title: t("settingsPage.general.waylandPaste.guide.group.step2Title", {
                            defaultValue: "Log out and back in",
                          }),
                          desc: t("settingsPage.general.waylandPaste.guide.group.step2Desc", {
                            defaultValue:
                              "Group changes only take effect after a new login session. Log out of your desktop and log back in, then reopen Snowy.",
                          }),
                        },
                      ],
                    },
                    {
                      key: "hasService",
                      label: t("settingsPage.general.waylandPaste.service", {
                        defaultValue: "systemd service",
                      }),
                      ok: ydotoolStatus.hasService,
                      desc: t("settingsPage.general.waylandPaste.serviceDesc", {
                        defaultValue: "User service file for auto-starting ydotoold",
                      }),
                      steps: [
                        {
                          title: t("settingsPage.general.waylandPaste.guide.service.step1Title", {
                            defaultValue: "Create the service directory",
                          }),
                          cmds: [{ cmd: "mkdir -p ~/.config/systemd/user" }],
                        },
                        {
                          title: t("settingsPage.general.waylandPaste.guide.service.step2Title", {
                            defaultValue: "Create the service file",
                          }),
                          desc: t("settingsPage.general.waylandPaste.guide.service.step2Desc", {
                            defaultValue:
                              "This creates a user-level systemd service that starts ydotoold automatically when you log in.",
                          }),
                          cmds: [
                            {
                              cmd: `cat > ~/.config/systemd/user/ydotoold.service << 'EOF'
[Unit]
Description=ydotoold - ydotool daemon
After=graphical-session.target
PartOf=graphical-session.target

[Service]
ExecStart=/usr/bin/ydotoold
Restart=on-failure
RestartSec=1s

[Install]
WantedBy=graphical-session.target
EOF`,
                            },
                          ],
                        },
                        {
                          title: t("settingsPage.general.waylandPaste.guide.service.step3Title", {
                            defaultValue: "Reload and enable",
                          }),
                          cmds: [
                            {
                              cmd: "systemctl --user daemon-reload && systemctl --user enable ydotoold",
                            },
                          ],
                        },
                      ],
                    },
                    {
                      key: "daemonRunning",
                      label: t("settingsPage.general.waylandPaste.daemon", {
                        defaultValue: "ydotoold daemon",
                      }),
                      ok: ydotoolStatus.daemonRunning,
                      desc: t("settingsPage.general.waylandPaste.daemonDesc", {
                        defaultValue: "Background service must be running",
                      }),
                      steps: [
                        {
                          title: t("settingsPage.general.waylandPaste.guide.daemon.step1Title", {
                            defaultValue: "Start the daemon",
                          }),
                          desc: t("settingsPage.general.waylandPaste.guide.daemon.step1Desc", {
                            defaultValue: "Start ydotoold and enable it so it runs on every login.",
                          }),
                          cmds: [
                            {
                              cmd: "systemctl --user enable ydotoold && systemctl --user start ydotoold",
                            },
                            {
                              label: "Arch Linux (service is named ydotool.service)",
                              cmd: "systemctl --user enable --now ydotool.service",
                            },
                          ],
                        },
                        {
                          title: t("settingsPage.general.waylandPaste.guide.daemon.step2Title", {
                            defaultValue: "Verify it's running",
                          }),
                          cmds: [
                            { cmd: "systemctl --user status ydotoold" },
                            {
                              label: "Arch Linux",
                              cmd: "systemctl --user status ydotool.service",
                            },
                          ],
                        },
                      ],
                    },
                  ];

                  if (ydotoolStatus.isKde) {
                    checks.push({
                      key: "hasXclip",
                      label: "xclip",
                      ok: ydotoolStatus.hasXclip || ydotoolStatus.hasXsel || false,
                      desc: t("settingsPage.general.waylandPaste.xclipDesc", {
                        defaultValue: "Clipboard tool for KDE Wayland paste (xclip or xsel)",
                      }),
                      steps: [
                        {
                          title: t("settingsPage.general.waylandPaste.guide.xclip.step1Title", {
                            defaultValue: "Install xclip",
                          }),
                          cmds: [
                            { cmd: "sudo dnf install xclip  # Fedora" },
                            { cmd: "sudo apt install xclip  # Debian/Ubuntu" },
                          ],
                        },
                      ],
                    });
                  }

                  const allOk = checks.every((c) => c.ok);
                  const activeGuide = checks.find((c) => c.key === ydotoolGuideKey);

                  return (
                    <>
                      {allOk ? (
                        <SettingsPanel>
                          <SettingsPanelRow>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <CircleCheck className="h-4 w-4 text-success" />
                                <span className="text-sm">
                                  {t("settingsPage.general.waylandPaste.allGoodDesc", {
                                    defaultValue: "Auto-paste is ready to go.",
                                  })}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={refreshYdotoolStatus}
                                aria-label={t("settingsPage.general.waylandPaste.recheck", {
                                  defaultValue: "Re-check",
                                })}
                                className="shrink-0 rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <RotateCw className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </SettingsPanelRow>
                        </SettingsPanel>
                      ) : (
                        <>
                          <div className="rounded-xl border border-border overflow-hidden">
                            <div className="divide-y divide-border">
                              {checks.map((item) => (
                                <div key={item.key} className="px-4 py-3">
                                  <div className="flex items-center gap-2.5">
                                    {item.ok ? (
                                      <CircleCheck className="h-4 w-4 shrink-0 text-success" />
                                    ) : (
                                      <CircleX className="h-4 w-4 shrink-0 text-destructive" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <span className="text-sm font-medium">{item.label}</span>
                                      <span className="text-xs text-muted-foreground ml-2">
                                        {item.desc}
                                      </span>
                                      {item.note && (
                                        <p className="text-[11px] text-warning dark:text-warning mt-0.5">
                                          {item.note}
                                        </p>
                                      )}
                                    </div>
                                    {!item.ok && (
                                      <button
                                        type="button"
                                        onClick={() => setYdotoolGuideKey(item.key)}
                                        className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                                      >
                                        <BookOpen className="w-3 h-3" />
                                        {t("settingsPage.general.waylandPaste.guide.open", {
                                          defaultValue: "Guide",
                                        })}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={refreshYdotoolStatus}
                            className="mt-3 flex items-center gap-1.5 rounded-sm text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <RotateCw className="w-3 h-3" />
                            {t("settingsPage.general.waylandPaste.recheck", {
                              defaultValue: "Re-check",
                            })}
                          </button>
                        </>
                      )}

                      {/* Step-by-step guide dialog */}
                      <Dialog
                        open={!!activeGuide}
                        onOpenChange={(open) => !open && setYdotoolGuideKey(null)}
                      >
                        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
                          {activeGuide && (
                            <>
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                  <BookOpen className="w-4 h-4" />
                                  {activeGuide.label}
                                </DialogTitle>
                                <DialogDescription>{activeGuide.desc}</DialogDescription>
                              </DialogHeader>
                              <div className="space-y-5 mt-2">
                                {activeGuide.steps.map((step, i) => (
                                  <div key={i}>
                                    <div className="flex items-start gap-3">
                                      <span className="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
                                        {i + 1}
                                      </span>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium">{step.title}</p>
                                        {step.desc && (
                                          <p className="text-xs text-muted-foreground mt-0.5">
                                            {step.desc}
                                          </p>
                                        )}
                                        {step.cmds && step.cmds.length > 0 && (
                                          <div className="mt-2 space-y-2">
                                            {step.cmds.map((c, j) => (
                                              <div key={j}>
                                                {c.label && (
                                                  <p className="text-[11px] text-muted-foreground mb-1">
                                                    {c.label}
                                                  </p>
                                                )}
                                                <div className="flex items-start gap-1.5">
                                                  <pre className="flex-1 text-[11px] bg-muted/60 rounded-md px-3 py-2 font-mono whitespace-pre-wrap break-all select-all overflow-x-auto">
                                                    {c.cmd}
                                                  </pre>
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      navigator.clipboard.writeText(c.cmd)
                                                    }
                                                    aria-label={t(
                                                      "settingsPage.general.waylandPaste.copy",
                                                      { defaultValue: "Copy" }
                                                    )}
                                                    className="shrink-0 rounded-md p-1.5 text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                                    title={t(
                                                      "settingsPage.general.waylandPaste.copy",
                                                      { defaultValue: "Copy" }
                                                    )}
                                                  >
                                                    <Copy className="w-3.5 h-3.5" />
                                                  </button>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </DialogContent>
                      </Dialog>
                    </>
                  );
                })()}
              </SettingsGroup>
            )}
          </SettingsSectionBody>
        );

      case "hotkeys": {
        const hotkeyRows: HotkeyMapRow[] = [
          {
            id: "dictationHotkey",
            icon: Mic,
            label: t("settingsPage.hotkeys.slots.dictation"),
            description: t("settingsPage.general.hotkey.description"),
            control: (
              <HotkeyListInput
                value={dictationKey}
                onChange={(list) => registerHotkey(list)}
                validate={validateDictationHotkey}
                disabled={isHotkeyRegistering}
                maxHotkeys={isUsingNativeShortcut ? 1 : undefined}
                required
                footerEnd={
                  effectiveDefaultHotkey &&
                  dictationKey &&
                  dictationKey !== effectiveDefaultHotkey ? (
                    <button
                      type="button"
                      onClick={() => registerHotkey(effectiveDefaultHotkey)}
                      disabled={isHotkeyRegistering}
                      className="rounded-sm text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    >
                      {t("settingsPage.general.hotkey.resetToDefault", {
                        hotkey: formatHotkeyLabel(effectiveDefaultHotkey),
                      })}
                    </button>
                  ) : null
                }
              />
            ),
            extra:
              !isUsingNativeShortcut || getCachedPlatform() === "linux" ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                      {t("settingsPage.general.hotkey.activationMode")}
                    </span>
                    <ActivationModeSelector value={activationMode} onChange={setActivationMode} />
                  </div>
                  {getCachedPlatform() === "linux" && activationMode === "push" && (
                    <div className="mt-2">
                      <LinuxPttSetupInfo isAvailable={linuxPttAvailable} />
                    </div>
                  )}
                </>
              ) : undefined,
          },
          {
            id: "voiceAgentHotkey",
            icon: Wand2,
            label: t("settingsPage.hotkeys.slots.voiceAgent"),
            description: t("settingsPage.general.voiceAgentHotkey.description"),
            control: (
              <HotkeyListInput
                value={voiceAgentKey}
                onChange={(list) => commitAgentHotkey(setVoiceAgentKey, list)}
                onClear={() => commitAgentHotkey(setVoiceAgentKey, "")}
                validate={validateVoiceAgentHotkey}
                disabled={isAgentHotkeyCommitting}
                maxHotkeys={isUsingNativeShortcut ? 1 : undefined}
              />
            ),
            suggestion: voiceAgentKey
              ? undefined
              : {
                  hotkey: getSuggestedHotkey("voiceAgent"),
                  disabled: isAgentHotkeyCommitting,
                  onApply: () =>
                    commitAgentHotkey(setVoiceAgentKey, getSuggestedHotkey("voiceAgent")),
                },
          },
          {
            id: "translationHotkey",
            icon: Languages,
            label: t("settingsPage.hotkeys.slots.translation"),
            description: t("settingsPage.general.translationHotkey.description"),
            control: (
              <HotkeyListInput
                value={translationKey}
                onChange={(list) => commitAgentHotkey(setTranslationKey, list)}
                onClear={() => commitAgentHotkey(setTranslationKey, "")}
                validate={validateTranslationHotkey}
                disabled={isAgentHotkeyCommitting}
                maxHotkeys={isUsingNativeShortcut ? 1 : undefined}
              />
            ),
            suggestion: translationKey
              ? undefined
              : {
                  hotkey: getSuggestedHotkey("translation"),
                  disabled: isAgentHotkeyCommitting,
                  onApply: () =>
                    commitAgentHotkey(setTranslationKey, getSuggestedHotkey("translation")),
                },
          },
          {
            id: "meetingHotkey",
            icon: Video,
            label: t("settingsPage.hotkeys.slots.meeting"),
            description: t("settingsPage.general.meetingHotkey.description"),
            control: (
              <HotkeyListInput
                value={meetingKey}
                onChange={(list) => registerMeetingHotkey(list)}
                onClear={async () => {
                  await window.electronAPI?.registerMeetingHotkey?.("");
                  setMeetingKey("");
                }}
                validate={validateMeetingHotkey}
                disabled={isMeetingHotkeyRegistering}
                maxHotkeys={isUsingNativeShortcut ? 1 : undefined}
              />
            ),
            suggestion: meetingKey
              ? undefined
              : {
                  hotkey: getSuggestedHotkey("meeting"),
                  disabled: isMeetingHotkeyRegistering,
                  onApply: () => registerMeetingHotkey(getSuggestedHotkey("meeting")),
                },
            extra: (
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                  {t("settingsPage.general.meetingHotkey.layoutLabel")}
                </span>
                <Select
                  value={meetingHotkeyLayoutMode}
                  onValueChange={(value) =>
                    setMeetingHotkeyLayoutMode(value as "side-panel" | "full-width")
                  }
                >
                  <SelectTrigger className="h-7 w-36 text-xs rounded-lg px-2.5 [&>svg]:h-3 [&>svg]:w-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      value="full-width"
                      className="text-xs py-1.5 pl-2.5 pr-7 rounded-md"
                    >
                      {t("settingsPage.general.meetingHotkey.layoutFullWidth")}
                    </SelectItem>
                    <SelectItem
                      value="side-panel"
                      className="text-xs py-1.5 pl-2.5 pr-7 rounded-md"
                    >
                      {t("settingsPage.general.meetingHotkey.layoutSidePanel")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ),
          },
          {
            id: "chatAgentHotkey",
            icon: MessageSquare,
            label: t("settingsPage.hotkeys.slots.chatAgent"),
            description: t("agentMode.settings.hotkeyDescription"),
            control: (
              <HotkeyListInput
                value={chatAgentKey}
                onChange={(list) => commitAgentHotkey(setChatAgentKey, list)}
                onClear={() => commitAgentHotkey(setChatAgentKey, "")}
                validate={validateChatAgentHotkey}
                disabled={isAgentHotkeyCommitting}
                maxHotkeys={isUsingNativeShortcut ? 1 : undefined}
              />
            ),
            suggestion: chatAgentKey
              ? undefined
              : {
                  hotkey: getSuggestedHotkey("chatAgent"),
                  disabled: isAgentHotkeyCommitting,
                  onApply: () =>
                    commitAgentHotkey(setChatAgentKey, getSuggestedHotkey("chatAgent")),
                },
          },
        ];

        // Rows for a hidden feature go with it — their slots are refused by the
        // hotkey manager, so leaving them on screen would offer a control that
        // silently does nothing.
        const visibleHotkeyRows = hotkeyRows.filter(
          (row) => DICTATION_ENABLED || !DICTATION_SETTINGS_IDS.has(row.id)
        );

        return (
          <SettingsSectionBody section="hotkeys">
            {isUsingHyprland && hyprlandConfigStatus && !hyprlandConfigStatus.canWrite && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>
                  {t("settingsPage.general.hotkey.hyprlandConfigWriteWarningTitle")}
                </AlertTitle>
                <AlertDescription>
                  {t("settingsPage.general.hotkey.hyprlandConfigWriteWarningDescription", {
                    path: hyprlandConfigStatus.path,
                  })}
                </AlertDescription>
              </Alert>
            )}

            <div>
              <div className="mb-2">
                <h3 className="text-[13px] font-semibold leading-tight tracking-tight text-foreground">
                  {t("settingsPage.hotkeys.title")}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t("settingsPage.hotkeys.description")}
                </p>
                {isUsingHyprland && (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {t("settingsPage.general.hotkey.hyprlandUnbindDescription")}
                  </p>
                )}
              </div>
              <HotkeyMap rows={visibleHotkeyRows} />
            </div>
          </SettingsSectionBody>
        );
      }

      case "speechToText":
      case "llms":
        return null;

      case "privacyData":
        return (
          <SettingsSectionBody section="privacyData">
            {/* Audio Retention */}
            <SettingsGroup id="audioRetention" title={t("settingsPage.privacy.audioRetention")}>
              <SettingsPanel>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.privacy.audioRetention")}
                    description={t("settingsPage.privacy.audioRetentionDescription")}
                  >
                    <select
                      aria-label={t("settingsPage.privacy.audioRetention")}
                      value={audioRetentionDays}
                      onChange={(e) => {
                        setAudioRetentionDays(parseInt(e.target.value, 10));
                      }}
                      className={SELECT_CLASS}
                    >
                      <option value={0}>{t("settingsPage.privacy.audioRetentionDisabled")}</option>
                      {audioRetentionDays > 0 &&
                        !RETENTION_DAY_OPTIONS.includes(audioRetentionDays) && (
                          <option value={audioRetentionDays}>
                            {t("settingsPage.privacy.retentionDays", {
                              count: audioRetentionDays,
                            })}
                          </option>
                        )}
                      {RETENTION_DAY_OPTIONS.map((days) => (
                        <option key={days} value={days}>
                          {t("settingsPage.privacy.retentionDays", { count: days })}
                        </option>
                      ))}
                    </select>
                  </SettingsRow>
                </SettingsPanelRow>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.privacy.audioStorageUsage")}
                    description={
                      audioStorageUsage.fileCount > 0
                        ? t("settingsPage.privacy.audioStorageFiles", {
                            count: audioStorageUsage.fileCount,
                            size: formatBytes(audioStorageUsage.totalBytes),
                          })
                        : t("settingsPage.privacy.audioStorageEmpty")
                    }
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={audioStorageUsage.fileCount === 0}
                      onClick={handleClearAllAudio}
                    >
                      {t("settingsPage.privacy.clearAllAudio")}
                    </Button>
                  </SettingsRow>
                </SettingsPanelRow>
              </SettingsPanel>
            </SettingsGroup>

            {/* Data Retention */}
            <SettingsGroup id="dataRetention" title={t("settingsPage.privacy.dataRetention")}>
              <SettingsPanel>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.privacy.dataRetention")}
                    description={t("settingsPage.privacy.dataRetentionDescription")}
                  >
                    <Toggle checked={dataRetentionEnabled} onChange={setDataRetentionEnabled} />
                  </SettingsRow>
                </SettingsPanelRow>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.privacy.transcriptRetention")}
                    description={t("settingsPage.privacy.transcriptRetentionDescription")}
                  >
                    <select
                      aria-label={t("settingsPage.privacy.transcriptRetention")}
                      value={transcriptRetentionDays}
                      disabled={!dataRetentionEnabled}
                      onChange={(e) => setTranscriptRetentionDays(parseInt(e.target.value, 10))}
                      className={SELECT_CLASS}
                    >
                      <option value={0}>
                        {t("settingsPage.privacy.transcriptRetentionForever")}
                      </option>
                      {RETENTION_DAY_OPTIONS.map((days) => (
                        <option key={days} value={days}>
                          {t("settingsPage.privacy.retentionDays", { count: days })}
                        </option>
                      ))}
                    </select>
                  </SettingsRow>
                </SettingsPanelRow>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.privacy.saveDiscarded")}
                    description={t("settingsPage.privacy.saveDiscardedDescription")}
                  >
                    <Toggle
                      checked={saveDiscardedTranscriptions}
                      disabled={!dataRetentionEnabled || audioRetentionDays === 0}
                      onChange={setSaveDiscardedTranscriptions}
                    />
                  </SettingsRow>
                </SettingsPanelRow>
              </SettingsPanel>
            </SettingsGroup>

            {/* Permissions */}
            <SettingsGroup
              id="permissions"
              title={t("settingsPage.permissions.title")}
              description={t("settingsPage.permissions.description")}
            >
              <div className="space-y-3">
                <PermissionCard
                  icon={Mic}
                  title={t("settingsPage.permissions.microphoneTitle")}
                  description={t("settingsPage.permissions.microphoneDescription")}
                  granted={permissionsHook.micPermissionGranted}
                  onRequest={permissionsHook.requestMicPermission}
                  buttonText={t("settingsPage.permissions.grantAccess")}
                />

                {(platform === "darwin" || canManageSystemAudioInApp(systemAudio)) && (
                  <>
                    {platform === "darwin" && (
                      <PermissionCard
                        icon={Shield}
                        title={t("settingsPage.permissions.accessibilityTitle")}
                        description={t("settingsPage.permissions.accessibilityDescription")}
                        granted={permissionsHook.accessibilityPermissionGranted}
                        onRequest={permissionsHook.requestAccessibilityPermission}
                        buttonText={t("settingsPage.permissions.grantAccess")}
                      />
                    )}
                    {canManageSystemAudioInApp(systemAudio) && (
                      <PermissionCard
                        icon={Monitor}
                        title={t("settingsPage.permissions.systemAudioTitle")}
                        description={t("settingsPage.permissions.systemAudioDescription")}
                        granted={systemAudio.granted}
                        onRequest={systemAudio.request}
                        buttonText={t("settingsPage.permissions.grantAccess")}
                        badge={t("settingsPage.permissions.optional")}
                      />
                    )}
                  </>
                )}
              </div>

              {!permissionsHook.micPermissionGranted && permissionsHook.micPermissionError && (
                <MicPermissionWarning
                  error={permissionsHook.micPermissionError}
                  onOpenSoundSettings={permissionsHook.openSoundInputSettings}
                  onOpenPrivacySettings={permissionsHook.openMicPrivacySettings}
                />
              )}

              {platform === "linux" &&
                permissionsHook.pasteToolsInfo &&
                !permissionsHook.pasteToolsInfo.available && (
                  <PasteToolsInfo
                    pasteToolsInfo={permissionsHook.pasteToolsInfo}
                    isChecking={permissionsHook.isCheckingPasteTools}
                    onCheck={permissionsHook.checkPasteToolsAvailability}
                  />
                )}

              {platform === "darwin" && (
                <div className="mt-5">
                  <p className="text-xs font-medium text-foreground mb-3">
                    {t("settingsPage.permissions.troubleshootingTitle")}
                  </p>
                  <SettingsPanel>
                    <SettingsPanelRow>
                      <SettingsRow
                        label={t("settingsPage.permissions.resetAccessibility.label")}
                        description={t(
                          "settingsPage.permissions.resetAccessibility.rowDescription"
                        )}
                      >
                        <Button
                          onClick={resetAccessibilityPermissions}
                          variant="ghost"
                          size="sm"
                          className="text-foreground/70 hover:text-foreground"
                        >
                          {t("settingsPage.permissions.troubleshoot")}
                        </Button>
                      </SettingsRow>
                    </SettingsPanelRow>
                  </SettingsPanel>
                </div>
              )}
            </SettingsGroup>
          </SettingsSectionBody>
        );

      case "system":
        return (
          <SettingsSectionBody section="system">
            {/* Software Updates */}
            <SettingsGroup id="updates" title={t("settingsPage.general.updates.title")}>
              <SettingsPanel>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.general.updates.currentVersion")}
                    description={
                      updateStatus.isDevelopment
                        ? t("settingsPage.general.updates.devMode")
                        : isUpdateAvailable
                          ? t("settingsPage.general.updates.newVersionAvailable")
                          : t("settingsPage.general.updates.latestVersion")
                    }
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs tabular-nums text-muted-foreground font-mono">
                        {currentVersion || t("settingsPage.general.updates.versionPlaceholder")}
                      </span>
                      {updateStatus.isDevelopment ? (
                        <Badge variant="warning">
                          {t("settingsPage.general.updates.badges.dev")}
                        </Badge>
                      ) : isUpdateAvailable ? (
                        <Badge variant="success">
                          {t("settingsPage.general.updates.badges.update")}
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          {t("settingsPage.general.updates.badges.latest")}
                        </Badge>
                      )}
                    </div>
                  </SettingsRow>
                </SettingsPanelRow>

                <SettingsPanelRow>
                  <div className="space-y-2.5">
                    <Button
                      onClick={async () => {
                        try {
                          const result = await checkForUpdates();
                          if (result && !result.updateAvailable) {
                            toast({
                              title: t("settingsPage.general.updates.dialogs.noUpdates.title"),
                              description: t(
                                "settingsPage.general.updates.dialogs.noUpdates.description"
                              ),
                            });
                          }
                        } catch {}
                      }}
                      disabled={checkingForUpdates || updateStatus.isDevelopment}
                      variant="outline"
                      className="w-full"
                      size="sm"
                    >
                      <RefreshCw
                        size={13}
                        className={`mr-1.5 ${checkingForUpdates ? "animate-spin" : ""}`}
                      />
                      {checkingForUpdates
                        ? t("settingsPage.general.updates.checking")
                        : t("settingsPage.general.updates.checkForUpdates")}
                    </Button>

                    {isUpdateAvailable && !updateStatus.updateDownloaded && (
                      <div className="space-y-2">
                        <Button
                          onClick={async () => {
                            try {
                              await downloadUpdate();
                            } catch {
                              showAlertDialog({
                                title: t(
                                  "settingsPage.general.updates.dialogs.downloadFailed.title"
                                ),
                                description: t(
                                  "settingsPage.general.updates.dialogs.downloadFailed.description"
                                ),
                              });
                            }
                          }}
                          disabled={downloadingUpdate}
                          variant="success"
                          className="w-full"
                          size="sm"
                        >
                          <Download
                            size={13}
                            className={`mr-1.5 ${downloadingUpdate ? "animate-pulse" : ""}`}
                          />
                          {downloadingUpdate
                            ? t("settingsPage.general.updates.downloading", {
                                progress: Math.round(updateDownloadProgress),
                              })
                            : t("settingsPage.general.updates.downloadUpdate", {
                                version: updateInfo?.version || "",
                              })}
                        </Button>

                        {downloadingUpdate && (
                          <div
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(updateDownloadProgress)}
                            aria-label={t("settingsPage.general.updates.downloading", {
                              progress: Math.round(updateDownloadProgress),
                            })}
                            className="h-1 w-full overflow-hidden rounded-full bg-muted"
                          >
                            <div
                              className="h-full rounded-full bg-success transition-[width] duration-200"
                              style={{
                                width: `${Math.min(100, Math.max(0, updateDownloadProgress))}%`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {updateStatus.updateDownloaded && (
                      <Button
                        onClick={() => {
                          showConfirmDialog({
                            title: t("settingsPage.general.updates.dialogs.installUpdate.title"),
                            description: t(
                              "settingsPage.general.updates.dialogs.installUpdate.description",
                              { version: updateInfo?.version || "" }
                            ),
                            confirmText: t(
                              "settingsPage.general.updates.dialogs.installUpdate.confirmText"
                            ),
                            onConfirm: async () => {
                              try {
                                await installUpdateAction();
                              } catch {
                                showAlertDialog({
                                  title: t(
                                    "settingsPage.general.updates.dialogs.installFailed.title"
                                  ),
                                  description: t(
                                    "settingsPage.general.updates.dialogs.installFailed.description"
                                  ),
                                });
                              }
                            },
                          });
                        }}
                        disabled={installInitiated}
                        className="w-full"
                        size="sm"
                      >
                        <RefreshCw
                          size={14}
                          className={`mr-2 ${installInitiated ? "animate-spin" : ""}`}
                        />
                        {installInitiated
                          ? t("settingsPage.general.updates.restarting")
                          : t("settingsPage.general.updates.installAndRestart")}
                      </Button>
                    )}
                  </div>

                  {updateInfo?.releaseNotes && (
                    <div className="mt-4 pt-4 border-t border-border/30">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                        {t("settingsPage.general.updates.whatsNew", {
                          version: updateInfo.version,
                        })}
                      </p>
                      <div
                        className="text-xs text-muted-foreground [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-1 [&_li]:pl-1 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_a]:text-link [&_a]:underline"
                        dangerouslySetInnerHTML={{ __html: updateInfo.releaseNotes }}
                      />
                    </div>
                  )}
                </SettingsPanelRow>
              </SettingsPanel>
            </SettingsGroup>

            {/* Developer Tools */}
            <SettingsGroup
              id="developerTools"
              title={t("developerSection.title")}
              description={t("developerSection.description")}
            >
              <DeveloperSection />
            </SettingsGroup>

            {/* Data Management */}
            <SettingsGroup
              id="dataManagement"
              title={t("settingsPage.developer.dataManagementTitle")}
              description={t("settingsPage.developer.dataManagementDescription")}
            >
              <div className="space-y-4">
                <SettingsPanel>
                  <SettingsPanelRow>
                    <SettingsRow
                      label={t("settingsPage.developer.modelCache")}
                      description={cachePathHint}
                    >
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.electronAPI?.openWhisperModelsFolder?.()}
                        >
                          <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                          {t("settingsPage.developer.open")}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleRemoveModels}
                          disabled={isRemovingModels}
                        >
                          {isRemovingModels
                            ? t("settingsPage.developer.removing")
                            : t("settingsPage.developer.clearCache")}
                        </Button>
                      </div>
                    </SettingsRow>
                  </SettingsPanelRow>
                </SettingsPanel>

                <SettingsPanel>
                  <SettingsPanelRow>
                    <SettingsRow
                      label={t("settingsPage.developer.replayOnboarding")}
                      description={t("settingsPage.developer.replayOnboardingDescription")}
                    >
                      <Button onClick={() => startOnboarding()} variant="outline" size="sm">
                        {t("settingsPage.developer.replayOnboardingAction")}
                      </Button>
                    </SettingsRow>
                  </SettingsPanelRow>
                </SettingsPanel>

                <SettingsPanel>
                  <SettingsPanelRow>
                    <SettingsRow
                      label={t("settingsPage.developer.resetAppData")}
                      description={t("settingsPage.developer.resetAppDataDescription")}
                    >
                      <Button
                        onClick={() => {
                          showConfirmDialog({
                            title: t("settingsPage.developer.resetAll.title"),
                            description: t("settingsPage.developer.resetAll.description"),
                            onConfirm: async () => {
                              try {
                                await window.electronAPI?.cleanupApp();
                                showAlertDialog({
                                  title: t("settingsPage.developer.resetAll.successTitle"),
                                  description: t(
                                    "settingsPage.developer.resetAll.successDescription"
                                  ),
                                });
                                setTimeout(() => {
                                  window.location.reload();
                                }, 1000);
                              } catch {
                                showAlertDialog({
                                  title: t("settingsPage.developer.resetAll.failedTitle"),
                                  description: t(
                                    "settingsPage.developer.resetAll.failedDescription"
                                  ),
                                });
                              }
                            },
                            variant: "destructive",
                            confirmText: t("settingsPage.developer.resetAll.confirmText"),
                          });
                        }}
                        variant="outline"
                        size="sm"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive"
                      >
                        {t("common.reset")}
                      </Button>
                    </SettingsRow>
                  </SettingsPanelRow>
                </SettingsPanel>
              </div>
            </SettingsGroup>
          </SettingsSectionBody>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => !open && hideConfirmDialog()}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
        variant={confirmDialog.variant}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
      />

      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => !open && hideAlertDialog()}
        title={alertDialog.title}
        description={alertDialog.description}
        onOk={() => {}}
      />

      {/* Mounted on first visit and kept alive so model-download progress and IPC
          listeners survive section switches. */}
      {hasMountedSpeechToText && (
        <TabPanel active={activeSection === "speechToText"}>
          <TabPanel active={speechTab === "dictation"}>
            <SettingsPanelBody>
              <TranscriptionSection
                cloudTranscriptionMode={cloudTranscriptionMode}
                setCloudTranscriptionMode={setCloudTranscriptionMode}
                useLocalWhisper={useLocalWhisper}
                setUseLocalWhisper={setUseLocalWhisper}
                updateTranscriptionSettings={updateTranscriptionSettings}
                cloudTranscriptionProvider={cloudTranscriptionProvider}
                setCloudTranscriptionProvider={setCloudTranscriptionProvider}
                cloudTranscriptionModel={cloudTranscriptionModel}
                setCloudTranscriptionModel={setCloudTranscriptionModel}
                localTranscriptionProvider={localTranscriptionProvider}
                setLocalTranscriptionProvider={setLocalTranscriptionProvider}
                whisperModel={whisperModel}
                setWhisperModel={setWhisperModel}
                parakeetModel={parakeetModel}
                setParakeetModel={setParakeetModel}
                cloudTranscriptionBaseUrl={cloudTranscriptionBaseUrl}
                setCloudTranscriptionBaseUrl={setCloudTranscriptionBaseUrl}
                transcriptionMode={transcriptionMode}
                setTranscriptionMode={setTranscriptionMode}
                remoteTranscriptionUrl={remoteTranscriptionUrl}
                setRemoteTranscriptionUrl={setRemoteTranscriptionUrl}
                remoteTranscriptionModel={remoteTranscriptionModel}
                setRemoteTranscriptionModel={setRemoteTranscriptionModel}
                showTranscriptionPreview={showTranscriptionPreview}
                setShowTranscriptionPreview={setShowTranscriptionPreview}
                toast={toast}
              />
              {transcriptionMode === "local" &&
                localTranscriptionProvider !== "nvidia" &&
                renderWhisperVadSettings("dictationVad")}
            </SettingsPanelBody>
          </TabPanel>

          <TabPanel active={speechTab === "noteRecording"}>
            <SettingsPanelBody>
              <SettingsGroup
                id="noteRecordingEngine"
                title={t("settingsModal.groupTitles.engine")}
                description={t("settingsModal.groupTitles.engineDescription")}
              >
                <MeetingTranscriptionPanel />
              </SettingsGroup>
              {transcriptionMode === "local" &&
                localTranscriptionProvider !== "nvidia" &&
                renderWhisperVadSettings("noteRecordingVad")}
            </SettingsPanelBody>
          </TabPanel>

          <TabPanel active={speechTab === "upload"}>
            <SettingsPanelBody>
              <SettingsGroup
                id="uploadEngine"
                title={t("settingsModal.groupTitles.engine")}
                description={t("settingsModal.groupTitles.engineDescription")}
              >
                <UploadTranscriptionPanel />
              </SettingsGroup>
            </SettingsPanelBody>
          </TabPanel>
        </TabPanel>
      )}

      {hasMountedLlms && (
        <TabPanel active={activeSection === "llms"}>
          <TabPanel active={llmTab === "dictationCleanup"}>
            <SettingsPanelBody>
              <AiModelsSection
                useCleanupModel={useCleanupModel}
                setUseCleanupModel={(value) => {
                  updateCleanupSettings({ useCleanupModel: value });
                }}
                toast={toast}
              />
              <SettingsGroup
                id="cleanupPrompts"
                title={t("settingsPage.prompts.title")}
                description={t("settingsPage.prompts.description")}
              >
                <PromptStudio />
              </SettingsGroup>
            </SettingsPanelBody>
          </TabPanel>

          <TabPanel active={llmTab === "dictationAgent"}>
            <DictationAgentSettings />
          </TabPanel>

          <TabPanel active={llmTab === "dictationTranslation"}>
            <DictationTranslationSettings />
          </TabPanel>

          <TabPanel active={llmTab === "actions"}>
            <ActionsSettings />
          </TabPanel>

          <TabPanel active={llmTab === "chatIntelligence"}>
            <ChatAgentSettings />
          </TabPanel>
        </TabPanel>
      )}
      {renderSectionContent()}
    </>
  );
}
