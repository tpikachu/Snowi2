import React, { Suspense, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { Download, RefreshCw, Loader2, Zap, ChevronLeft, PanelLeftOpen } from "lucide-react";
import { ConfirmDialog, AlertDialog } from "./ui/dialog";
import { Tooltip } from "./ui/tooltip";
import { cn } from "./lib/utils";
import { useDialogs } from "../hooks/useDialogs";
import { useHotkey } from "../hooks/useHotkey";
import { useToast } from "./ui/useToast";
import { useUpdater } from "../hooks/useUpdater";
import { useSettings } from "../hooks/useSettings";
import {
  useTranscriptions,
  useShowDiscarded,
  initializeTranscriptions,
  removeTranscription as removeFromStore,
  updateTranscription as updateInStore,
  clearTranscriptions as clearStore,
} from "../stores/transcriptionStore";
import { getSettings, useSettingsStore } from "../stores/settingsStore";
import {
  useIsMeetingMode,
  useIsNarrowWindow,
  useMeetingRecordingStore,
} from "../stores/meetingRecordingStore";
import IconRail, { type ControlPanelView } from "./shell/IconRail";
import ContextPane from "./shell/ContextPane";
import { ContextPaneSlotContext, useContextPaneCollapse } from "./shell/contextPaneSlot";
import ActivityFeed from "./activity/ActivityFeed";
import ActivityFilters from "./activity/ActivityFilters";
import { useActivityFeed } from "./activity/useActivityFeed";
import MeetingRecordingMount from "./MeetingRecordingMount";
import MeetingRecordingPill from "./notes/MeetingRecordingPill";
import WindowControls from "./WindowControls";

import { getCachedPlatform } from "../utils/platform";
import { isAccessibilitySkipped } from "../utils/permissions";
import {
  setActiveNoteId,
  setActiveFolderId,
  navigateToContainer,
  useActiveNoteId,
  initializeNotes,
} from "../stores/noteStore";
import { executeTranslationChain, shouldRunTranslateStep } from "../helpers/translationChain";
import { applyChineseScript, resolveChineseScriptTarget } from "../utils/chineseScript";
import BackgroundActionToastListener from "./notes/BackgroundActionToastListener";
import type { NoteItem } from "../types/electron";
import logger from "../utils/logger";

const platform = getCachedPlatform();

// macOS draws its traffic lights over the top-left of the frameless window.
// The icon rail normally takes that corner and starts below them; only the
// side-panel layout, which drops the rail, has to inset its header instead.
const MAC_TRAFFIC_LIGHT_INSET_PX = 84;

const railUpdateButtonClass = [
  "relative flex size-9 items-center justify-center rounded-md",
  "outline-none transition-colors duration-150 ease-snap",
  "focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
].join(" ");

// Bump to force a one-time full semantic reindex on next launch (see the
// reindex effect for the per-version history).
const SEMANTIC_REINDEX_VERSION = 2;

const headerButtonClass = [
  "group flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground",
  "outline-none transition-colors duration-150 ease-snap",
  "hover:bg-surface-3 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
].join(" ");

const SettingsModal = React.lazy(() => import("./SettingsModal"));
const PersonalNotesView = React.lazy(() => import("./notes/PersonalNotesView"));
const DictionaryView = React.lazy(() => import("./DictionaryView"));
const UploadAudioView = React.lazy(() => import("./notes/UploadAudioView"));
const ChatView = React.lazy(() => import("./chat/ChatView"));
const CommandSearch = React.lazy(() => import("./CommandSearch"));

interface ControlPanelProps {
  /** Open the settings modal at this section on mount (e.g. after onboarding). */
  initialSettingsSection?: string;
}

export default function ControlPanel({ initialSettingsSection }: ControlPanelProps = {}) {
  const { t } = useTranslation();
  const history = useTranscriptions();
  const [isLoading, setIsLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(!!initialSettingsSection);
  const [settingsSection, setSettingsSection] = useState<string | undefined>(
    initialSettingsSection
  );
  const [aiCTADismissed, setAiCTADismissed] = useState(
    () => localStorage.getItem("aiCTADismissed") === "true"
  );
  const [showSearch, setShowSearch] = useState(false);
  const showDiscarded = useShowDiscarded();
  const [activeView, setActiveView] = useState<ControlPanelView>("home");
  const { collapsed: contextPaneCollapsed, toggle: toggleContextPane } = useContextPaneCollapse();
  const [contextPaneNode, setContextPaneNode] = useState<HTMLElement | null>(null);
  const isMeetingMode = useIsMeetingMode();
  const isNarrowWindow = useIsNarrowWindow();
  const activeNoteId = useActiveNoteId();
  const isSidePanelLayout =
    isMeetingMode || (isNarrowWindow && activeView === "personal-notes" && activeNoteId != null);
  const activity = useActivityFeed(activeView === "home", history);
  // Upload and Dictionary have nothing to scope by, so they span the window.
  const hasContextPane =
    activeView === "home" || activeView === "chat" || activeView === "personal-notes";
  const showContextPane = hasContextPane && !contextPaneCollapsed && !isSidePanelLayout;
  // Sections hoist their own list/tree into the pane through this slot; a null
  // node means "hidden", which is why `managed` is pinned true in the shell.
  const contextPaneSlot = useMemo(
    () => ({ node: showContextPane ? contextPaneNode : null, managed: true }),
    [showContextPane, contextPaneNode]
  );
  const recordingNoteId = useMeetingRecordingStore((s) => s.recordingNoteId);
  const recordingFolderId = useMeetingRecordingStore((s) => s.recordingFolderId);
  const [meetingRecordingRequest, setMeetingRecordingRequest] = useState<{
    noteId: number;
    folderId: number;
    event: any;
  } | null>(null);
  const [gpuAccelAvailable, setGpuAccelAvailable] = useState<{
    transcription: boolean;
    intelligence: boolean;
  }>({
    transcription: false,
    intelligence: false,
  });
  const [gpuBannerDismissed, setGpuBannerDismissed] = useState(
    () => localStorage.getItem("gpuBannerDismissedUnified") === "true"
  );
  const updateReadyToastShown = useRef(false);
  const updateErrorToastShown = useRef<Error | null>(null);
  const { hotkey } = useHotkey();
  const { toast } = useToast();
  const { useLocalWhisper, localTranscriptionProvider, useCleanupModel } = useSettings();

  const {
    status: updateStatus,
    downloadProgress,
    isDownloading,
    isInstalling,
    downloadUpdate,
    installUpdate,
    error: updateError,
  } = useUpdater();

  const {
    confirmDialog,
    alertDialog,
    showConfirmDialog,
    showAlertDialog,
    hideConfirmDialog,
    hideAlertDialog,
  } = useDialogs();

  const loadTranscriptions = useCallback(
    async (includeDiscarded?: boolean) => {
      try {
        setIsLoading(true);
        await initializeTranscriptions(undefined, includeDiscarded);
      } catch {
        showAlertDialog({
          title: t("controlPanel.history.couldNotLoadTitle"),
          description: t("controlPanel.history.couldNotLoadDescription"),
        });
      } finally {
        setIsLoading(false);
      }
    },
    [showAlertDialog, t]
  );

  useEffect(() => {
    loadTranscriptions();
  }, [loadTranscriptions]);

  useEffect(() => {
    const { noteFilesEnabled, noteFilesPath } = useSettingsStore.getState();
    if (!noteFilesEnabled) return;
    window.electronAPI?.noteFilesSetEnabled?.(true, noteFilesPath || undefined, {
      skipRebuild: true,
    });
  }, []);

  // One-time background reindex, versioned: v1 backfilled space_id payloads
  // after the spaces migration; v2 backfills cloud-pulled notes, which were
  // never incrementally indexed before the upsert-from-cloud handler gained a
  // vector upsert. Delayed so the Qdrant sidecar has time to come up; if it
  // isn't ready yet the flag stays unset and the next launch retries.
  useEffect(() => {
    if (Number(localStorage.getItem("semanticReindexVersion")) >= SEMANTIC_REINDEX_VERSION) return;
    const timer = setTimeout(() => {
      window.electronAPI
        ?.semanticReindexAll?.()
        .then((result) => {
          if (result?.success) {
            localStorage.setItem("semanticReindexVersion", String(SEMANTIC_REINDEX_VERSION));
          }
        })
        .catch(() => {});
    }, 15_000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = platform === "darwin" ? e.metaKey : e.ctrlKey;
      if (mod && e.key === "k") {
        e.preventDefault();
        setShowSearch(true);
      } else if (mod && e.key === ",") {
        e.preventDefault();
        setShowSettings(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (updateStatus.updateDownloaded && !isDownloading) {
      if (!updateReadyToastShown.current) {
        updateReadyToastShown.current = true;
        toast({
          title: t("controlPanel.update.readyTitle"),
          description: t("controlPanel.update.readyDescription"),
          variant: "success",
        });
      }
    } else {
      updateReadyToastShown.current = false;
    }
  }, [updateStatus.updateDownloaded, isDownloading, toast, t]);

  useEffect(() => {
    if (updateError && updateError !== updateErrorToastShown.current) {
      updateErrorToastShown.current = updateError;
      toast({
        title: t("controlPanel.update.problemTitle"),
        description: t("controlPanel.update.problemDescription"),
        variant: "destructive",
      });
    }
    if (!updateError) {
      updateErrorToastShown.current = null;
    }
  }, [updateError, toast, t]);

  useEffect(() => {
    if (platform === "darwin" || gpuBannerDismissed) return;
    const detect = async () => {
      const results = { transcription: false, intelligence: false };
      if (useLocalWhisper && localTranscriptionProvider === "whisper") {
        try {
          const status = await window.electronAPI?.getCudaWhisperStatus?.();
          if (status?.gpuInfo.hasNvidiaGpu && status.gpuInfo.cudaSupported) {
            if (!status.downloaded) results.transcription = true;
          } else {
            const vulkan = await window.electronAPI?.getVulkanWhisperStatus?.();
            if (vulkan?.vulkan.available && !vulkan.downloaded) results.transcription = true;
          }
        } catch {}
      }
      if (useCleanupModel) {
        try {
          const [gpu, vulkan] = await Promise.all([
            window.electronAPI?.detectVulkanGpu?.(),
            window.electronAPI?.getLlamaVulkanStatus?.(),
          ]);
          if (gpu?.available && !vulkan?.downloaded) results.intelligence = true;
        } catch {}
      }
      setGpuAccelAvailable(results);
    };
    detect();
  }, [useLocalWhisper, localTranscriptionProvider, useCleanupModel, gpuBannerDismissed]);

  useEffect(() => {
    const drain = async () => {
      const data = await window.electronAPI?.getPendingMeetingNoteNavigation?.();
      if (!data) return;
      setActiveFolderId(data.folderId);
      setActiveNoteId(data.noteId);
      setActiveView("personal-notes");
      setMeetingRecordingRequest({
        noteId: data.noteId,
        folderId: data.folderId,
        event: data.event,
      });
      initializeNotes(null, 50, data.folderId);
      if (
        data.trigger === "hotkey" &&
        useSettingsStore.getState().meetingHotkeyLayoutMode === "side-panel"
      ) {
        window.electronAPI?.snapToMeetingMode?.();
      }
    };
    drain();
    const cleanup = window.electronAPI?.onMeetingNoteNavigationPending?.(drain);
    return () => cleanup?.();
  }, []);

  useEffect(() => {
    const drain = async () => {
      const data = await window.electronAPI?.getPendingNoteNavigation?.();
      if (!data) return;
      if (data.folderId) {
        setActiveFolderId(data.folderId);
        initializeNotes(null, 50, data.folderId);
      }
      setActiveNoteId(data.noteId);
      setActiveView("personal-notes");
    };
    drain();
    const cleanup = window.electronAPI?.onNoteNavigationPending?.(drain);
    return () => cleanup?.();
  }, []);

  useEffect(() => {
    const cleanup = window.electronAPI?.onShowSettings?.(() => {
      setShowSettings(true);
    });
    return () => cleanup?.();
  }, []);

  // When accessibility is missing on macOS, open the permissions settings page
  useEffect(() => {
    const cleanup = window.electronAPI?.onAccessibilityMissing?.(async () => {
      if (isAccessibilitySkipped()) return;
      setSettingsSection("privacyData");
      setShowSettings(true);
      toast({
        title: t("controlPanel.accessibilityMissing.title"),
        description: t("controlPanel.accessibilityMissing.description"),
        duration: 10000,
      });
    });
    return () => cleanup?.();
  }, [toast, t]);

  const handleMeetingRecordingRequestHandled = useCallback(
    () => setMeetingRecordingRequest(null),
    []
  );

  const handleExitMeetingMode = useCallback(() => {
    window.electronAPI?.restoreFromMeetingMode?.();
  }, []);

  const copyToClipboard = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast({
          title: t("controlPanel.history.copiedTitle"),
          description: t("controlPanel.history.copiedDescription"),
          variant: "success",
          duration: 2000,
        });
      } catch (err) {
        toast({
          title: t("controlPanel.history.couldNotCopyTitle"),
          description: t("controlPanel.history.couldNotCopyDescription"),
          variant: "destructive",
        });
      }
    },
    [toast, t]
  );

  const deleteTranscription = useCallback(
    async (id: number) => {
      showConfirmDialog({
        title: t("controlPanel.history.deleteTitle"),
        description: t("controlPanel.history.deleteDescription"),
        onConfirm: async () => {
          try {
            const result = await window.electronAPI.deleteTranscription(id);
            if (result.success) {
              removeFromStore(id);
            } else {
              showAlertDialog({
                title: t("controlPanel.history.couldNotDeleteTitle"),
                description: t("controlPanel.history.couldNotDeleteDescription"),
              });
            }
          } catch {
            showAlertDialog({
              title: t("controlPanel.history.couldNotDeleteTitle"),
              description: t("controlPanel.history.couldNotDeleteDescriptionGeneric"),
            });
          }
        },
        variant: "destructive",
      });
    },
    [showConfirmDialog, showAlertDialog, t]
  );

  const clearAllTranscriptions = useCallback(() => {
    showConfirmDialog({
      title: t("controlPanel.history.clearAllTitle"),
      description: t("controlPanel.history.clearAllDescription"),
      onConfirm: async () => {
        try {
          const result = await window.electronAPI.clearTranscriptions();
          if (result.success) {
            clearStore();
            toast({
              title: t("controlPanel.history.clearAllSuccess"),
              variant: "success",
              duration: 2000,
            });
          } else {
            showAlertDialog({
              title: t("controlPanel.history.clearAllErrorTitle"),
              description: t("controlPanel.history.clearAllErrorDescription"),
            });
          }
        } catch {
          showAlertDialog({
            title: t("controlPanel.history.clearAllErrorTitle"),
            description: t("controlPanel.history.clearAllErrorDescription"),
          });
        }
      },
      variant: "destructive",
    });
  }, [showConfirmDialog, showAlertDialog, toast, t]);

  const showAudioInFolder = useCallback(
    async (id: number) => {
      try {
        const result = await window.electronAPI.showAudioInFolder(id);
        if (!result?.success) {
          toast({
            title: t("controlPanel.history.audioNotFound"),
            variant: "destructive",
          });
        }
      } catch {
        toast({
          title: t("controlPanel.history.audioNotFound"),
          variant: "destructive",
        });
      }
    },
    [toast, t]
  );

  const retryTranscription = useCallback(
    async (id: number, options?: { isRecover?: boolean }) => {
      try {
        const s = getSettings();
        const result = await window.electronAPI.retryTranscription(id, {
          useLocalWhisper: s.useLocalWhisper,
          localTranscriptionProvider: s.localTranscriptionProvider,
          cloudTranscriptionMode: s.cloudTranscriptionMode,
          cloudTranscriptionProvider: s.cloudTranscriptionProvider,
          cloudTranscriptionModel: s.cloudTranscriptionModel,
          cloudTranscriptionBaseUrl: s.cloudTranscriptionBaseUrl,
          cortiEnvironment: s.cortiEnvironment,
          cortiTenant: s.cortiTenant,
          parakeetModel: s.parakeetModel,
          whisperModel: s.whisperModel,
          preferredLanguage: s.preferredLanguage,
          transcriptionMode: s.transcriptionMode,
          remoteTranscriptionType: s.remoteTranscriptionType,
          remoteTranscriptionUrl: s.remoteTranscriptionUrl,
          remoteTranscriptionModel: s.remoteTranscriptionModel,
        });
        if (result.success && result.transcription) {
          const rawText = result.transcription.text;
          let finalTranscription = result.transcription;

          // A translation dictation must re-run cleanup-then-translate on retry, not plain cleanup.
          let handledTranslation = false;
          let translationApplied = false;
          if (result.transcription.route_kind === "translation") {
            handledTranslation = true;
            try {
              const [
                { default: ReasoningService },
                { resolveReasoningRoute },
                { getEffectiveCleanupModel, getSettings: getEffectiveSettings },
              ] = await Promise.all([
                import("../services/ReasoningService"),
                import("../helpers/audioManager"),
                import("../stores/settingsStore"),
              ]);
              const settings = getEffectiveSettings();
              const agentName = localStorage.getItem("agentName") || null;
              const route = resolveReasoningRoute(rawText, settings, agentName, false, true);
              if (route.kind === "translation") {
                const { text, translated } = await executeTranslationChain({
                  text: rawText,
                  cleanupReachable: route.cleanupReachable,
                  runCleanup: (currentText: string) =>
                    ReasoningService.processText(
                      currentText,
                      getEffectiveCleanupModel(),
                      agentName,
                      route.cleanupConfig
                    ),
                  runTranslate: (currentText: string) =>
                    ReasoningService.processText(currentText, route.model, agentName, route.config),
                  shouldTranslate: shouldRunTranslateStep(
                    settings.translationSourceLanguage,
                    settings.translationTargetLanguage
                  ),
                  onCleanupError: (cleanupError: Error) =>
                    logger.warn(
                      "Cleanup step failed in translation chain, translating raw transcript",
                      { error: cleanupError.message },
                      "transcription"
                    ),
                  onEmptyTranslate: () =>
                    logger.warn(
                      "Translation step returned empty text, keeping previous text",
                      {},
                      "transcription"
                    ),
                  onUnchangedTranslate: () =>
                    logger.warn(
                      "Translation step returned unchanged text, keeping source text",
                      {},
                      "transcription"
                    ),
                });
                translationApplied = translated;
                if (text !== rawText) {
                  const updated = await window.electronAPI.updateTranscriptionText(
                    id,
                    text,
                    rawText
                  );
                  if (updated.success && updated.transcription) {
                    finalTranscription = updated.transcription;
                  }
                }
              } else {
                // Translation disabled/unreachable since recording — fall through to cleanup.
                handledTranslation = false;
              }
            } catch {
              // Reasoning failed — keep the raw STT result
            }
          }

          // Apply AI reasoning if enabled
          if (!handledTranslation && useCleanupModel) {
            try {
              const [{ default: ReasoningService }, { getEffectiveCleanupModel, getSettings }] =
                await Promise.all([
                  import("../services/ReasoningService"),
                  import("../stores/settingsStore"),
                ]);
              const model = getEffectiveCleanupModel();
              if (model) {
                const agentName = localStorage.getItem("agentName") || null;
                const reasonedText = await ReasoningService.processText(rawText, model, agentName, {
                  disableThinking: getSettings().cleanupDisableThinking,
                });
                if (reasonedText && reasonedText !== rawText) {
                  const updated = await window.electronAPI.updateTranscriptionText(
                    id,
                    reasonedText,
                    rawText
                  );
                  if (updated.success && updated.transcription) {
                    finalTranscription = updated.transcription;
                  }
                }
              }
            } catch {
              // Reasoning failed — keep the raw STT result
            }
          }

          // Deterministic Chinese script pass, mirroring dictation (#975). Runs last so
          // it covers the cleaned/translated text, or the raw transcript when neither ran.
          // Same rule as audioManager.getEffectiveOutputLanguage: only a completed
          // translate step moves the text into the target language, so anything else
          // still has to be scripted as the language that was dictated.
          try {
            const outputLanguage =
              result.transcription.route_kind === "translation"
                ? (translationApplied
                    ? s.translationTargetLanguage
                    : s.translationSourceLanguage) || "auto"
                : s.preferredLanguage;
            const scripted = await applyChineseScript(
              finalTranscription.text,
              resolveChineseScriptTarget(
                outputLanguage,
                s.chineseScriptPreference,
                finalTranscription.text
              )
            );
            if (scripted !== finalTranscription.text) {
              const updated = await window.electronAPI.updateTranscriptionText(
                id,
                scripted,
                rawText
              );
              if (updated.success && updated.transcription) {
                finalTranscription = updated.transcription;
              }
            }
          } catch {
            // Conversion failed — keep the text as transcribed
          }

          updateInStore(finalTranscription);
          toast({
            title: t(
              options?.isRecover
                ? "controlPanel.history.discarded.recovered"
                : "controlPanel.history.retrySuccess"
            ),
          });
        } else {
          toast({
            title: t("controlPanel.history.retryError"),
            description: result.error,
            variant: "destructive",
          });
        }
      } catch {
        toast({
          title: t("controlPanel.history.retryError"),
          variant: "destructive",
        });
      }
    },
    [toast, t, useCleanupModel]
  );

  const toggleShowDiscarded = useCallback(() => {
    loadTranscriptions(!showDiscarded);
  }, [loadTranscriptions, showDiscarded]);

  const handleUpdateClick = async () => {
    if (updateStatus.updateDownloaded) {
      showConfirmDialog({
        title: t("controlPanel.update.installTitle"),
        description: t("controlPanel.update.installDescription"),
        onConfirm: async () => {
          try {
            await installUpdate();
          } catch (error) {
            toast({
              title: t("controlPanel.update.couldNotInstallTitle"),
              description: t("controlPanel.update.couldNotInstallDescription"),
              variant: "destructive",
            });
          }
        },
      });
    } else if (updateStatus.updateAvailable && !isDownloading) {
      try {
        await downloadUpdate();
      } catch (error) {
        toast({
          title: t("controlPanel.update.couldNotDownloadTitle"),
          description: t("controlPanel.update.couldNotDownloadDescription"),
          variant: "destructive",
        });
      }
    }
  };

  const isUpdatePending =
    !updateStatus.isDevelopment &&
    (updateStatus.updateAvailable ||
      updateStatus.updateDownloaded ||
      isDownloading ||
      isInstalling);

  const updateActionLabel = isInstalling
    ? t("controlPanel.update.installing")
    : isDownloading
      ? `${Math.round(downloadProgress)}%`
      : updateStatus.updateDownloaded
        ? t("controlPanel.update.installButton")
        : t("controlPanel.update.availableButton");

  const updateActionIcon = isInstalling ? (
    <Loader2 size={15} className="animate-spin" />
  ) : isDownloading ? (
    <Loader2 size={15} className="animate-spin" />
  ) : updateStatus.updateDownloaded ? (
    <RefreshCw size={15} />
  ) : (
    <Download size={15} />
  );

  // The frameless window has no OS title, so the header carries the section
  // name. Reuses the rail's labels so the two never drift apart.
  const viewTitles: Record<ControlPanelView, string> = {
    home: t("sidebar.home"),
    chat: t("sidebar.chat"),
    "personal-notes": t("sidebar.notes"),
    upload: t("sidebar.upload"),
    dictionary: t("sidebar.dictionary"),
  };

  const contextPaneTitles: Partial<Record<ControlPanelView, string>> = {
    home: t("activity.paneTitle"),
    chat: t("sidebar.chat"),
    "personal-notes": t("sidebar.notes"),
  };

  // The rail owns the window's left edge everywhere except the side-panel
  // layout, which drops it — only then does the header inherit the inset.
  const headerLeftInset =
    platform === "darwin" && isSidePanelLayout ? MAC_TRAFFIC_LIGHT_INSET_PX : 8;

  const openNoteFromFeed = useCallback((note: NoteItem) => {
    if (note.folder_id != null) setActiveFolderId(note.folder_id);
    else navigateToContainer(note.space_id, null);
    setActiveNoteId(note.id);
    setActiveView("personal-notes");
  }, []);

  const jumpToActivityGroup = useCallback((groupId: string) => {
    document.getElementById(groupId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="h-screen bg-background flex flex-col">
      <MeetingRecordingMount />
      <MeetingRecordingPill
        activeView={activeView}
        activeNoteId={activeNoteId}
        onReturnToNote={() => {
          setActiveView("personal-notes");
          setActiveFolderId(recordingFolderId);
          setActiveNoteId(recordingNoteId);
        }}
      />
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={hideConfirmDialog}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
        variant={confirmDialog.variant}
      />

      <AlertDialog
        open={alertDialog.open}
        onOpenChange={hideAlertDialog}
        title={alertDialog.title}
        description={alertDialog.description}
        onOk={() => {}}
      />

      {showSettings && (
        <Suspense fallback={null}>
          <SettingsModal
            open={showSettings}
            onOpenChange={(open) => {
              setShowSettings(open);
              if (!open) setSettingsSection(undefined);
            }}
            initialSection={settingsSection}
          />
        </Suspense>
      )}

      {showSearch && (
        <Suspense fallback={null}>
          <CommandSearch
            open={showSearch}
            onOpenChange={setShowSearch}
            transcriptions={history}
            onNoteSelect={(id, folderId, spaceId) => {
              if (folderId != null) setActiveFolderId(folderId);
              else if (spaceId != null) navigateToContainer(spaceId, null);
              setActiveNoteId(id);
              setActiveView("personal-notes");
            }}
            onContainerSelect={(spaceId, folderId) => {
              navigateToContainer(spaceId, folderId);
              setActiveView("personal-notes");
            }}
            onTranscriptSelect={() => {
              setActiveView("home");
            }}
          />
        </Suspense>
      )}

      <ContextPaneSlotContext.Provider value={contextPaneSlot}>
        <div className="flex flex-1 overflow-hidden">
          {!isSidePanelLayout && (
            <IconRail
              activeView={activeView}
              onViewChange={setActiveView}
              onOpenSearch={() => setShowSearch(true)}
              onOpenSettings={() => {
                setSettingsSection(undefined);
                setShowSettings(true);
              }}
              updateAction={
                isUpdatePending ? (
                  <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                    <Tooltip content={updateActionLabel} side="right" showOnFocus>
                      <button
                        type="button"
                        onClick={handleUpdateClick}
                        disabled={isInstalling || isDownloading}
                        aria-label={updateActionLabel}
                        className={cn(
                          railUpdateButtonClass,
                          updateStatus.updateDownloaded
                            ? "bg-primary/10 text-primary dark:bg-primary/15"
                            : "text-muted-foreground hover:bg-surface-3 hover:text-foreground"
                        )}
                      >
                        {updateActionIcon}
                      </button>
                    </Tooltip>
                  </div>
                ) : undefined
              }
            />
          )}

          {showContextPane && (
            <ContextPane
              title={contextPaneTitles[activeView] ?? viewTitles[activeView]}
              onCollapse={toggleContextPane}
            >
              {activeView === "home" ? (
                <ActivityFilters
                  filter={activity.filter}
                  onFilterChange={activity.setFilter}
                  counts={activity.counts}
                  groups={activity.groups}
                  showDiscarded={showDiscarded}
                  onToggleDiscarded={toggleShowDiscarded}
                  onJumpToGroup={jumpToActivityGroup}
                />
              ) : (
                <div ref={setContextPaneNode} className="flex min-h-0 flex-1 flex-col" />
              )}
            </ContextPane>
          )}

          <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <header
              className="relative z-20 flex h-11 w-full shrink-0 items-center gap-2 border-b border-border-subtle bg-background pr-2"
              style={
                { WebkitAppRegion: "drag", paddingLeft: headerLeftInset } as React.CSSProperties
              }
            >
              {isSidePanelLayout ? (
                <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                  <Button
                    variant="outline-flat"
                    size="sm"
                    onClick={handleExitMeetingMode}
                    className="h-7 px-2.5 pl-1.5 gap-1"
                  >
                    <ChevronLeft size={14} strokeWidth={1.8} />
                    {t("controlPanel.backToNotes")}
                  </Button>
                </div>
              ) : (
                // With the pane open it already carries the section name, so
                // the content header stays a bare drag strip.
                !showContextPane && (
                  <>
                    {hasContextPane && (
                      <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                        <button
                          onClick={toggleContextPane}
                          aria-label={t("shell.contextPane.expand")}
                          aria-expanded={false}
                          className={headerButtonClass}
                        >
                          <PanelLeftOpen size={15} />
                        </button>
                      </div>
                    )}
                    <h1 className="truncate text-[13px] font-medium leading-none tracking-tight text-foreground">
                      {viewTitles[activeView]}
                    </h1>
                  </>
                )
              )}
              <div className="flex-1" />
              {platform !== "darwin" && (
                <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                  <WindowControls />
                </div>
              )}
            </header>
            <div className="flex-1 overflow-y-auto">
              {(gpuAccelAvailable.transcription || gpuAccelAvailable.intelligence) &&
                activeView === "home" &&
                !gpuBannerDismissed && (
                  <div className="px-5 pt-4">
                    <div className="mx-auto w-full max-w-3xl rounded-lg border border-primary/25 bg-primary-subtle/60 p-3">
                      <div className="flex items-start gap-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10">
                          <Zap size={15} className="text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground">
                            {t("controlPanel.gpu.bannerTitle")}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {t("controlPanel.gpu.bannerDescription")}
                          </p>
                          <div className="mt-2.5 flex items-center gap-2">
                            <Button
                              variant="default"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => {
                                setSettingsSection(
                                  gpuAccelAvailable.transcription ? "transcription" : "intelligence"
                                );
                                setShowSettings(true);
                              }}
                            >
                              {t("controlPanel.gpu.enableButton")}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-muted-foreground"
                              onClick={() => {
                                setGpuBannerDismissed(true);
                                localStorage.setItem("gpuBannerDismissedUnified", "true");
                              }}
                            >
                              {t("controlPanel.gpu.dismissButton")}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              {activeView === "home" && (
                <ActivityFeed
                  feed={activity}
                  isLoading={isLoading}
                  hotkey={hotkey}
                  aiCTADismissed={aiCTADismissed}
                  setAiCTADismissed={setAiCTADismissed}
                  useCleanupModel={useCleanupModel}
                  copyToClipboard={copyToClipboard}
                  deleteTranscription={deleteTranscription}
                  clearAllTranscriptions={clearAllTranscriptions}
                  onShowAudioInFolder={showAudioInFolder}
                  onRetryTranscription={retryTranscription}
                  onOpenNote={openNoteFromFeed}
                  onOpenSettings={(section) => {
                    setSettingsSection(section);
                    setShowSettings(true);
                  }}
                />
              )}
              {activeView === "chat" && (
                <Suspense fallback={null}>
                  <ChatView />
                </Suspense>
              )}
              {activeView === "personal-notes" && (
                <Suspense fallback={null}>
                  <PersonalNotesView
                    onOpenSettings={(section) => {
                      setSettingsSection(section);
                      setShowSettings(true);
                    }}
                    onOpenSearch={() => setShowSearch(true)}
                    meetingRecordingRequest={meetingRecordingRequest}
                    onMeetingRecordingRequestHandled={handleMeetingRecordingRequestHandled}
                  />
                </Suspense>
              )}
              {activeView === "dictionary" && (
                <Suspense fallback={null}>
                  <DictionaryView />
                </Suspense>
              )}
              {activeView === "upload" && (
                <Suspense fallback={null}>
                  <UploadAudioView
                    onNoteCreated={(noteId, folderId) => {
                      setActiveNoteId(noteId);
                      if (folderId) setActiveFolderId(folderId);
                      setActiveView("personal-notes");
                    }}
                    onOpenSettings={(section) => {
                      setSettingsSection(section);
                      setShowSettings(true);
                    }}
                  />
                </Suspense>
              )}
            </div>
          </main>
        </div>
      </ContextPaneSlotContext.Provider>
      <BackgroundActionToastListener />
    </div>
  );
}
