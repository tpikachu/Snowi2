import React, { Fragment } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CalendarClock,
  FileAudio,
  Loader2,
  Mic,
  NotebookPen,
  ShieldOff,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import TranscriptionItem from "../ui/TranscriptionItem";
import UpcomingMeetings from "../UpcomingMeetings";
import ActivityNoteRow from "./ActivityNoteRow";
import type { ActivityEntry, ActivityFeedState } from "./useActivityFeed";
import type { NoteItem } from "../../types/electron";
import { cn } from "../lib/utils";
import { formatHotkeyLabel, parseHotkeyList } from "../../utils/hotkeys";
import { useUpcomingEvents } from "../../hooks/useUpcomingEvents";
import { useSettingsStore } from "../../stores/settingsStore";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import {
  requestDictationToggle,
  useDictationCaptureState,
  useDictationHotkeyStatus,
} from "../shell/captureBridge";

const sectionLabelClass =
  "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

/**
 * The stream's left gutter: one glyph per entry type, so the merged feed still
 * reads as three distinct kinds of activity at a glance.
 */
function TypeGlyph({ entry }: { entry: ActivityEntry }) {
  const { t } = useTranslation();

  let Icon: React.ComponentType<{ size?: number; className?: string }> = Mic;
  let label = t("activity.types.dictation");
  let tone = "border-border-subtle bg-surface-2 text-muted-foreground";

  if (entry.kind === "meeting") {
    Icon = CalendarClock;
    label = t("activity.types.meeting");
    tone = "border-primary/25 bg-primary/10 text-primary";
  } else if (entry.kind === "note") {
    const isUpload = entry.note.note_type === "upload";
    Icon = isUpload ? FileAudio : NotebookPen;
    label = isUpload ? t("activity.types.upload") : t("activity.types.note");
  }

  return (
    <span
      className={cn(
        "mt-2 flex size-5 shrink-0 items-center justify-center rounded-sm border",
        tone
      )}
    >
      <Icon size={11} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

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
function FeedSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="flex items-center gap-3 py-2">
        <Skeleton className="h-2.5 w-16" />
        <div className="h-px flex-1 bg-border-subtle" />
      </div>
      <div className="space-y-1.5">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex items-start gap-2">
            <Skeleton className="mt-2 size-5 shrink-0 rounded-sm" />
            <div className="flex flex-1 gap-3 rounded-lg border border-border-subtle bg-card px-3 py-2.5">
              <Skeleton className="mt-0.5 h-3 w-9 shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className={cn("h-3", row % 2 ? "w-2/3" : "w-11/12")} />
                <Skeleton className="h-2.5 w-24" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * First-run invitation. The hotkey line alone left a user who never learned
 * the shortcut with nothing to click, so the two capture actions lead and the
 * shortcut is taught underneath them — or replaced by a plain-language
 * fallback when nothing is actually registered.
 */
function EmptyActivity({
  hotkey,
  onStartMeeting,
  isStartingMeeting,
}: {
  hotkey: string;
  onStartMeeting: () => void;
  isStartingMeeting: boolean;
}) {
  const { t } = useTranslation();
  const dictation = useDictationCaptureState();
  const { isResolving, isRegistered } = useDictationHotkeyStatus();
  const isMeetingRecording = useMeetingRecordingStore((s) => s.isRecording);
  const isMeetingTranscribing = useMeetingRecordingStore((s) => s.isTranscribing);
  const isBusy =
    dictation.isRecording ||
    dictation.isProcessing ||
    isMeetingRecording ||
    isMeetingTranscribing ||
    isStartingMeeting;

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl border border-border-subtle bg-surface-2 shadow-(--shadow-card)">
        <Mic size={20} className="text-primary" strokeWidth={1.8} />
      </div>
      <h3 className="text-sm font-medium text-foreground">{t("activity.empty.title")}</h3>
      <p className="mt-1.5 max-w-sm text-xs text-muted-foreground">
        {t("activity.empty.description")}
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="default"
          size="sm"
          disabled={isBusy}
          onClick={() => void requestDictationToggle()}
          className="h-8 gap-1.5 text-xs"
        >
          <Mic size={14} strokeWidth={2} aria-hidden="true" />
          {t("capture.dictate")}
        </Button>
        <Button
          variant="outline-flat"
          size="sm"
          disabled={isBusy}
          onClick={onStartMeeting}
          className="h-8 gap-1.5 text-xs"
        >
          {isStartingMeeting ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <CalendarClock size={14} strokeWidth={2} aria-hidden="true" />
          )}
          {t("capture.meeting")}
        </Button>
      </div>

      {!isResolving && !isRegistered ? (
        <p className="mt-3 max-w-sm text-xs text-muted-foreground">{t("capture.empty.noHotkey")}</p>
      ) : (
        <p className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-xs text-muted-foreground">
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
      )}
    </div>
  );
}

function EmptyFilter({ filter, onClear }: { filter: string; onClear: () => void }) {
  const { t } = useTranslation();
  const messageKey =
    filter === "dictation"
      ? "activity.empty.dictations"
      : filter === "meeting"
        ? "activity.empty.meetings"
        : "activity.empty.notes";

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <p className="text-sm text-foreground">{t(messageKey)}</p>
      <Button variant="outline-flat" size="sm" onClick={onClear} className="mt-3 h-7 text-xs">
        {t("activity.filters.clear")}
      </Button>
    </div>
  );
}

interface ActivityFeedProps {
  feed: ActivityFeedState;
  /** Dictation history is still loading its first page. */
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
  onOpenNote: (note: NoteItem) => void;
  /** Empty-state capture invitation — same handler as the shell's control. */
  onStartMeeting: () => void;
  isStartingMeeting: boolean;
}

/**
 * Home: one reverse-chronological stream of dictations, meetings and notes.
 * Rows keep the actions they had in their own sections — a dictation is still
 * the full transcription row, a note still opens in the notes editor.
 */
export default function ActivityFeed({
  feed,
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
  onOpenNote,
  onStartMeeting,
  isStartingMeeting,
}: ActivityFeedProps) {
  const { t } = useTranslation();
  const dataRetentionEnabled = useSettingsStore((s) => s.dataRetentionEnabled);
  const { events, isLoading: eventsLoading, isConnected } = useUpcomingEvents();

  const { groups, filter, setFilter, totalCount, visibleCount, notesError, reloadNotes } = feed;
  const isFirstLoad = (isLoading || feed.isLoadingNotes) && totalCount === 0;
  // The toolbar caption names the active facet, so the content always says
  // what the context pane is currently scoping it to.
  const streamLabel = t(
    filter === "dictation"
      ? "activity.filters.dictations"
      : filter === "meeting"
        ? "activity.filters.meetings"
        : filter === "note"
          ? "activity.filters.notes"
          : "activity.filters.all"
  );

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
            {/* View toolbar: stream label on the left, list-level actions on the right. */}
            <div className="flex h-7 items-center gap-2">
              <span className={sectionLabelClass}>{streamLabel}</span>
              <span className="tabular-figures text-[11px] text-muted-foreground/60">
                {visibleCount}
              </span>
              <div className="flex-1" />
              {feed.counts.dictation > 0 && (
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

            {notesError && (
              <div className="mt-2 flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive-subtle/70 px-3 py-2.5">
                <AlertTriangle size={14} className="mt-px shrink-0 text-destructive" />
                <p className="min-w-0 flex-1 text-xs leading-relaxed text-foreground">
                  {t("activity.notesError")}
                </p>
                <Button
                  variant="outline-flat"
                  size="sm"
                  onClick={reloadNotes}
                  className="h-6 shrink-0 px-2 text-[11px]"
                >
                  {t("common.retry")}
                </Button>
              </div>
            )}

            {isFirstLoad ? (
              <FeedSkeleton label={t("controlPanel.loading")} />
            ) : visibleCount === 0 ? (
              <div className="mt-2">
                {totalCount === 0 ? (
                  <EmptyActivity
                    hotkey={hotkey}
                    onStartMeeting={onStartMeeting}
                    isStartingMeeting={isStartingMeeting}
                  />
                ) : (
                  <EmptyFilter filter={filter} onClear={() => setFilter("all")} />
                )}
              </div>
            ) : (
              <div>
                {groups.map((group, index) => (
                  <div key={group.id} className={index > 0 ? "mt-5" : ""}>
                    <div
                      id={group.id}
                      className="sticky top-0 z-10 flex items-center gap-2.5 bg-background py-2"
                    >
                      <span className={sectionLabelClass}>{group.label}</span>
                      <span className="tabular-figures text-[11px] text-muted-foreground/60">
                        {group.entries.length}
                      </span>
                      <div className="h-px flex-1 bg-border-subtle" />
                    </div>
                    <ul className="relative z-0 space-y-1.5">
                      {group.entries.map((entry) => (
                        <li key={entry.key} className="flex items-start gap-2">
                          <TypeGlyph entry={entry} />
                          <div className="min-w-0 flex-1">
                            {entry.kind === "dictation" ? (
                              <TranscriptionItem
                                item={entry.dictation}
                                onCopy={copyToClipboard}
                                onDelete={deleteTranscription}
                                onShowAudioInFolder={onShowAudioInFolder}
                                onRetryTranscription={onRetryTranscription}
                                onOpenSettings={() => onOpenSettings("transcription")}
                              />
                            ) : (
                              <ActivityNoteRow note={entry.note} onOpen={onOpenNote} />
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
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
