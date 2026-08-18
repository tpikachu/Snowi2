import React, { Fragment, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { Sparkles, X, Mic, Trash2, Archive, ShieldOff } from "lucide-react";
import TranscriptionItem from "./ui/TranscriptionItem";
import type { TranscriptionItem as TranscriptionItemType } from "../types/electron";
import { formatHotkeyLabel, parseHotkeyList } from "../utils/hotkeys";
import { formatDateGroup } from "../utils/dateFormatting";
import { cn } from "./lib/utils";
import { useUpcomingEvents } from "../hooks/useUpcomingEvents";
import UpcomingMeetings from "./UpcomingMeetings";
import { useSettingsStore } from "../stores/settingsStore";

interface HistoryViewProps {
  history: TranscriptionItemType[];
  isLoading: boolean;
  hotkey: string;
  aiCTADismissed: boolean;
  setAiCTADismissed: (dismissed: boolean) => void;
  useCleanupModel: boolean;
  copyToClipboard: (text: string) => void;
  deleteTranscription: (id: number) => void;
  clearAllTranscriptions: () => void;
  onOpenSettings: (section?: string) => void;
  onShowAudioInFolder: (id: number) => void;
  onRetryTranscription: (id: number, options?: { isRecover?: boolean }) => Promise<void>;
  showDiscarded: boolean;
  onToggleDiscarded: () => void;
}

const sectionLabelClass =
  "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  tone = "neutral",
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  onClick: () => void;
  tone?: "neutral" | "destructive";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground",
        "outline-none transition-colors duration-150 ease-snap",
        "focus-visible:ring-2 focus-visible:ring-ring",
        tone === "destructive"
          ? "hover:bg-destructive-subtle hover:text-destructive"
          : "hover:bg-surface-3 hover:text-foreground"
      )}
    >
      <Icon size={11} className="shrink-0" />
      <span>{label}</span>
    </button>
  );
}

/** Placeholder rows that match the real row geometry, so nothing jumps on load. */
function HistorySkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="flex items-center gap-3 py-2">
        <Skeleton className="h-2.5 w-16" />
        <div className="h-px flex-1 bg-border-subtle" />
      </div>
      <div className="space-y-1.5">
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            className="flex gap-3 rounded-lg border border-border-subtle bg-card px-3 py-2.5"
          >
            <Skeleton className="mt-0.5 h-3 w-9 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className={cn("h-3", row === 1 ? "w-2/3" : "w-11/12")} />
              <Skeleton className="h-2.5 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyHistory({ hotkey }: { hotkey: string }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl border border-border-subtle bg-surface-2 shadow-(--shadow-card)">
        <Mic size={20} className="text-primary" strokeWidth={1.8} />
      </div>
      <h3 className="text-sm font-medium text-foreground">{t("controlPanel.history.empty")}</h3>
      <p className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <span>{t("controlPanel.history.press")}</span>
        {parseHotkeyList(hotkey).map((hk, index) => (
          <Fragment key={hk}>
            {index > 0 && <span className="text-muted-foreground/50">/</span>}
            <kbd className="inline-flex h-5 items-center rounded-sm border border-border-subtle bg-surface-3 px-1.5 font-mono text-[11px] font-medium text-foreground">
              {formatHotkeyLabel(hk)}
            </kbd>
          </Fragment>
        ))}
        <span>{t("controlPanel.history.toStart")}</span>
      </p>
    </div>
  );
}

export default function HistoryView({
  history,
  isLoading,
  hotkey,
  aiCTADismissed,
  setAiCTADismissed,
  useCleanupModel,
  copyToClipboard,
  deleteTranscription,
  clearAllTranscriptions,
  onOpenSettings,
  onShowAudioInFolder,
  onRetryTranscription,
  showDiscarded,
  onToggleDiscarded,
}: HistoryViewProps) {
  const { t } = useTranslation();
  const dataRetentionEnabled = useSettingsStore((s) => s.dataRetentionEnabled);
  const { events, isLoading: eventsLoading, isConnected } = useUpcomingEvents();

  const groupedHistory = useMemo(() => {
    if (history.length === 0) return [];

    const groups: { label: string; items: TranscriptionItemType[] }[] = [];
    let currentLabel: string | null = null;

    for (const item of history) {
      const label = formatDateGroup(item.timestamp, t);

      if (label !== currentLabel) {
        groups.push({ label, items: [item] });
        currentLabel = label;
      } else {
        groups[groups.length - 1].items.push(item);
      }
    }

    return groups;
  }, [history, t]);

  return (
    <div className="px-5 pt-4 pb-8">
      <div className={cn("mx-auto", isConnected ? "max-w-5xl" : "max-w-3xl")}>
        {!useCleanupModel && !aiCTADismissed && (
          <div className="relative mb-4 rounded-lg border border-primary/25 bg-primary-subtle/60 p-3">
            <button
              onClick={() => {
                localStorage.setItem("aiCTADismissed", "true");
                setAiCTADismissed(true);
              }}
              aria-label={t("common.close")}
              className="absolute right-2 top-2 rounded-sm p-1 text-muted-foreground outline-none transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X size={14} />
            </button>
            <div className="flex items-start gap-3 pr-6">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10">
                <Sparkles size={15} className="text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground">
                  {t("controlPanel.aiCta.title")}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("controlPanel.aiCta.description")}
                </p>
                <Button
                  variant="default"
                  size="sm"
                  className="mt-2.5 h-7 text-xs"
                  onClick={() => onOpenSettings("intelligence")}
                >
                  {t("controlPanel.aiCta.enable")}
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className={cn(isConnected ? "flex gap-6" : "")}>
          <div className={cn("min-w-0", isConnected ? "flex-1" : "w-full")}>
            {/* View toolbar: section label on the left, list-level actions on the right. */}
            <div className="flex h-7 items-center gap-2">
              {isConnected && (
                <div className="flex items-center gap-1.5">
                  <Mic size={12} className="text-muted-foreground" />
                  <span className={sectionLabelClass}>{t("upcoming.transcriptions")}</span>
                </div>
              )}
              <div className="flex-1" />
              <ToolbarButton
                icon={Archive}
                onClick={onToggleDiscarded}
                label={
                  showDiscarded
                    ? t("controlPanel.history.discarded.hide")
                    : t("controlPanel.history.discarded.show")
                }
              />
              {history.length > 0 && (
                <ToolbarButton
                  icon={Trash2}
                  tone="destructive"
                  onClick={clearAllTranscriptions}
                  label={t("controlPanel.history.clearAll")}
                />
              )}
            </div>

            {!dataRetentionEnabled && (
              <div className="mt-2 flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2.5">
                <ShieldOff size={14} className="mt-px shrink-0 text-warning" />
                <p className="text-xs leading-relaxed text-foreground">
                  {t("controlPanel.history.dataRetentionDisabled")}
                </p>
              </div>
            )}

            {isLoading && history.length === 0 ? (
              <HistorySkeleton label={t("controlPanel.loading")} />
            ) : history.length === 0 ? (
              <div className="mt-2">
                <EmptyHistory hotkey={hotkey} />
              </div>
            ) : (
              <div>
                {groupedHistory.map((group, index) => (
                  <div key={group.label} className={index > 0 ? "mt-5" : ""}>
                    <div className="sticky top-0 z-10 flex items-center gap-2.5 bg-background py-2">
                      <span className={sectionLabelClass}>{group.label}</span>
                      <span className="tabular-figures text-[11px] text-muted-foreground/60">
                        {group.items.length}
                      </span>
                      <div className="h-px flex-1 bg-border-subtle" />
                    </div>
                    <div className="relative z-0 space-y-1.5">
                      {group.items.map((item) => (
                        <TranscriptionItem
                          key={item.id}
                          item={item}
                          onCopy={copyToClipboard}
                          onDelete={deleteTranscription}
                          onShowAudioInFolder={onShowAudioInFolder}
                          onRetryTranscription={onRetryTranscription}
                          onOpenSettings={() => onOpenSettings("transcription")}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isConnected && (
            <div className="hidden w-64 shrink-0 sm:block">
              <div className="sticky top-4">
                <UpcomingMeetings events={events} isLoading={eventsLoading} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
