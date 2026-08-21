import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Cpu,
  Download,
  HardDriveDownload,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import modelRegistryData from "../models/modelRegistryData.json";
import { useTranscriptionRecommendation } from "../hooks/useTranscriptionRecommendation";
import { useModelDownload } from "../hooks/useModelDownload";
import { DownloadProgressBar } from "./ui/DownloadProgressBar";
import { Button } from "./ui/button";
import { cn } from "./lib/utils";
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
const sizeOf = (model: RecommendedModel): string =>
  entryFor(model)?.size ?? `${Math.round(model.diskGb * 1000)}MB`;

const displayNameOf = (model: RecommendedModel): string => entryFor(model)?.name ?? model.name;

/** The tiering's runtimes collapse to the two engines the app can download for. */
const providerOf = (model: RecommendedModel): "whisper" | "nvidia" =>
  model.runtime === "whisper" ? "whisper" : "nvidia";

interface TranscriptionAutoSetupProps {
  language?: "en" | "multilingual";
  /** Called once the live model is on disk, to persist the selection. */
  onApply: (selection: { provider: "whisper" | "nvidia"; modelId: string }) => void;
}

/**
 * What a "speech model" is and why it has to be fetched, for someone who has
 * never heard the phrase.
 *
 * Worth the space: this is the first screen that asks for hundreds of megabytes
 * and it arrives before the app has done anything useful. Unexplained, a
 * download that size reads as bloat. Explained, it is the reason the product
 * can promise that meetings never leave the machine — which is the thing people
 * are actually here for.
 */
function WhyDownload({ t }: { t: (key: string) => string }) {
  const points = [
    { icon: ShieldCheck, key: "onDevice" },
    { icon: HardDriveDownload, key: "oneTime" },
    { icon: WifiOff, key: "offline" },
  ];

  return (
    <div className="rounded-control border border-border-subtle bg-surface-2 px-3 py-3">
      <p className="text-xs leading-relaxed text-foreground">
        {t("transcriptionSetup.explainer.lead")}
      </p>
      <ul className="mt-2.5 space-y-1.5">
        {points.map(({ icon: Icon, key }) => (
          <li
            key={key}
            className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground"
          >
            <Icon className="mt-px size-3 shrink-0 text-primary" strokeWidth={1.75} />
            <span>{t(`transcriptionSetup.explainer.${key}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Basic transcription setup: measure the machine, name what it will run, and
 * fetch it. No model list, because the whole point is that choosing between
 * four 630 MB ASR models is not a decision a new user can make — the numbers
 * that decide it (RTF, resident memory, AVX2) are ones we measured and they
 * cannot.
 *
 * The download is one deliberate click rather than automatic on mount. The
 * selection is what we promised to make for them; spending most of a gigabyte
 * of someone's connection is still theirs to start, and there is no reliable
 * way to detect a metered link from Electron.
 */
export default function TranscriptionAutoSetup({
  language = "en",
  onApply,
}: TranscriptionAutoSetupProps) {
  const { t } = useTranslation();
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

  const models = useMemo(() => {
    if (!recommendation) return [] as Array<{ model: RecommendedModel; role: "live" | "archive" }>;
    const list: Array<{ model: RecommendedModel; role: "live" | "archive" }> = [
      { model: recommendation.live, role: "live" },
    ];
    if (recommendation.archive) list.push({ model: recommendation.archive, role: "archive" });
    return list;
  }, [recommendation]);

  const missing = models.filter(({ model }) => !installed.has(model.name));
  const liveReady = recommendation ? installed.has(recommendation.live.name) : false;

  // Persist as soon as the live model is on disk, including when it was already
  // there from a previous run — otherwise a returning user sees "Ready" while
  // the app still points at whatever it was using before.
  useEffect(() => {
    if (!recommendation || !liveReady) return;
    onApply({
      provider: providerOf(recommendation.live),
      modelId: recommendation.live.name,
    });
    // onApply is a parent callback that is not guaranteed to be stable, and
    // re-running this on its identity would re-persist on every parent render.
  }, [recommendation, liveReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const startDownloads = useCallback(async () => {
    for (const { model } of missing) {
      const hook = model.runtime === "whisper" ? whisperDownload : parakeetDownload;
      await hook.downloadModel(model.name);
    }
  }, [missing, parakeetDownload, whisperDownload]);

  // The explainer renders immediately rather than behind the probe's spinner:
  // it is the answer to "why is this asking me to download something", and
  // that question arrives before the probe finishes.
  if (loading || checking) {
    return (
      <div className="space-y-3">
        <WhyDownload t={t} />
        <div className="flex items-center gap-2 rounded-control border border-border-subtle bg-surface-2 px-3 py-4 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" strokeWidth={1.75} />
          {t("transcriptionSetup.probing")}
        </div>
      </div>
    );
  }

  if (!recommendation) {
    return (
      <div className="space-y-3">
        <WhyDownload t={t} />
        <div className="flex items-start gap-2 rounded-control border border-border-subtle bg-surface-2 px-3 py-3 text-xs text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" strokeWidth={1.75} />
          <span>{t("transcriptionSetup.unavailable")}</span>
        </div>
      </div>
    );
  }

  const totalSize = missing.map(({ model }) => sizeOf(model)).join(" + ");

  return (
    <div className="space-y-3">
      <WhyDownload t={t} />

      <div className="overflow-hidden rounded-control border border-border-subtle bg-surface-2">
        {models.map(({ model, role }) => {
          const ready = installed.has(model.name);
          return (
            <div
              key={`${role}-${model.name}`}
              className="flex items-center gap-2.5 border-b border-border-subtle px-2.5 py-2 last:border-b-0"
            >
              <div
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-control border border-border-subtle shadow-(--shadow-control)",
                  ready ? "bg-primary-subtle text-primary" : "bg-surface-3 text-muted-foreground"
                )}
              >
                {ready ? (
                  <Check className="size-3" strokeWidth={2} />
                ) : (
                  <Cpu className="size-3" strokeWidth={1.75} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">
                  {displayNameOf(model)}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {role === "live"
                    ? recommendation.streaming
                      ? t("transcriptionSetup.roles.live")
                      : t("transcriptionSetup.roles.buffered")
                    : t("transcriptionSetup.roles.archive")}
                </p>
              </div>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {ready ? t("transcriptionSetup.ready") : sizeOf(model)}
              </span>
            </div>
          );
        })}

        {isDownloading && active.downloadingModel && (
          <DownloadProgressBar
            modelName={active.downloadingModel}
            progress={active.downloadProgress}
            isInstalling={active.isInstalling}
          />
        )}
      </div>

      {/* The measurement behind the choice, stated plainly. A recommendation
          nobody can inspect is indistinguishable from a guess. */}
      <p className="px-0.5 text-[11px] leading-relaxed text-muted-foreground">
        {probeFailed || !capability
          ? t("transcriptionSetup.whyUnmeasured")
          : t("transcriptionSetup.why", {
              memory: Math.round(capability.totalMemGb),
              cores: capability.physicalCores ?? capability.logicalCores,
            })}
      </p>

      {recommendation.warnings.map((warning) => (
        <p
          key={warning}
          className="flex items-start gap-1.5 px-0.5 text-[11px] leading-relaxed text-warning"
        >
          <TriangleAlert className="mt-0.5 size-3 shrink-0" strokeWidth={1.75} />
          {t(`transcriptionSetup.warnings.${warning}`, {
            defaultValue: t("transcriptionSetup.warnings.generic"),
          })}
        </p>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        {missing.length > 0 && (
          <Button size="sm" onClick={startDownloads} disabled={isDownloading}>
            {isDownloading ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={1.75} />
            ) : (
              <Download className="size-3.5" strokeWidth={1.75} />
            )}
            {t("transcriptionSetup.download", { size: totalSize })}
          </Button>
        )}
        {isDownloading && (
          <Button variant="outline" size="sm" onClick={active.cancelDownload}>
            {t("transcriptionSetup.cancel")}
          </Button>
        )}
        {!isDownloading && (
          <Button variant="ghost" size="sm" onClick={refresh}>
            <RefreshCw className="size-3.5" strokeWidth={1.75} />
            {t("transcriptionSetup.recheck")}
          </Button>
        )}
      </div>
    </div>
  );
}
