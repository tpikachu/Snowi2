import { useCallback, useEffect, useMemo, useState } from "react";
import modelRegistryData from "../models/modelRegistryData.json";
import { useTranscriptionRecommendation } from "./useTranscriptionRecommendation";
import { useModelDownload, type DownloadProgress } from "./useModelDownload";
import type { RecommendedModel } from "../types/electron";

interface RegistryEntry {
  name?: string;
  size?: string;
  sizeMb?: number;
}

const registry = modelRegistryData as unknown as {
  parakeetModels: Record<string, RegistryEntry>;
  whisperModels: Record<string, RegistryEntry>;
};

const entryFor = (model: RecommendedModel): RegistryEntry | undefined =>
  model.runtime === "whisper"
    ? registry.whisperModels[model.name]
    : registry.parakeetModels[model.name];

/**
 * The registry's own size string is preferred over the tier's rounded GB: it is
 * the number the download will actually report, and a "0.63 GB" that turns into
 * "632MB" mid-download reads as a bug.
 */
export const sizeOfRecommended = (model: RecommendedModel): string =>
  entryFor(model)?.size ?? `${Math.round(model.diskGb * 1000)}MB`;

export const displayNameOfRecommended = (model: RecommendedModel): string =>
  entryFor(model)?.name ?? model.name;

/** The tiering's runtimes collapse to the two engines the app can download for. */
export const providerOfRecommended = (model: RecommendedModel): "whisper" | "nvidia" =>
  model.runtime === "whisper" ? "whisper" : "nvidia";

/** Human name for a raw downloadable model id, whichever engine it belongs to. */
export const displayNameForModelId = (modelId: string): string =>
  registry.whisperModels[modelId]?.name ?? registry.parakeetModels[modelId]?.name ?? modelId;

export interface RecommendedModelRow {
  model: RecommendedModel;
  role: "live" | "archive";
}

export interface OnboardingTranscriptionSetup {
  recommendation: ReturnType<typeof useTranscriptionRecommendation>["recommendation"];
  capability: ReturnType<typeof useTranscriptionRecommendation>["capability"];
  probeFailed: boolean;
  probing: boolean;
  checking: boolean;
  refresh: () => void;
  /** live + optional archive model, in download order. */
  models: RecommendedModelRow[];
  /** Model names (both engines) currently on disk. */
  installed: Set<string>;
  missing: RecommendedModelRow[];
  liveReady: boolean;
  isDownloading: boolean;
  activeDownload: {
    model: string | null;
    progress: DownloadProgress;
    isInstalling: boolean;
    cancel: () => void;
  };
  startDownloads: () => Promise<void>;
  refreshInstalled: () => Promise<void>;
}

/**
 * The flow-level owner of transcription auto-setup during onboarding.
 *
 * This lives in OnboardingFlow rather than inside the setup step because the
 * step unmounts the moment the user clicks Next, and the download deliberately
 * keeps running: the sequential live-then-archive loop, the on-complete disk
 * re-check that unblocks the Next button, and the progress the finish step
 * shows all need an owner that survives navigation. The step and the finish
 * screen are both just views over this.
 */
export function useOnboardingTranscriptionSetup(
  language: "en" | "multilingual"
): OnboardingTranscriptionSetup {
  const { recommendation, capability, probeFailed, loading, refresh } =
    useTranscriptionRecommendation(language);

  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(true);

  const refreshInstalled = useCallback(async () => {
    setChecking(true);
    try {
      const [parakeet, whisper] = await Promise.all([
        window.electronAPI?.listParakeetModels?.(),
        window.electronAPI?.listWhisperModels?.(),
      ]);
      const present = new Set<string>();
      for (const list of [parakeet?.models, whisper?.models]) {
        for (const entry of list ?? []) {
          if (entry?.downloaded && entry.model) present.add(entry.model);
        }
      }
      setInstalled(present);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refreshInstalled();
  }, [refreshInstalled]);

  // Two download hooks rather than one parameterised by the recommendation:
  // a GPU or Apple tier pairs a Parakeet live model with a Whisper archive
  // model, so both engines can be needed in the same run.
  const parakeetDownload = useModelDownload({
    modelType: "parakeet",
    onDownloadComplete: refreshInstalled,
  });
  const whisperDownload = useModelDownload({
    modelType: "whisper",
    onDownloadComplete: refreshInstalled,
  });

  const active = parakeetDownload.isDownloading ? parakeetDownload : whisperDownload;
  const isDownloading = parakeetDownload.isDownloading || whisperDownload.isDownloading;

  const models = useMemo<RecommendedModelRow[]>(() => {
    if (!recommendation) return [];
    const list: RecommendedModelRow[] = [{ model: recommendation.live, role: "live" }];
    if (recommendation.archive) list.push({ model: recommendation.archive, role: "archive" });
    return list;
  }, [recommendation]);

  const missing = useMemo(
    () => models.filter(({ model }) => !installed.has(model.name)),
    [models, installed]
  );
  const liveReady = recommendation ? installed.has(recommendation.live.name) : false;

  const startDownloads = useCallback(async () => {
    for (const { model } of missing) {
      const hook = model.runtime === "whisper" ? whisperDownload : parakeetDownload;
      await hook.downloadModel(model.name);
    }
  }, [missing, parakeetDownload, whisperDownload]);

  return {
    recommendation,
    capability,
    probeFailed,
    probing: loading,
    checking,
    refresh,
    models,
    installed,
    missing,
    liveReady,
    isDownloading,
    activeDownload: {
      model: active.downloadingModel,
      progress: active.downloadProgress,
      isInstalling: active.isInstalling,
      cancel: active.cancelDownload,
    },
    startDownloads,
    refreshInstalled,
  };
}
