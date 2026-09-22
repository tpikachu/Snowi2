import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ProviderTabs } from "./ui/ProviderTabs";
import { DownloadProgressBar } from "./ui/DownloadProgressBar";
import { ConfirmDialog } from "./ui/dialog";
import ModelCardList, { type ModelCardOption } from "./ui/ModelCardList";
import { useDialogs } from "../hooks/useDialogs";
import { useModelDownload, type ModelType } from "../hooks/useModelDownload";
import { MODEL_PICKER_COLORS, type ColorScheme } from "../utils/modelPickerStyles";
import { getProviderIcon, isMonochromeProvider } from "../utils/providerIcons";
import {
  describeLocalModel,
  splitFeaturedModels,
  type LocalModelTier,
  type MachineMemory,
} from "../utils/localModelLabels";

export interface LocalModel {
  id: string;
  name: string;
  size: string;
  sizeBytes?: number;
  description: string;
  descriptionKey?: string;
  specUrl?: string;
  isDownloaded?: boolean;
  downloaded?: boolean;
  recommended?: boolean;
  /** Language models only (localModelLabels.ts): the row's use-case tier … */
  tier?: LocalModelTier;
  /** … and whether it is listed by default or under "more models". */
  featured?: boolean;
}

export interface LocalProvider {
  id: string;
  name: string;
  models: LocalModel[];
}

interface LocalModelPickerProps {
  providers: LocalProvider[];
  selectedModel: string;
  selectedProvider: string;
  onModelSelect: (modelId: string) => void;
  onProviderSelect: (providerId: string) => void;
  modelType: ModelType;
  colorScheme?: Exclude<ColorScheme, "blue">;
  className?: string;
  onDownloadComplete?: () => void;
}

export default function LocalModelPicker({
  providers,
  selectedModel,
  selectedProvider,
  onModelSelect,
  onProviderSelect,
  modelType,
  colorScheme = "purple",
  className = "",
  onDownloadComplete,
}: LocalModelPickerProps) {
  const { t } = useTranslation();
  const [downloadedModels, setDownloadedModels] = useState<Set<string>>(new Set());
  const loadDownloadedModelsRequestRef = useRef(0);
  // Language models carry labels a speech model does not: a use-case tier,
  // the memory they need against this machine, what they give up. The
  // machine comes from the cached hardware probe; without it the rows still
  // say how much memory, just not whether it fits.
  const isLanguageModel = modelType === "llm";
  const [machine, setMachine] = useState<MachineMemory | null>(null);
  const [showMore, setShowMore] = useState(false);
  useEffect(() => {
    if (!isLanguageModel) return;
    let cancelled = false;
    window.electronAPI
      ?.getCapabilitySnapshot?.()
      .then((capability) => {
        if (cancelled || !capability) return;
        setMachine({ totalMemGb: capability.totalMemGb, vramGb: capability.gpu?.vramGb ?? null });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isLanguageModel]);

  const { confirmDialog, showConfirmDialog, hideConfirmDialog } = useDialogs();
  const styles = useMemo(() => MODEL_PICKER_COLORS[colorScheme], [colorScheme]);

  const loadDownloadedModels = useCallback(async () => {
    const requestId = ++loadDownloadedModelsRequestRef.current;

    try {
      let downloaded = new Set<string>();
      if (modelType === "whisper") {
        const result = await window.electronAPI?.listWhisperModels();
        if (result?.success) {
          downloaded = new Set(
            result.models
              .filter((m: { downloaded?: boolean }) => m.downloaded)
              .map((m: { model: string }) => m.model)
          );
        }
      } else if (modelType === "parakeet") {
        const result = await window.electronAPI?.listParakeetModels();
        if (result?.success) {
          downloaded = new Set(
            result.models
              .filter((m: { downloaded?: boolean }) => m.downloaded)
              .map((m: { model: string }) => m.model)
          );
        }
      } else {
        const result = await window.electronAPI?.modelGetAll?.();
        if (result && Array.isArray(result)) {
          downloaded = new Set(
            result
              .filter((m: { isDownloaded?: boolean }) => m.isDownloaded)
              .map((m: { id: string }) => m.id)
          );
        }
      }
      if (requestId === loadDownloadedModelsRequestRef.current) {
        setDownloadedModels(downloaded);
        return downloaded;
      }
      return null;
    } catch (error) {
      console.error("Failed to load downloaded models:", error);
      return null;
    }
  }, [modelType]);

  useEffect(() => {
    const initAndValidate = async () => {
      const downloaded = await loadDownloadedModels();
      if (downloaded && selectedModel && !downloaded.has(selectedModel)) {
        onModelSelect("");
      }
    };
    initAndValidate();
  }, [loadDownloadedModels, selectedModel, onModelSelect]);

  const handleDownloadComplete = useCallback(async () => {
    await loadDownloadedModels();
    await onDownloadComplete?.();
  }, [loadDownloadedModels, onDownloadComplete]);

  const {
    downloadingModel,
    downloadProgress,
    downloadModel,
    deleteModel,
    isDownloadingModel,
    cancelDownload,
    isCancelling,
    isInstalling,
  } = useModelDownload({
    modelType,
    onDownloadComplete: handleDownloadComplete,
    onModelsCleared: loadDownloadedModels,
  });

  const handleDownload = useCallback(
    (modelId: string) => {
      downloadModel(modelId, onModelSelect);
    },
    [downloadModel, onModelSelect]
  );

  const handleDelete = useCallback(
    (modelId: string) => {
      showConfirmDialog({
        title: t("transcription.deleteModel.title"),
        description: t("transcription.deleteModel.description"),
        onConfirm: () => deleteModel(modelId, loadDownloadedModels),
        variant: "destructive",
      });
    },
    [showConfirmDialog, deleteModel, loadDownloadedModels, t]
  );

  const currentProvider = providers.find((p) => p.id === selectedProvider);
  const models = useMemo(() => currentProvider?.models || [], [currentProvider?.models]);

  // The current generation leads; older generations and alternate builds sit
  // under one "more" row — twelve Qwen variants in a column read as noise,
  // not choice. A model on disk or in use is always listed.
  const split = useMemo(() => {
    if (!isLanguageModel || !models.some((m) => m.featured)) return null;
    const keep = new Set<string>(downloadedModels);
    if (selectedModel) keep.add(selectedModel);
    return splitFeaturedModels(models, keep);
  }, [isLanguageModel, models, downloadedModels, selectedModel]);
  const listedModels = split
    ? showMore
      ? [...split.featured, ...split.more]
      : split.featured
    : models;

  const labelsFor = (model: LocalModel) => {
    if (!isLanguageModel || model.sizeBytes === undefined) return {};
    const labels = describeLocalModel(
      { id: model.id, sizeBytes: model.sizeBytes, tier: model.tier },
      machine
    );
    const gb = labels.memoryGb;
    const memory =
      labels.fit === "poor"
        ? t("models.local.memoryTooMuch", { gb })
        : labels.fit === "tight"
          ? t("models.local.memoryTight", { gb })
          : t("models.local.memory", { gb });
    return {
      badge: t(`models.local.tier.${labels.tier}`),
      caveat: { toolsOff: labels.toolsOff },
      note: memory,
      noteTone: labels.fit === "poor" ? ("warn" as const) : ("muted" as const),
    };
  };

  const progressDisplay = useMemo(() => {
    if (!downloadingModel) return null;

    const modelName = models.find((m) => m.id === downloadingModel)?.name || downloadingModel;

    return (
      <DownloadProgressBar
        modelName={modelName}
        progress={downloadProgress}
        isInstalling={isInstalling}
      />
    );
  }, [downloadingModel, downloadProgress, isInstalling, models]);

  return (
    <div className={className}>
      <ProviderTabs
        providers={providers}
        selectedId={selectedProvider}
        onSelect={onProviderSelect}
        colorScheme={colorScheme}
        wrap
      />

      {progressDisplay}

      <div className="mt-2">
        <h5 className={`${styles.header} mb-2`}>{t("common.availableModels")}</h5>

        <ModelCardList
          models={listedModels.map((model): ModelCardOption => ({
            value: model.id,
            label: model.name,
            description: model.size,
            specUrl: model.specUrl,
            icon: getProviderIcon(selectedProvider),
            invertInDark: isMonochromeProvider(selectedProvider),
            recommended: model.recommended,
            isDownloaded: downloadedModels.has(model.id) || model.isDownloaded || model.downloaded,
            isDownloading: isDownloadingModel(model.id),
            ...labelsFor(model),
          }))}
          selectedModel={selectedModel}
          onModelSelect={onModelSelect}
          onDownload={handleDownload}
          onDelete={handleDelete}
          onCancelDownload={cancelDownload}
          isCancelling={isCancelling}
          isInstalling={isInstalling}
          colorScheme={colorScheme}
        />
        {split && split.more.length > 0 && (
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="mt-1.5 text-[12px] text-primary transition-colors hover:text-primary-hover"
          >
            {showMore
              ? t("models.local.showLess")
              : t("models.local.showMore", { count: split.more.length })}
          </button>
        )}
      </div>

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
