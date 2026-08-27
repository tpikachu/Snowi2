import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Download, Trash2, Cloud, Lock, X, Zap, Check, Loader2 } from "lucide-react";
import { ProviderIcon } from "./ui/ProviderIcon";
import { ProviderTabs } from "./ui/ProviderTabs";
import { ProviderGrid, type ProviderGridItem } from "./ui/ProviderGrid";
import ModelCardList from "./ui/ModelCardList";
import { DownloadProgressBar } from "./ui/DownloadProgressBar";
import ApiKeyInput from "./ui/ApiKeyInput";
import { ConfirmDialog } from "./ui/dialog";
import { useDialogs } from "../hooks/useDialogs";
import { useModelDownload, formatETA, type DownloadProgress } from "../hooks/useModelDownload";
import {
  getTranscriptionProviders,
  getStreamingTranscriptionProviders,
  TranscriptionProviderData,
  WHISPER_MODEL_INFO,
  PARAKEET_MODEL_INFO,
} from "../models/ModelRegistry";
import {
  MODEL_PICKER_COLORS,
  type ColorScheme,
  type ModelPickerStyles,
} from "../utils/modelPickerStyles";
import { useSettingsStore, type TranscriptionPolicyContext } from "../stores/settingsStore";
import { getRemoteProviderIcon } from "../utils/providerIcons";
import { createExternalLinkHandler } from "../utils/externalLinks";
import { normalizeBaseUrl } from "../config/constants";
import { GetApiKeyLink } from "./ui/GetApiKeyLink";
import { getCachedPlatform } from "../utils/platform";
import logger from "../utils/logger";
import { cn } from "./lib/utils";
import {
  PROVIDER_CREDENTIALS,
  type ProviderCredentialField,
} from "./transcription/providerCredentials";

interface LocalModel {
  model: string;
  size_mb?: number;
  downloaded?: boolean;
}

interface LocalModelCardProps {
  modelId: string;
  name: string;
  description: string;
  size: string;
  actualSizeMb?: number;
  isSelected: boolean;
  isDownloaded: boolean;
  isDownloading: boolean;
  isCancelling: boolean;
  isInstalling: boolean;
  recommended?: boolean;
  provider: string;
  languageLabel?: string;
  onSelect: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onCancel: () => void;
  styles: ModelPickerStyles;
}

function LocalModelCard({
  modelId,
  name,
  description,
  size,
  actualSizeMb,
  isSelected,
  isDownloaded,
  isDownloading,
  isCancelling,
  isInstalling,
  recommended,
  provider,
  languageLabel,
  onSelect,
  onDelete,
  onDownload,
  onCancel,
  styles: cardStyles,
}: LocalModelCardProps) {
  const { t } = useTranslation();
  const handleClick = () => {
    if (isDownloaded && !isSelected) {
      onSelect();
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`relative w-full text-left overflow-hidden rounded-md border transition-colors duration-200 group ${
        isSelected ? cardStyles.modelCard.selected : cardStyles.modelCard.default
      } ${isDownloaded && !isSelected ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-center gap-1.5 p-2">
        <div className="shrink-0">
          {isDownloaded ? (
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                isSelected
                  ? "bg-primary shadow-[0_0_5px_color-mix(in_oklab,var(--color-primary)_55%,transparent)] animate-[pulse-glow_2s_ease-in-out_infinite]"
                  : "bg-success shadow-[0_0_5px_color-mix(in_oklab,var(--color-success)_50%,transparent)]"
              }`}
            />
          ) : isDownloading ? (
            <div className="w-1.5 h-1.5 rounded-full bg-warning animate-[spinner-rotate_1s_linear_infinite]" />
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/20" />
          )}
        </div>

        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <ProviderIcon provider={provider} className="w-3.5 h-3.5 shrink-0" />
          <span className="font-semibold text-sm text-foreground truncate tracking-tight">
            {name}
          </span>
          <span className="text-xs text-muted-foreground/50 tabular-nums shrink-0">
            {actualSizeMb ? `${actualSizeMb}MB` : size}
          </span>
          {recommended && (
            <span className={cardStyles.badges.recommended}>{t("common.recommended")}</span>
          )}
          {languageLabel && (
            <span className="text-xs text-muted-foreground/50 font-medium shrink-0">
              {languageLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isDownloaded ? (
            <>
              {isSelected && (
                <span className="text-xs font-medium text-primary px-2 py-0.5 bg-primary/10 rounded-sm">
                  {t("common.active")}
                </span>
              )}
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-[color,opacity,transform] active:scale-95"
              >
                <Trash2 size={12} />
              </Button>
            </>
          ) : isDownloading ? (
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
              disabled={isCancelling || isInstalling}
              size="sm"
              variant="outline"
              className="h-6 px-2.5 text-xs text-destructive border-destructive/25 hover:bg-destructive/8"
            >
              <X size={11} className="mr-0.5" />
              {isCancelling ? "..." : t("common.cancel")}
            </Button>
          ) : (
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onDownload();
              }}
              size="sm"
              variant="default"
              className="h-6 px-2.5 text-xs"
            >
              <Download size={11} className="mr-1" />
              {t("common.download")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface OnboardingModelCardProps extends Omit<LocalModelCardProps, "styles"> {
  /** Live progress for this row while it is the model being downloaded. */
  progress?: DownloadProgress;
}

/**
 * Onboarding presentation of a local model: name, size in tabular figures,
 * a one-line description and the download state inline in the row. The whole
 * left region is a real button so the list is keyboard operable.
 */
function OnboardingModelCard({
  name,
  description,
  size,
  actualSizeMb,
  isSelected,
  isDownloaded,
  isDownloading,
  isCancelling,
  isInstalling,
  recommended,
  provider,
  languageLabel,
  progress,
  onSelect,
  onDelete,
  onDownload,
  onCancel,
}: OnboardingModelCardProps) {
  const { t } = useTranslation();
  const sizeLabel = actualSizeMb ? `${actualSizeMb} MB` : size;
  const percentage = progress?.percentage ?? 0;
  const indeterminate =
    !isInstalling && (progress?.totalBytes ?? 0) === 0 && (progress?.downloadedBytes ?? 0) > 0;
  const speedText = progress?.speed ? `${progress.speed.toFixed(1)} MB/s` : "";
  const etaText = progress?.eta ? formatETA(progress.eta) : "";

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border",
        "transition-[background-color,border-color,box-shadow] duration-150 ease-snap",
        isSelected
          ? "border-primary/45 bg-primary/8 dark:bg-primary/10 shadow-(--shadow-selected)"
          : "border-border-subtle bg-surface-1 hover:border-border-hover hover:bg-surface-2"
      )}
    >
      <div className="flex items-start">
        <button
          type="button"
          onClick={() => {
            if (!isSelected) onSelect();
          }}
          disabled={!isDownloaded}
          aria-pressed={isSelected}
          className={cn(
            "flex min-w-0 flex-1 items-start gap-3 rounded-lg px-3.5 py-3 text-left outline-none",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
            isDownloaded && !isSelected
              ? "cursor-pointer"
              : "cursor-default hover:cursor-default disabled:cursor-default"
          )}
        >
          <span
            className={cn(
              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
              "transition-colors duration-150 ease-snap",
              isSelected
                ? "border-primary bg-primary text-primary-foreground"
                : isDownloaded
                  ? "border-border-hover bg-transparent"
                  : "border-border bg-transparent"
            )}
          >
            {isSelected && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <ProviderIcon provider={provider} className="h-3.5 w-3.5 shrink-0" />
              <span className="text-sm font-medium tracking-tight text-foreground">{name}</span>
              <span className="text-xs text-muted-foreground tabular-figures" data-numeric>
                {sizeLabel}
              </span>
              {recommended && (
                <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary dark:bg-primary/15">
                  {t("common.recommended")}
                </span>
              )}
              {languageLabel && (
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  {languageLabel}
                </span>
              )}
            </span>
            <span className="mt-1 block text-xs leading-snug text-muted-foreground">
              {description}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1.5 py-3 pr-3">
          {isDownloaded ? (
            <>
              {isSelected && (
                <span className="rounded-sm bg-primary/12 px-2 py-0.5 text-[10px] font-medium text-primary dark:bg-primary/18">
                  {t("common.active")}
                </span>
              )}
              <Button
                onClick={onDelete}
                size="sm"
                variant="ghost"
                aria-label={t("common.delete")}
                className="h-7 w-7 p-0 text-muted-foreground/50 opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 size={13} />
              </Button>
            </>
          ) : isDownloading ? (
            <Button
              onClick={onCancel}
              disabled={isCancelling || isInstalling}
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs text-destructive border-destructive/25 hover:bg-destructive/8"
            >
              <X size={12} />
              {isCancelling ? "..." : t("common.cancel")}
            </Button>
          ) : (
            <Button onClick={onDownload} size="sm" className="h-7 px-2.5 text-xs">
              <Download size={12} />
              {t("common.download")}
            </Button>
          )}
        </div>
      </div>

      {isDownloading && (
        <div className="px-3.5 pb-3">
          <div
            className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-figures"
            data-numeric
          >
            {isInstalling ? (
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
            ) : (
              <span className="font-semibold text-primary">
                {indeterminate ? "···" : `${Math.round(percentage)}%`}
              </span>
            )}
            {!isInstalling && speedText && <span>{speedText}</span>}
            {!isInstalling && etaText && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span>{etaText}</span>
              </>
            )}
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-raised">
            {indeterminate ? (
              <div className="h-full w-1/3 rounded-full bg-primary animate-[indeterminate_1.5s_ease-in-out_infinite]" />
            ) : (
              <div
                className={cn("h-full rounded-full bg-primary", isInstalling && "animate-pulse")}
                style={{
                  width: `${isInstalling ? 100 : Math.min(percentage, 100)}%`,
                  transition: "width 300ms ease-out",
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface TranscriptionModelPickerProps {
  /** Settings scope whose provider/model keys this picker edits. */
  transcriptionContext?: TranscriptionPolicyContext;
  selectedCloudProvider: string;
  /**
   * Policy reconciliation only — a user-driven pick goes through
   * switchCloudTranscriptionProvider so the outgoing model survives the swap.
   */
  onCloudProviderSelect: (providerId: string) => void;
  selectedCloudModel: string;
  onCloudModelSelect: (modelId: string) => void;
  selectedLocalModel: string;
  onLocalModelSelect: (modelId: string) => void;
  selectedLocalProvider?: string;
  onLocalProviderSelect?: (providerId: string) => void;
  useLocalWhisper: boolean;
  onModeChange: (useLocal: boolean) => void;
  cloudTranscriptionBaseUrl?: string;
  setCloudTranscriptionBaseUrl?: (url: string) => void;
  className?: string;
  variant?: "onboarding" | "settings";
  mode?: "cloud" | "local";
  streamingOnly?: boolean;
}

const CLOUD_PROVIDER_TABS = [
  { id: "openai", name: "OpenAI" },
  { id: "groq", name: "Groq" },
  { id: "xai", name: "xAI" },
  { id: "mistral", name: "Mistral" },
  { id: "corti", name: "Corti" },
  { id: "tinfoil", name: "Tinfoil" },
  { id: "custom", name: "Custom" },
];

const TINFOIL_AUDIO_DOCS_URL = "https://docs.tinfoil.sh/models/audio";

const LOCAL_PROVIDER_TABS: Array<{ id: string; name: string; disabled?: boolean }> = [
  { id: "whisper", name: "OpenAI" },
  { id: "nvidia", name: "NVIDIA" },
];

interface ModeToggleProps {
  useLocalWhisper: boolean;
  onModeChange: (useLocal: boolean) => void;
}

function ModeToggle({ useLocalWhisper, onModeChange }: ModeToggleProps) {
  const { t } = useTranslation();
  return (
    <div className="relative flex p-0.5 rounded-lg bg-surface-1 border border-border-subtle shadow-(--shadow-raised)">
      <div
        className={`absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-md bg-surface-raised border border-border shadow-(--shadow-raised) transition-transform duration-150 ease-snap ${
          useLocalWhisper ? "translate-x-[calc(100%)]" : "translate-x-0"
        }`}
      />
      <button
        onClick={() => onModeChange(false)}
        className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md transition-colors duration-150 ${
          !useLocalWhisper ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Cloud className="w-3.5 h-3.5" />
        <span className="text-xs font-medium">{t("common.cloud")}</span>
      </button>
      <button
        onClick={() => onModeChange(true)}
        className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md transition-colors duration-150 ${
          useLocalWhisper ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Lock className="w-3.5 h-3.5" />
        <span className="text-xs font-medium">{t("common.local")}</span>
      </button>
    </div>
  );
}

export default function TranscriptionModelPicker({
  transcriptionContext = "dictation",
  selectedCloudProvider,
  onCloudProviderSelect,
  selectedCloudModel,
  onCloudModelSelect,
  selectedLocalModel,
  onLocalModelSelect,
  selectedLocalProvider = "whisper",
  onLocalProviderSelect,
  useLocalWhisper,
  onModeChange,
  cloudTranscriptionBaseUrl = "",
  setCloudTranscriptionBaseUrl,
  className = "",
  variant = "settings",
  mode,
  streamingOnly = false,
}: TranscriptionModelPickerProps) {
  const { t } = useTranslation();
  const switchCloudTranscriptionProvider = useSettingsStore(
    (s) => s.switchCloudTranscriptionProvider
  );
  const openaiApiKey = useSettingsStore((s) => s.openaiApiKey);
  const setOpenaiApiKey = useSettingsStore((s) => s.setOpenaiApiKey);
  const groqApiKey = useSettingsStore((s) => s.groqApiKey);
  const setGroqApiKey = useSettingsStore((s) => s.setGroqApiKey);
  const xaiApiKey = useSettingsStore((s) => s.xaiApiKey);
  const setXaiApiKey = useSettingsStore((s) => s.setXaiApiKey);
  const mistralApiKey = useSettingsStore((s) => s.mistralApiKey);
  const setMistralApiKey = useSettingsStore((s) => s.setMistralApiKey);
  const cortiClientId = useSettingsStore((s) => s.cortiClientId);
  const setCortiClientId = useSettingsStore((s) => s.setCortiClientId);
  const cortiClientSecret = useSettingsStore((s) => s.cortiClientSecret);
  const setCortiClientSecret = useSettingsStore((s) => s.setCortiClientSecret);
  const cortiEnvironment = useSettingsStore((s) => s.cortiEnvironment);
  const setCortiEnvironment = useSettingsStore((s) => s.setCortiEnvironment);
  const cortiTenant = useSettingsStore((s) => s.cortiTenant);
  const setCortiTenant = useSettingsStore((s) => s.setCortiTenant);
  const tinfoilApiKey = useSettingsStore((s) => s.tinfoilApiKey);
  const setTinfoilApiKey = useSettingsStore((s) => s.setTinfoilApiKey);
  const customTranscriptionApiKey = useSettingsStore((s) => s.customTranscriptionApiKey);
  const setCustomTranscriptionApiKey = useSettingsStore((s) => s.setCustomTranscriptionApiKey);
  const effectiveLocal = mode === "local" ? true : mode === "cloud" ? false : useLocalWhisper;
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  const [parakeetModels, setParakeetModels] = useState<LocalModel[]>([]);
  const [internalLocalProvider, setInternalLocalProvider] = useState(selectedLocalProvider);
  const hasLoadedRef = useRef(false);
  const hasLoadedParakeetRef = useRef(false);
  const [gpuBackend, setGpuBackend] = useState<"cuda" | "vulkan" | null>(null);
  const [gpuDownloaded, setGpuDownloaded] = useState(false);
  const [gpuDownloading, setGpuDownloading] = useState(false);
  const [gpuProgress, setGpuProgress] = useState<DownloadProgress>({
    downloadedBytes: 0,
    totalBytes: 0,
    percentage: 0,
  });
  const [gpuDismissed, setGpuDismissed] = useState(false);
  // The pack fell back to CPU on this machine (persisted by main until retried)
  const [gpuFailed, setGpuFailed] = useState(false);
  // A server reload with the new backend is in flight (Vulkan cold starts are slow)
  const [gpuActivating, setGpuActivating] = useState(false);
  // Live truth from the running server; "active" is never inferred from a download
  const [gpuActive, setGpuActive] = useState(false);

  useEffect(() => {
    if (selectedLocalProvider !== internalLocalProvider) {
      setInternalLocalProvider(selectedLocalProvider);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync prop→state: only re-run when the prop changes
  }, [selectedLocalProvider]);
  const localModelsLoadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const parakeetModelsLoadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const loadLocalModelsRef = useRef<(() => Promise<void>) | null>(null);
  const loadParakeetModelsRef = useRef<(() => Promise<void>) | null>(null);
  const selectedLocalModelRef = useRef(selectedLocalModel);
  const onLocalModelSelectRef = useRef(onLocalModelSelect);

  const { confirmDialog, showConfirmDialog, hideConfirmDialog } = useDialogs();
  const isOnboarding = variant === "onboarding";
  const colorScheme: ColorScheme = variant === "settings" ? "purple" : "blue";
  const styles = useMemo(() => MODEL_PICKER_COLORS[colorScheme], [colorScheme]);
  const availableCloudProviders = useMemo(
    () => (streamingOnly ? getStreamingTranscriptionProviders() : getTranscriptionProviders()),
    [streamingOnly]
  );
  const cloudProviders = availableCloudProviders;
  const cloudProviderTabs = useMemo(() => {
    const availableIds = new Set(availableCloudProviders.map((p) => p.id));
    if (!streamingOnly) availableIds.add("custom");
    return CLOUD_PROVIDER_TABS.filter((provider) => availableIds.has(provider.id)).map(
      (provider) =>
        provider.id === "custom"
          ? { ...provider, name: t("transcription.customProvider") }
          : provider
    );
  }, [availableCloudProviders, streamingOnly, t]);

  useEffect(() => {
    selectedLocalModelRef.current = selectedLocalModel;
  }, [selectedLocalModel]);
  useEffect(() => {
    onLocalModelSelectRef.current = onLocalModelSelect;
  }, [onLocalModelSelect]);

  const validateAndSelectModel = useCallback((loadedModels: LocalModel[]) => {
    const current = selectedLocalModelRef.current;
    if (!current) return;

    const downloaded = loadedModels.filter((m) => m.downloaded);
    const isCurrentDownloaded = loadedModels.find((m) => m.model === current)?.downloaded;

    if (!isCurrentDownloaded && downloaded.length > 0) {
      onLocalModelSelectRef.current(downloaded[0].model);
    } else if (!isCurrentDownloaded && downloaded.length === 0) {
      onLocalModelSelectRef.current("");
    }
  }, []);

  const loadLocalModels = useCallback(() => {
    const load = async () => {
      try {
        const result = await window.electronAPI?.listWhisperModels();
        if (result?.success) {
          setLocalModels(result.models);
          validateAndSelectModel(result.models);
        }
      } catch (error) {
        logger.error("Failed to load models", { error }, "models");
        setLocalModels([]);
      }
    };

    const queuedLoad = localModelsLoadQueueRef.current.then(load);
    localModelsLoadQueueRef.current = queuedLoad;
    return queuedLoad;
  }, [validateAndSelectModel]);

  const loadParakeetModels = useCallback(() => {
    const load = async () => {
      try {
        const result = await window.electronAPI?.listParakeetModels();
        if (result?.success) {
          setParakeetModels(result.models);
        }
      } catch (error) {
        logger.error("Failed to load Parakeet models", { error }, "models");
        setParakeetModels([]);
      }
    };

    const queuedLoad = parakeetModelsLoadQueueRef.current.then(load);
    parakeetModelsLoadQueueRef.current = queuedLoad;
    return queuedLoad;
  }, []);

  const effectiveCloudSelection = useMemo(() => {
    // Keep the stored selection when it exists in this picker's provider set
    // (streaming-only contexts offer fewer providers); otherwise fall back to
    // the first available provider and its default model.
    const customAvailable = !streamingOnly;
    const isKnown =
      cloudProviders.some((provider) => provider.id === selectedCloudProvider) ||
      (customAvailable && selectedCloudProvider === "custom");
    if (isKnown) {
      return { provider: selectedCloudProvider, model: selectedCloudModel };
    }
    const fallback = cloudProviders[0];
    return fallback
      ? { provider: fallback.id, model: fallback.models[0]?.id ?? "" }
      : { provider: selectedCloudProvider, model: selectedCloudModel };
  }, [cloudProviders, selectedCloudProvider, selectedCloudModel, streamingOnly]);
  const displayedCloudProvider = effectiveCloudSelection.provider;
  const displayedCloudModel = effectiveCloudSelection.model;

  useEffect(() => {
    if (
      effectiveLocal ||
      (effectiveCloudSelection.provider === selectedCloudProvider &&
        effectiveCloudSelection.model === selectedCloudModel)
    ) {
      return;
    }
    if (effectiveCloudSelection.provider !== selectedCloudProvider) {
      onCloudProviderSelect(effectiveCloudSelection.provider);
    }
    if (effectiveCloudSelection.model !== selectedCloudModel) {
      onCloudModelSelect(effectiveCloudSelection.model);
    }
  }, [
    effectiveCloudSelection,
    effectiveLocal,
    onCloudModelSelect,
    onCloudProviderSelect,
    selectedCloudModel,
    selectedCloudProvider,
  ]);

  useEffect(() => {
    loadLocalModelsRef.current = loadLocalModels;
  }, [loadLocalModels]);
  useEffect(() => {
    loadParakeetModelsRef.current = loadParakeetModels;
  }, [loadParakeetModels]);
  useEffect(() => {
    if (!effectiveLocal) return;

    if (internalLocalProvider === "whisper" && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadLocalModelsRef.current?.();
    } else if (internalLocalProvider === "nvidia" && !hasLoadedParakeetRef.current) {
      hasLoadedParakeetRef.current = true;
      loadParakeetModelsRef.current?.();
    }
  }, [effectiveLocal, internalLocalProvider]);

  useEffect(() => {
    if (effectiveLocal) return;

    hasLoadedRef.current = false;
    hasLoadedParakeetRef.current = false;
  }, [effectiveLocal]);

  useEffect(() => {
    const handleModelsCleared = () => {
      loadLocalModels();
      loadParakeetModels();
    };
    window.addEventListener("snowy-models-cleared", handleModelsCleared);
    return () => window.removeEventListener("snowy-models-cleared", handleModelsCleared);
  }, [loadLocalModels, loadParakeetModels]);

  useEffect(() => {
    if (!effectiveLocal || internalLocalProvider !== "whisper") return;
    if (getCachedPlatform() === "darwin") return;
    const detect = async () => {
      try {
        const [cuda, vulkan] = await Promise.all([
          window.electronAPI?.getCudaWhisperStatus?.(),
          window.electronAPI?.getVulkanWhisperStatus?.(),
        ]);
        // Cards below the CUDA build's kernel floor (e.g. Maxwell) crash at the
        // first kernel launch, so they get the Vulkan pack like AMD/Intel GPUs.
        const cudaEligible = !!cuda?.gpuInfo.hasNvidiaGpu && !!cuda.gpuInfo.cudaSupported;
        // Prefer the pack that's already installed: a working Vulkan setup must
        // not be re-prompted to download the CUDA pack (matches the resolver,
        // which only prefers CUDA when it is actually downloaded).
        if (cudaEligible && (cuda.downloaded || !vulkan?.downloaded)) {
          setGpuBackend("cuda");
          setGpuDownloaded(cuda.downloaded);
          setGpuFailed(!!cuda.gpuFailed);
        } else if (vulkan?.vulkan.available) {
          setGpuBackend("vulkan");
          setGpuDownloaded(vulkan.downloaded);
          setGpuFailed(!!vulkan.gpuFailed);
        }
      } catch {}
    };
    detect();
  }, [effectiveLocal, internalLocalProvider]);

  useEffect(() => {
    if (!gpuDownloading || !gpuBackend) return;
    const subscribe =
      gpuBackend === "cuda"
        ? window.electronAPI?.onCudaDownloadProgress
        : window.electronAPI?.onVulkanWhisperDownloadProgress;
    return subscribe?.((data) => setGpuProgress(data));
  }, [gpuDownloading, gpuBackend]);

  // Live server state: "GPU acceleration active" reflects what the server is
  // actually running on, not just that a pack is on disk (a crashed GPU server
  // silently falls back to CPU). Faster poll while an activation is in flight.
  useEffect(() => {
    if (!effectiveLocal || internalLocalProvider !== "whisper" || !gpuDownloaded) return;
    const poll = () => {
      window.electronAPI
        ?.whisperServerStatus?.()
        .then((status) => {
          setGpuActive(!!status?.gpuAccelerated);
          if (status?.gpuAccelerated) setGpuActivating(false);
        })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, gpuActivating ? 1000 : 5000);
    return () => clearInterval(id);
  }, [effectiveLocal, internalLocalProvider, gpuDownloaded, gpuActivating]);

  // Safety valve: a Vulkan cold start can take up to ~2 minutes (see #698);
  // past that the live status or a fallback notification settles the state.
  useEffect(() => {
    if (!gpuActivating) return;
    const timeout = setTimeout(() => setGpuActivating(false), 150_000);
    return () => clearTimeout(timeout);
  }, [gpuActivating]);

  // Main falls back to CPU (and remembers it) when a GPU server crashes
  useEffect(() => {
    const onFallback = () => {
      setGpuFailed(true);
      setGpuActivating(false);
      setGpuActive(false);
    };
    const disposeCuda = window.electronAPI?.onCudaFallbackNotification?.(onFallback);
    const disposeVulkan = window.electronAPI?.onGpuFallbackNotification?.(onFallback);
    return () => {
      disposeCuda?.();
      disposeVulkan?.();
    };
  }, []);

  const handleGpuDownload = async () => {
    setGpuDownloading(true);
    try {
      const result =
        gpuBackend === "cuda"
          ? await window.electronAPI?.downloadCudaWhisperBinary?.()
          : await window.electronAPI?.downloadVulkanWhisperBinary?.();
      if (result?.success) {
        setGpuDownloaded(true);
        setGpuFailed(false);
        // Main reloads the server with the new backend only when one is loaded;
        // otherwise the pack simply engages on the next dictation.
        setGpuActivating(!!result.willRestart);
      }
    } finally {
      setGpuDownloading(false);
    }
  };

  const handleGpuRetry = async () => {
    setGpuFailed(false);
    const result = await window.electronAPI?.whisperGpuRetry?.();
    setGpuActivating(!!result?.willRestart);
  };

  const handleGpuDelete = async () => {
    const result =
      gpuBackend === "cuda"
        ? await window.electronAPI?.deleteCudaWhisperBinary?.()
        : await window.electronAPI?.deleteVulkanWhisperBinary?.();
    if (result?.success) {
      setGpuDownloaded(false);
      setGpuFailed(false);
      setGpuActivating(false);
      setGpuActive(false);
    }
  };

  const handleGpuCancel = async () => {
    if (gpuBackend === "cuda") await window.electronAPI?.cancelCudaWhisperDownload?.();
    else await window.electronAPI?.cancelVulkanWhisperDownload?.();
    setGpuDownloading(false);
  };

  const {
    downloadingModel,
    downloadProgress,
    downloadModel,
    deleteModel,
    isDownloadingModel,
    isInstalling,
    cancelDownload,
    isCancelling,
  } = useModelDownload({
    modelType: "whisper",
    onDownloadComplete: loadLocalModels,
  });

  const {
    downloadingModel: downloadingParakeetModel,
    downloadProgress: parakeetDownloadProgress,
    downloadModel: downloadParakeetModel,
    deleteModel: deleteParakeetModel,
    isDownloadingModel: isDownloadingParakeetModel,
    isInstalling: isInstallingParakeet,
    cancelDownload: cancelParakeetDownload,
    isCancelling: isCancellingParakeet,
  } = useModelDownload({
    modelType: "parakeet",
    onDownloadComplete: loadParakeetModels,
  });

  const handleModeChange = useCallback(
    (isLocal: boolean) => {
      onModeChange(isLocal);
    },
    [onModeChange]
  );

  // switchCloudTranscriptionProvider writes both the provider and the model for
  // this scope: it remembers the outgoing provider's model and restores the
  // incoming one. It never touches cloudTranscriptionBaseUrl — that key is the
  // Custom tab's only storage, and writing it here destroyed the URL (#1459).
  const handleCloudProviderChange = useCallback(
    (providerId: string) => {
      switchCloudTranscriptionProvider(transcriptionContext, providerId);
    },
    [switchCloudTranscriptionProvider, transcriptionContext]
  );

  const handleLocalProviderChange = useCallback(
    (providerId: string) => {
      const tab = LOCAL_PROVIDER_TABS.find((t) => t.id === providerId);
      if (tab?.disabled) return;
      setInternalLocalProvider(providerId);
      onLocalProviderSelect?.(providerId);
    },
    [onLocalProviderSelect]
  );

  const handleWhisperModelSelect = useCallback(
    (modelId: string) => {
      onLocalProviderSelect?.("whisper");
      setInternalLocalProvider("whisper");
      onLocalModelSelect(modelId);
    },
    [onLocalModelSelect, onLocalProviderSelect]
  );

  const handleParakeetModelSelect = useCallback(
    (modelId: string) => {
      onLocalProviderSelect?.("nvidia");
      setInternalLocalProvider("nvidia");
      onLocalModelSelect(modelId);
    },
    [onLocalModelSelect, onLocalProviderSelect]
  );

  const handleBaseUrlBlur = useCallback(() => {
    if (!setCloudTranscriptionBaseUrl || selectedCloudProvider !== "custom") return;

    const trimmed = (cloudTranscriptionBaseUrl || "").trim();
    if (!trimmed) return;

    const normalized = normalizeBaseUrl(trimmed);

    if (normalized && normalized !== cloudTranscriptionBaseUrl) {
      setCloudTranscriptionBaseUrl(normalized);
    }
    if (normalized) {
      for (const provider of cloudProviders) {
        const providerNormalized = normalizeBaseUrl(provider.baseUrl);
        if (normalized === providerNormalized) {
          switchCloudTranscriptionProvider(transcriptionContext, provider.id);
          break;
        }
      }
    }
  }, [
    cloudTranscriptionBaseUrl,
    selectedCloudProvider,
    setCloudTranscriptionBaseUrl,
    switchCloudTranscriptionProvider,
    transcriptionContext,
    cloudProviders,
  ]);

  const handleDelete = useCallback(
    (modelId: string) => {
      showConfirmDialog({
        title: t("transcription.deleteModel.title"),
        description: t("transcription.deleteModel.description"),
        onConfirm: async () => {
          await deleteModel(modelId, async () => {
            const result = await window.electronAPI?.listWhisperModels();
            if (result?.success) {
              setLocalModels(result.models);
              validateAndSelectModel(result.models);
            }
          });
        },
        variant: "destructive",
      });
    },
    [showConfirmDialog, deleteModel, validateAndSelectModel, t]
  );

  const currentCloudProvider = useMemo<TranscriptionProviderData | undefined>(
    () => cloudProviders.find((p) => p.id === displayedCloudProvider),
    [cloudProviders, displayedCloudProvider]
  );

  const providerCredentials =
    PROVIDER_CREDENTIALS[displayedCloudProvider] ?? PROVIDER_CREDENTIALS.openai;
  const credentialValues: Record<ProviderCredentialField["key"], string> = {
    openaiApiKey,
    groqApiKey,
    xaiApiKey,
    mistralApiKey,
    cortiClientId,
    cortiClientSecret,
    cortiEnvironment,
    cortiTenant,
    tinfoilApiKey,
  };
  const credentialSetters: Record<ProviderCredentialField["key"], (value: string) => void> = {
    openaiApiKey: setOpenaiApiKey,
    groqApiKey: setGroqApiKey,
    xaiApiKey: setXaiApiKey,
    mistralApiKey: setMistralApiKey,
    cortiClientId: setCortiClientId,
    cortiClientSecret: setCortiClientSecret,
    cortiEnvironment: setCortiEnvironment,
    cortiTenant: setCortiTenant,
    tinfoilApiKey: setTinfoilApiKey,
  };

  // Readiness for the provider grid: every *secret* the provider needs is
  // filled in, not just the first one — Corti takes a client ID and a secret,
  // and one of the two alone gets you nowhere.
  const cloudProviderGridItems = useMemo<ProviderGridItem[]>(
    () =>
      cloudProviderTabs.map((provider) => {
        const fields = PROVIDER_CREDENTIALS[provider.id]?.fields;
        return {
          id: provider.id,
          name: provider.name,
          configured:
            provider.id === "custom"
              ? !!cloudTranscriptionBaseUrl?.trim()
              : !!fields?.every(
                  (field) => field.input !== "secret" || !!credentialValues[field.key]?.trim()
                ),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- credentialValues is rebuilt every render; the credentials themselves are the real inputs
    [
      cloudProviderTabs,
      cloudTranscriptionBaseUrl,
      openaiApiKey,
      groqApiKey,
      xaiApiKey,
      mistralApiKey,
      cortiClientId,
      cortiClientSecret,
      tinfoilApiKey,
    ]
  );

  const cloudModelOptions = useMemo(() => {
    if (!currentCloudProvider) return [];
    const { icon, invertInDark } = getRemoteProviderIcon(displayedCloudProvider);
    return currentCloudProvider.models.map((m) => ({
      value: m.id,
      label: m.name,
      description: m.descriptionKey
        ? t(m.descriptionKey, { defaultValue: m.description })
        : m.description,
      icon,
      invertInDark,
    }));
  }, [currentCloudProvider, displayedCloudProvider, t]);

  const progressDisplay = useMemo(() => {
    // Onboarding shows progress inline in the model row it belongs to.
    if (!effectiveLocal || isOnboarding) return null;

    if (downloadingModel && internalLocalProvider === "whisper") {
      const modelInfo = WHISPER_MODEL_INFO[downloadingModel];
      return (
        <DownloadProgressBar
          modelName={modelInfo?.name || downloadingModel}
          progress={downloadProgress}
          isInstalling={isInstalling}
        />
      );
    }

    if (downloadingParakeetModel && internalLocalProvider === "nvidia") {
      const modelInfo = PARAKEET_MODEL_INFO[downloadingParakeetModel];
      return (
        <DownloadProgressBar
          modelName={modelInfo?.name || downloadingParakeetModel}
          progress={parakeetDownloadProgress}
          isInstalling={isInstallingParakeet}
        />
      );
    }

    return null;
  }, [
    downloadingModel,
    downloadProgress,
    isInstalling,
    downloadingParakeetModel,
    parakeetDownloadProgress,
    isInstallingParakeet,
    effectiveLocal,
    internalLocalProvider,
    isOnboarding,
  ]);

  const renderLocalModels = () => {
    const modelsToRender =
      localModels.length === 0
        ? Object.entries(WHISPER_MODEL_INFO).map(([modelId, info]) => ({
            model: modelId,
            downloaded: false,
            size_mb: info.sizeMb,
          }))
        : localModels;

    return (
      <div className={isOnboarding ? "space-y-2" : "space-y-0.5"}>
        {modelsToRender.map((model) => {
          const modelId = model.model;
          const info = WHISPER_MODEL_INFO[modelId] ?? {
            name: modelId,
            description: t("transcription.fallback.whisperModelDescription"),
            size: t("common.unknown"),
            recommended: false,
          };

          // The registry ships an English fallback next to a translation key.
          const description =
            "descriptionKey" in info && info.descriptionKey
              ? t(info.descriptionKey, { defaultValue: info.description })
              : info.description;

          const cardProps = {
            modelId,
            name: info.name,
            description,
            size: info.size,
            actualSizeMb: model.size_mb,
            isSelected: modelId === selectedLocalModel,
            isDownloaded: model.downloaded ?? false,
            isDownloading: isDownloadingModel(modelId),
            isCancelling,
            isInstalling,
            recommended: info.recommended,
            provider: "whisper",
            onSelect: () => handleWhisperModelSelect(modelId),
            onDelete: () => handleDelete(modelId),
            onDownload: () =>
              downloadModel(modelId, (downloadedId) => {
                setLocalModels((prev) =>
                  prev.map((m) => (m.model === downloadedId ? { ...m, downloaded: true } : m))
                );
                handleWhisperModelSelect(downloadedId);
              }),
            onCancel: cancelDownload,
          };

          return isOnboarding ? (
            <OnboardingModelCard
              key={modelId}
              {...cardProps}
              progress={isDownloadingModel(modelId) ? downloadProgress : undefined}
            />
          ) : (
            <LocalModelCard key={modelId} {...cardProps} styles={styles} />
          );
        })}
      </div>
    );
  };

  const handleParakeetDelete = useCallback(
    (modelId: string) => {
      showConfirmDialog({
        title: t("transcription.deleteModel.title"),
        description: t("transcription.deleteModel.description"),
        onConfirm: async () => {
          await deleteParakeetModel(modelId, async () => {
            const result = await window.electronAPI?.listParakeetModels();
            if (result?.success) {
              setParakeetModels(result.models);
            }
          });
        },
        variant: "destructive",
      });
    },
    [showConfirmDialog, deleteParakeetModel, t]
  );

  const renderParakeetModels = () => {
    const modelsToRender =
      parakeetModels.length === 0
        ? Object.entries(PARAKEET_MODEL_INFO).map(([modelId, info]) => ({
            model: modelId,
            downloaded: false,
            size_mb: info.sizeMb,
          }))
        : parakeetModels;

    return (
      <div className={isOnboarding ? "space-y-2" : "space-y-0.5"}>
        {modelsToRender.map((model) => {
          const modelId = model.model;
          const info = PARAKEET_MODEL_INFO[modelId] ?? {
            name: modelId,
            description: t("transcription.fallback.parakeetModelDescription"),
            size: t("common.unknown"),
            language: "en",
            recommended: false,
          };

          // The registry ships an English fallback next to a translation key.
          const description =
            "descriptionKey" in info && info.descriptionKey
              ? t(info.descriptionKey, { defaultValue: info.description })
              : info.description;

          const cardProps = {
            modelId,
            name: info.name,
            description,
            size: info.size,
            actualSizeMb: model.size_mb,
            isSelected: modelId === selectedLocalModel,
            isDownloaded: model.downloaded ?? false,
            isDownloading: isDownloadingParakeetModel(modelId),
            isCancelling: isCancellingParakeet,
            isInstalling: isInstallingParakeet,
            recommended: info.recommended,
            provider: "nvidia",
            onSelect: () => handleParakeetModelSelect(modelId),
            onDelete: () => handleParakeetDelete(modelId),
            onDownload: () =>
              downloadParakeetModel(modelId, (downloadedId) => {
                setParakeetModels((prev) =>
                  prev.map((m) => (m.model === downloadedId ? { ...m, downloaded: true } : m))
                );
                handleParakeetModelSelect(downloadedId);
              }),
            onCancel: cancelParakeetDownload,
          };

          return isOnboarding ? (
            <OnboardingModelCard
              key={modelId}
              {...cardProps}
              progress={isDownloadingParakeetModel(modelId) ? parakeetDownloadProgress : undefined}
            />
          ) : (
            <LocalModelCard key={modelId} {...cardProps} styles={styles} />
          );
        })}
      </div>
    );
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {!mode && <ModeToggle useLocalWhisper={effectiveLocal} onModeChange={handleModeChange} />}

      {!effectiveLocal ? (
        <>
          {cloudProviderGridItems.length > 0 && (
            <ProviderGrid
              providers={cloudProviderGridItems}
              selectedId={displayedCloudProvider}
              onSelect={handleCloudProviderChange}
            />
          )}

          <div>
            {displayedCloudProvider === "custom" ? (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-foreground">
                    {t("transcription.endpointUrl")}
                  </label>
                  <Input
                    value={cloudTranscriptionBaseUrl}
                    onChange={(e) => setCloudTranscriptionBaseUrl?.(e.target.value)}
                    onBlur={handleBaseUrlBlur}
                    placeholder="https://your-api.example.com/v1"
                    className="h-8 text-sm"
                  />
                </div>

                <ApiKeyInput
                  apiKey={customTranscriptionApiKey}
                  setApiKey={setCustomTranscriptionApiKey}
                  label={t("transcription.apiKeyOptional")}
                  helpText=""
                />

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-foreground">
                    {t("common.model")}
                  </label>
                  <Input
                    value={displayedCloudModel}
                    onChange={(e) => onCloudModelSelect(e.target.value)}
                    placeholder="whisper-1"
                    className="h-8 text-sm"
                  />
                </div>

                {/azure\.com/i.test(cloudTranscriptionBaseUrl || "") && (
                  <p className="text-xs text-muted-foreground">{t("transcription.azureHint")}</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {providerCredentials.fields.map((field, index) => (
                  <div key={field.key} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-foreground">
                        {field.labelKey ? t(field.labelKey) : t("common.apiKey")}
                      </label>
                      {index === 0 && (
                        <GetApiKeyLink
                          url={providerCredentials.consoleUrl}
                          labelKey="transcription.getKey"
                          className="text-xs text-primary/70 hover:text-primary transition-colors cursor-pointer"
                        />
                      )}
                    </div>
                    {field.input === "secret" ? (
                      <ApiKeyInput
                        apiKey={credentialValues[field.key]}
                        setApiKey={credentialSetters[field.key]}
                        label=""
                        helpText=""
                      />
                    ) : field.input === "select" ? (
                      <Select
                        value={credentialValues[field.key]}
                        onValueChange={credentialSetters[field.key]}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options?.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={credentialValues[field.key]}
                        onChange={(e) => credentialSetters[field.key](e.target.value)}
                        placeholder={field.placeholder}
                        className="h-8 text-sm"
                      />
                    )}
                  </div>
                ))}

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">{t("common.model")}</label>
                  <ModelCardList
                    models={cloudModelOptions}
                    selectedModel={displayedCloudModel}
                    onModelSelect={onCloudModelSelect}
                    colorScheme="purple"
                  />
                  {displayedCloudProvider === "tinfoil" && (
                    <p className="text-xs text-muted-foreground/70">
                      {t("transcription.tinfoil.transportNote")}{" "}
                      <a
                        href={TINFOIL_AUDIO_DOCS_URL}
                        onClick={createExternalLinkHandler(TINFOIL_AUDIO_DOCS_URL)}
                        className="text-primary/70 hover:text-primary transition-colors"
                      >
                        {t("transcription.tinfoil.docsLink")}
                      </a>
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <ProviderTabs
            providers={LOCAL_PROVIDER_TABS}
            selectedId={internalLocalProvider}
            onSelect={handleLocalProviderChange}
            colorScheme="purple"
          />

          {progressDisplay}

          {gpuDownloading && internalLocalProvider === "whisper" && (
            <div>
              <DownloadProgressBar modelName="GPU acceleration" progress={gpuProgress} />
              <div className="px-2.5 pb-1 flex justify-end">
                <button
                  onClick={handleGpuCancel}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("gpu.cancel")}
                </button>
              </div>
            </div>
          )}

          {internalLocalProvider === "whisper" &&
            !gpuDismissed &&
            !gpuDownloading &&
            gpuBackend && (
              <div className="rounded-md border border-border bg-surface-1 p-2.5">
                {gpuDownloaded ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {gpuFailed ? (
                        <>
                          <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0 bg-warning" />
                          <span className="text-xs font-medium text-foreground">
                            {t("gpu.activationFailed")}
                          </span>
                          <button
                            onClick={handleGpuRetry}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
                          >
                            {t("gpu.retry")}
                          </button>
                        </>
                      ) : gpuActivating ? (
                        <>
                          <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0 bg-primary animate-pulse" />
                          <span className="text-xs font-medium text-foreground">
                            {t("gpu.activating")}
                          </span>
                        </>
                      ) : gpuActive ? (
                        <>
                          <Check size={13} className="text-success" />
                          <span className="text-xs font-medium text-foreground">
                            {t("gpu.active")}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0 bg-primary" />
                          <span className="text-xs font-medium text-foreground">
                            {t("gpu.ready")}
                          </span>
                        </>
                      )}
                    </div>
                    <Button
                      onClick={handleGpuDelete}
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                    >
                      {t("gpu.remove")}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5">
                    <Zap size={13} className="text-primary shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground">
                        {t("gpu.transcriptionBanner")}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Button
                          onClick={handleGpuDownload}
                          size="sm"
                          variant="default"
                          className="h-6 px-2.5 text-xs"
                        >
                          {t("gpu.enableButton")}
                        </Button>
                        <button
                          onClick={() => setGpuDismissed(true)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {t("gpu.dismiss")}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

          <div>
            {internalLocalProvider === "whisper" && renderLocalModels()}
            {internalLocalProvider === "nvidia" && renderParakeetModels()}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => !open && hideConfirmDialog()}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        onConfirm={confirmDialog.onConfirm}
        variant={confirmDialog.variant}
      />
    </div>
  );
}
