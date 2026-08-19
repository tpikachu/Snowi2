import { Loader2 } from "lucide-react";
import { formatETA, type DownloadProgress } from "../../hooks/useModelDownload";

interface DownloadProgressBarProps {
  modelName: string;
  progress: DownloadProgress;
  isInstalling?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)}KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`;
  return `${(bytes / 1_000_000_000).toFixed(2)}GB`;
}

/**
 * A read-out, matching `progress.tsx`: recessed graticule track, square fill,
 * no glow. The percentage is a micro-caps tabular figure in its own machined
 * cell so the row does not reflow as the digits change from 9% to 100%.
 *
 * The old version drew itself in raw `white/5` and `white/3` washes and hung a
 * teal bloom off the fill. Both are gone — every colour here is a token, and
 * elevation comes from the well, not from light leaking out of the bar.
 */
export function DownloadProgressBar({
  modelName,
  progress,
  isInstalling,
}: DownloadProgressBarProps) {
  const { percentage, downloadedBytes, totalBytes, speed, eta } = progress;
  const pct = Math.round(percentage);
  const speedText = speed ? `${speed.toFixed(1)} MB/s` : "";
  const etaText = eta ? formatETA(eta) : "";
  const indeterminate = !isInstalling && totalBytes === 0 && downloadedBytes > 0;

  return (
    <div className="border-b border-border-subtle px-2.5 py-2">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-6 min-w-9 shrink-0 items-center justify-center rounded-control border border-border-subtle bg-surface-2 px-1 shadow-(--shadow-control)">
          {isInstalling ? (
            <Loader2 className="size-3 animate-spin text-primary" strokeWidth={1.75} />
          ) : (
            <span className="micro-caps text-primary">{indeterminate ? "···" : `${pct}%`}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">
            {isInstalling ? `Installing ${modelName}` : `Downloading ${modelName}`}
          </p>
          {!isInstalling && (indeterminate || speedText || etaText) && (
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
              {indeterminate && <span>{formatBytes(downloadedBytes)}</span>}
              {speedText && <span>{speedText}</span>}
              {etaText && (
                <>
                  <span aria-hidden="true" className="text-border-hover">
                    ·
                  </span>
                  <span>{etaText}</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="gauge-track h-1 w-full overflow-hidden rounded-control bg-surface-3 shadow-(--shadow-well)">
        {indeterminate ? (
          <div className="h-full w-1/3 bg-primary animate-[indeterminate_1.5s_ease-in-out_infinite]" />
        ) : (
          <div
            className={`h-full bg-primary ${isInstalling ? "animate-pulse" : ""}`}
            style={{
              width: `${isInstalling ? 100 : Math.min(percentage, 100)}%`,
              transition: "width 300ms var(--ease-snap)",
            }}
          />
        )}
      </div>
    </div>
  );
}
