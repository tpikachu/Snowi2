import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import type { ActiveSpeechModelDownload } from "../../hooks/useSpeechModelDownloadStatus";

/**
 * The strip under the window header while a speech model downloads.
 *
 * Onboarding lets the user into the app before the recommended model has
 * finished downloading; without this the download would be invisible and a
 * disabled Start button would be unexplained. One slim row: what is
 * downloading, what that means for them, how far along it is — with the
 * progress drawn as a hairline along the strip's bottom edge.
 */
export default function ModelDownloadStrip({
  download,
  blocksMeetingStart,
}: {
  download: ActiveSpeechModelDownload;
  blocksMeetingStart: boolean;
}) {
  const { t } = useTranslation();
  const percent = Math.min(100, Math.max(0, Math.round(download.percentage)));

  return (
    <div
      role="status"
      className="relative shrink-0 overflow-hidden border-b border-border-subtle bg-surface-1 duration-300 animate-in fade-in-0 slide-in-from-top-2"
    >
      <div className="flex h-9 items-center gap-2.5 px-4">
        <Loader2 size={13} className="shrink-0 animate-spin text-primary" aria-hidden="true" />
        <span className="min-w-0 shrink-0 truncate text-xs font-medium text-foreground">
          {t(
            download.isInstalling
              ? "shell.modelDownload.installing"
              : "shell.modelDownload.downloading",
            { model: download.displayName }
          )}
        </span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {t(
            blocksMeetingStart ? "shell.modelDownload.hint" : "shell.modelDownload.backgroundHint"
          )}
        </span>
        <span className="flex-1" />
        <span data-numeric className="shrink-0 text-xs font-medium text-muted-foreground">
          {percent}%
        </span>
      </div>
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-0 h-0.5 rounded-r-full bg-primary transition-[width] duration-300 ease-out"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
