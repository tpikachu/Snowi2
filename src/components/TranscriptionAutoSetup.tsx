import { useEffect, useRef } from "react";
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
import {
  displayNameOfRecommended,
  sizeOfRecommended,
  type OnboardingTranscriptionSetup,
} from "../hooks/useOnboardingTranscriptionSetup";
import { DownloadProgressBar } from "./ui/DownloadProgressBar";
import { Button } from "./ui/button";
import { cn } from "./lib/utils";

interface TranscriptionAutoSetupProps {
  /** Flow-owned recommendation + download state (see useOnboardingTranscriptionSetup). */
  setup: OnboardingTranscriptionSetup;
  /**
   * Start the download as soon as the recommendation is known. Passed by the
   * "Set it up for me" path, where choosing that card *was* the consent to
   * spend the bandwidth — the size stays visible and Cancel stays one click
   * away. A cancelled download is never restarted automatically.
   */
  autoStart?: boolean;
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
 * This is a view: the recommendation and the downloads are owned by
 * OnboardingFlow (useOnboardingTranscriptionSetup), so leaving the step does
 * not orphan a running download or the re-check that unblocks Next.
 */
export default function TranscriptionAutoSetup({
  setup,
  autoStart = false,
}: TranscriptionAutoSetupProps) {
  const { t } = useTranslation();
  const {
    recommendation,
    capability,
    probeFailed,
    probing,
    checking,
    refresh,
    models,
    installed,
    missing,
    isDownloading,
    activeDownload,
    startDownloads,
  } = setup;

  // One shot per mount: choosing the auto card again after a cancel re-arms
  // it, but progress events must never resurrect a download the user stopped.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStartedRef.current) return;
    if (probing || checking || !recommendation) return;
    autoStartedRef.current = true;
    if (missing.length === 0 || isDownloading) return;
    void startDownloads();
  }, [autoStart, probing, checking, recommendation, missing, isDownloading, startDownloads]);

  // The explainer renders immediately rather than behind the probe's spinner:
  // it is the answer to "why is this asking me to download something", and
  // that question arrives before the probe finishes.
  if (probing || checking) {
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

  const totalSize = missing.map(({ model }) => sizeOfRecommended(model)).join(" + ");

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
                  {displayNameOfRecommended(model)}
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
                {ready ? t("transcriptionSetup.ready") : sizeOfRecommended(model)}
              </span>
            </div>
          );
        })}

        {isDownloading && activeDownload.model && (
          <DownloadProgressBar
            modelName={activeDownload.model}
            progress={activeDownload.progress}
            isInstalling={activeDownload.isInstalling}
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
        {missing.length > 0 && !isDownloading && (
          <Button size="sm" onClick={() => void startDownloads()}>
            <Download className="size-3.5" strokeWidth={1.75} />
            {t("transcriptionSetup.download", { size: totalSize })}
          </Button>
        )}
        {isDownloading && (
          <Button variant="outline" size="sm" onClick={activeDownload.cancel}>
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
