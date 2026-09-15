import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Loader2, RefreshCw, X } from "lucide-react";
import { useUpdater } from "../hooks/useUpdater";
import {
  UPDATE_BANNER_SNOOZE_KEY,
  parseUpdateBannerSnooze,
  shouldShowUpdateBanner,
  snoozeUpdateBanner,
  type UpdateBannerSnooze,
} from "../utils/updateBanner";
import { cn } from "./lib/utils";

/**
 * The persistent "a new version is out" strip under the control panel's
 * header (client direction, 2026-09-15: "once an update is detected there
 * should be a banner"). Everything else that announced an update was
 * fleeting or hidden — a corner card that closes itself, a rail icon that
 * goes away during meetings, toasts — so this one stays until acted on:
 * Download runs here with its progress, then the strip offers the restart.
 * "Later" (or the X) snoozes that version for a day (updateBanner.ts);
 * a newer release shows again on its own.
 */
function readSnooze(): UpdateBannerSnooze | null {
  try {
    return parseUpdateBannerSnooze(localStorage.getItem(UPDATE_BANNER_SNOOZE_KEY));
  } catch {
    return null;
  }
}

const actionClass =
  "flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function UpdateBanner({ hidden = false }: { hidden?: boolean }) {
  const { t } = useTranslation();
  const {
    status,
    info,
    isDownloading,
    isInstalling,
    downloadProgress,
    downloadUpdate,
    installUpdate,
  } = useUpdater();
  const [snooze, setSnooze] = useState<UpdateBannerSnooze | null>(readSnooze);
  const [failed, setFailed] = useState<"download" | "install" | null>(null);
  const version = info?.version ?? "";

  // The version arrives a beat after the status on a fresh mount; without it
  // a snoozed banner would flash before the snooze could match.
  const visible =
    !hidden &&
    !status.isDevelopment &&
    !!version &&
    shouldShowUpdateBanner({
      available: status.updateAvailable,
      downloaded: status.updateDownloaded,
      version,
      snooze,
      now: Date.now(),
    });

  const later = useCallback(() => {
    const next = snoozeUpdateBanner(version, Date.now());
    try {
      localStorage.setItem(UPDATE_BANNER_SNOOZE_KEY, JSON.stringify(next));
    } catch {
      // A per-viewer convenience; the in-memory snooze still holds this session.
    }
    setSnooze(next);
  }, [version]);

  const download = useCallback(async () => {
    setFailed(null);
    try {
      const result = await downloadUpdate();
      if (result && result.success === false) setFailed("download");
    } catch {
      setFailed("download");
    }
  }, [downloadUpdate]);

  const install = useCallback(async () => {
    setFailed(null);
    try {
      await installUpdate();
    } catch {
      setFailed("install");
    }
  }, [installUpdate]);

  if (!visible) return null;

  const busy = isDownloading || isInstalling;
  const percent = Math.round(downloadProgress);
  const message = isInstalling
    ? t("controlPanel.update.installing")
    : isDownloading
      ? t("controlPanel.updateBanner.downloading", { version, percent })
      : status.updateDownloaded
        ? t("controlPanel.updateBanner.ready", { version })
        : t("controlPanel.updateBanner.available", { version });

  return (
    <div
      role="status"
      data-testid="update-banner"
      className="relative z-10 flex min-h-9 shrink-0 items-center gap-2 border-b border-primary/20 bg-primary/8 px-3 py-1.5 text-[12px] text-foreground"
    >
      {busy ? (
        <Loader2 size={14} className="shrink-0 animate-spin text-primary" />
      ) : (
        <Download size={14} className="shrink-0 text-primary" />
      )}
      <span className="min-w-0 flex-1 truncate">
        {message}
        {failed && (
          <span className="ml-2 text-destructive">
            {t(
              failed === "download"
                ? "controlPanel.updateBanner.downloadFailed"
                : "controlPanel.updateBanner.installFailed"
            )}
          </span>
        )}
      </span>
      {!busy &&
        (status.updateDownloaded ? (
          <button
            type="button"
            onClick={install}
            className={cn(actionClass, "bg-primary text-primary-foreground hover:bg-primary/90")}
          >
            <RefreshCw size={12} />
            {t("controlPanel.updateBanner.restart")}
          </button>
        ) : (
          <button
            type="button"
            onClick={download}
            className={cn(actionClass, "bg-primary text-primary-foreground hover:bg-primary/90")}
          >
            <Download size={12} />
            {t("controlPanel.updateBanner.download")}
          </button>
        ))}
      {!busy && (
        <button
          type="button"
          onClick={later}
          title={t("controlPanel.updateBanner.laterHint")}
          className={cn(
            actionClass,
            "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          )}
        >
          {t("controlPanel.updateBanner.later")}
        </button>
      )}
      {!busy && (
        <button
          type="button"
          onClick={later}
          aria-label={t("controlPanel.updateBanner.laterHint")}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X size={13} />
        </button>
      )}
      {isDownloading && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-primary/15" aria-hidden="true">
          <div
            className="h-full bg-primary transition-[width] duration-300"
            style={{ width: `${Math.max(2, Math.min(100, downloadProgress))}%` }}
          />
        </div>
      )}
    </div>
  );
}
