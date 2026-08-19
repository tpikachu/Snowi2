import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./button";
import { Tooltip } from "./tooltip";
import {
  Copy,
  Trash2,
  FileText,
  FolderOpen,
  RotateCcw,
  Loader2,
  AlertCircle,
  ArchiveRestore,
} from "lucide-react";
import type {
  TranscriptionItem as TranscriptionItemType,
  TranscriptionErrorCode,
} from "../../types/electron";
import { cn } from "../lib/utils";
import { getCachedPlatform } from "../../utils/platform";
import { formatMmSs } from "../../utils/formatDuration";

const platform = getCachedPlatform();

function getShowInFolderKey(): string {
  if (platform === "win32") return "controlPanel.history.showInFolderWindows";
  if (platform === "linux") return "controlPanel.history.showInFolderLinux";
  return "controlPanel.history.showInFolder";
}

/**
 * Row actions stay mounted at full size and only fade in, so revealing them on
 * hover or keyboard focus never reflows the row.
 */
const actionClusterClass = [
  "flex shrink-0 items-center gap-0.5 self-start",
  "transition-opacity duration-150 ease-snap",
].join(" ");

// 28px: the hit-target floor for a dense row action.
const iconButtonClass = "size-7 rounded-control text-muted-foreground";

interface TranscriptionItemProps {
  item: TranscriptionItemType;
  onCopy: (text: string) => void;
  onDelete: (id: number) => void;
  onShowAudioInFolder?: (id: number) => void;
  onRetryTranscription?: (id: number, options?: { isRecover?: boolean }) => Promise<void>;
  onOpenSettings?: () => void;
}

export default function TranscriptionItem({
  item,
  onCopy,
  onDelete,
  onShowAudioInFolder,
  onRetryTranscription,
  onOpenSettings,
}: TranscriptionItemProps) {
  const { t, i18n } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const timestampSource = item.timestamp.endsWith("Z") ? item.timestamp : `${item.timestamp}Z`;
  const timestampDate = new Date(timestampSource);
  const formattedTime = Number.isNaN(timestampDate.getTime())
    ? ""
    : timestampDate.toLocaleTimeString(i18n.language, {
        hour: "2-digit",
        minute: "2-digit",
      });

  const handleRetry = async () => {
    if (isRetrying || !onRetryTranscription) return;
    setIsRetrying(true);
    try {
      await onRetryTranscription(item.id, { isRecover: item.status === "discarded" });
    } finally {
      setIsRetrying(false);
    }
  };

  const isFailed = item.status === "failed";
  const isDiscarded = item.status === "discarded";
  const duration =
    item.audio_duration_ms && item.audio_duration_ms > 0
      ? formatMmSs(Math.round(item.audio_duration_ms / 1000))
      : null;
  const rawText = item.raw_text;
  const hasRawText = rawText !== null;
  const hasAudio = item.has_audio === 1;
  const showUtilityGroup = hasRawText || hasAudio;
  const model = item.model?.trim() || null;
  const showMeta = !isFailed && !isDiscarded && (duration || model);

  const retryLabelKey =
    item.route_kind === "translation"
      ? "controlPanel.history.retryTranslationMode"
      : "controlPanel.history.retryTranscription";

  const errorCode = item.error_code as TranscriptionErrorCode;
  const isConfigError =
    errorCode === "API_KEY_MISSING" ||
    errorCode === "INVALID_KEY" ||
    errorCode === "MODEL_NOT_AVAILABLE" ||
    errorCode === "CUSTOM_ENDPOINT_INVALID";
  const isLimitError = errorCode === "LIMIT_REACHED";
  const isOfflineError = errorCode === "OFFLINE";

  // Failed and discarded rows keep their actions on screen: they are the rows
  // that need an obvious next step.
  const actionsAlwaysVisible = isFailed || isDiscarded;

  return (
    <div
      className={cn(
        // Rule 3 - the whole state vocabulary of a row lives on its leading
        // edge: red rail = failed, neutral rail = discarded, teal rail =
        // translated, no rail = an ordinary transcript. It is an inset shadow,
        // so a rail never shifts the text by a pixel and a long history stays
        // column-aligned however many states are mixed into it.
        "group/row relative rounded-surface border px-2.5 py-2",
        "transition-[background-color,border-color,box-shadow] duration-100 ease-snap",
        isFailed
          ? "border-border-subtle bg-surface-1 shadow-[var(--shadow-panel),inset_2px_0_0_var(--color-destructive)]"
          : isDiscarded
            ? "border-border-subtle bg-surface-1 shadow-[var(--shadow-panel),inset_2px_0_0_var(--color-border-hover)] hover:bg-surface-2"
            : item.route_kind === "translation"
              ? "border-border-subtle bg-card shadow-[var(--shadow-panel),inset_2px_0_0_var(--color-primary)] hover:border-border hover:bg-surface-2"
              : "border-border-subtle bg-card shadow-(--shadow-panel) hover:border-border hover:bg-surface-2"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="min-w-10 shrink-0 whitespace-nowrap pl-1 pt-0.5 text-[11px] leading-4 tabular-figures text-muted-foreground"
          aria-hidden={formattedTime ? undefined : true}
        >
          {formattedTime}
        </span>

        {isFailed ? (
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-control border border-destructive/30 bg-destructive/10 text-destructive">
              <AlertCircle size={12} strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold leading-5 text-foreground">
                {t("controlPanel.history.transcriptionFailed")}
              </p>
              {item.error_message && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {item.error_message}
                </p>
              )}
              {isConfigError && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {hasAudio ? (
                    <>
                      <button
                        onClick={() => onOpenSettings?.()}
                        className="focus-ring-tight cursor-pointer rounded-control text-primary hover:underline"
                      >
                        {t("controlPanel.history.failedCtaSettings")}
                      </button>{" "}
                      {t("controlPanel.history.failedCtaAndRetry")}
                    </>
                  ) : (
                    <button
                      onClick={() => onOpenSettings?.()}
                      className="focus-ring-tight cursor-pointer rounded-control text-primary hover:underline"
                    >
                      {t("controlPanel.history.failedCtaSettingsOnly")}
                    </button>
                  )}
                </p>
              )}
              {isLimitError && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("controlPanel.history.failedLimitReached")}
                </p>
              )}
              {isOfflineError && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("controlPanel.history.failedOffline")}
                </p>
              )}
              {hasAudio && (
                <Button
                  variant="outline-flat"
                  size="sm"
                  onClick={handleRetry}
                  disabled={isRetrying}
                  title={t(retryLabelKey)}
                  className="mt-2 gap-1.5 text-destructive hover:border-destructive/45 hover:bg-destructive/10 hover:text-destructive"
                >
                  {isRetrying ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <RotateCcw size={12} />
                  )}
                  {t("common.retry")}
                </Button>
              )}
            </div>
          </div>
        ) : isDiscarded ? (
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="micro-caps shrink-0 rounded-control border border-border-subtle bg-surface-3 px-1.5 py-0.5 text-muted-foreground">
                {t("controlPanel.history.discarded.badge")}
              </span>
              <span className="truncate text-[13px] leading-5 text-muted-foreground">
                {duration
                  ? t("controlPanel.history.discarded.recordingWithDuration", {
                      duration,
                    })
                  : t("controlPanel.history.discarded.recording")}
              </span>
            </div>
            {hasAudio && (
              <Button
                variant="outline-flat"
                size="sm"
                onClick={handleRetry}
                disabled={isRetrying}
                className="mt-2 gap-1.5"
              >
                {isRetrying ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <ArchiveRestore size={12} />
                )}
                {t("controlPanel.history.discarded.recover")}
              </Button>
            )}
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="whitespace-pre-wrap wrap-break-word text-[13px] leading-5 text-foreground">
              {item.text}
            </p>
            {showMeta && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] leading-none text-muted-foreground">
                {duration && (
                  <span className="tabular-figures" title={t("common.duration")}>
                    {duration}
                  </span>
                )}
                {duration && model && (
                  <span aria-hidden="true" className="text-muted-foreground/40">
                    ·
                  </span>
                )}
                {model && (
                  <span className="max-w-48 truncate" title={t("common.model")}>
                    {model}
                  </span>
                )}
              </div>
            )}

            {rawText !== null && (
              <div
                inert={!isExpanded}
                className={cn(
                  "grid transition-[grid-template-rows] duration-200 ease-snap",
                  isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                )}
              >
                <div className="min-h-0 overflow-hidden">
                  {/* Rule 4: the drawer seam bleeds to the row edge. */}
                  <div className="-mx-2.5 mt-2 border-t border-border-subtle px-2.5 pt-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="micro-caps text-muted-foreground">
                        {t("controlPanel.history.rawTranscript")}
                      </span>
                      <Tooltip content={t("controlPanel.history.copyRawTranscript")}>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onCopy(rawText)}
                          className="size-5 rounded-control text-muted-foreground hover:text-foreground"
                        >
                          <Copy size={10} />
                        </Button>
                      </Tooltip>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap wrap-break-word text-xs leading-relaxed text-muted-foreground">
                      {rawText}
                    </p>
                    {rawText === item.text && (
                      <p className="mt-1 text-[11px] italic text-muted-foreground">
                        {t("controlPanel.history.noAiProcessing")}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div
          className={cn(
            actionClusterClass,
            actionsAlwaysVisible
              ? "opacity-100"
              : "opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100"
          )}
        >
          {!isFailed && !isDiscarded && hasRawText && (
            <Tooltip content={t("controlPanel.history.viewRawTranscript")}>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setIsExpanded(!isExpanded)}
                aria-expanded={isExpanded}
                className={cn(
                  iconButtonClass,
                  "hover:bg-surface-3 hover:text-foreground",
                  isExpanded &&
                    "bg-surface-3 text-primary shadow-[inset_2px_0_0_var(--color-primary)]"
                )}
              >
                <FileText size={12} />
              </Button>
            </Tooltip>
          )}
          {hasAudio && (
            <Tooltip content={t(getShowInFolderKey())}>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onShowAudioInFolder?.(item.id)}
                className={cn(iconButtonClass, "hover:bg-surface-3 hover:text-foreground")}
              >
                <FolderOpen size={12} />
              </Button>
            </Tooltip>
          )}
          {!isFailed && !isDiscarded && hasAudio && (
            <Tooltip content={t(retryLabelKey)}>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleRetry}
                disabled={isRetrying}
                className={cn(iconButtonClass, "hover:bg-surface-3 hover:text-foreground")}
              >
                {isRetrying ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RotateCcw size={12} />
                )}
              </Button>
            </Tooltip>
          )}
          {showUtilityGroup && !isFailed && !isDiscarded && (
            <div aria-hidden="true" className="mx-0.5 h-3.5 w-px bg-border-subtle" />
          )}
          {!isFailed && !isDiscarded && (
            <Tooltip content={t("controlPanel.history.copyText")}>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onCopy(item.text)}
                className={cn(iconButtonClass, "hover:text-foreground")}
              >
                <Copy size={12} />
              </Button>
            </Tooltip>
          )}
          <Tooltip content={t("controlPanel.history.deleteItem")}>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onDelete(item.id)}
              className={cn(iconButtonClass, "hover:bg-destructive/10 hover:text-destructive")}
            >
              <Trash2 size={12} />
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
