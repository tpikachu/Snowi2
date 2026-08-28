import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, AudioLines, CalendarClock } from "lucide-react";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import UpcomingMeetings from "../UpcomingMeetings";
import MeetingRow from "./MeetingRow";
import NowCard from "./NowCard";
import CalendarNudge from "./CalendarNudge";
import NeedsWriteUpCard from "./NeedsWriteUpCard";
import { useRecentMeetings } from "../../hooks/useRecentMeetings";
import { useUpcomingEvents } from "../../hooks/useUpcomingEvents";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import { formatDateGroup, normalizeDbDate } from "../../utils/dateFormatting";
import { cn } from "../lib/utils";
import type { NoteItem } from "../../types/electron";
import type { CalendarEvent } from "../../types/calendar";

interface HomeViewProps {
  onOpenNote: (note: NoteItem) => void;
  onStartMeeting: (event?: CalendarEvent | null) => void;
  isStartingMeeting: boolean;
  onOpenRecordingNote: () => void;
  onBrowseAll: () => void;
}

/**
 * Home: press the button, or find the meeting.
 *
 * This used to be a dashboard — activity chart, commitments, capability
 * cards, a status panel — and every card was one more thing between the user
 * and the two acts that matter: starting a meeting and getting back to one.
 * Now the page is those two acts: Start at the top (search lives in the
 * window header, reachable from every screen), the meeting history under it,
 * upcoming meetings beside it. Anything that only *describes* the app rather
 * than doing the work lives elsewhere.
 */
export default function HomeView({
  onOpenNote,
  onStartMeeting,
  isStartingMeeting,
  onOpenRecordingNote,
  onBrowseAll,
}: HomeViewProps) {
  const { t } = useTranslation();
  const { events, isLoading: eventsLoading, isConnected } = useUpcomingEvents();
  const { meetings, isLoading, hasError, reload } = useRecentMeetings(true);
  const isRecording = useMeetingRecordingStore((s) => s.isRecording);
  const recordingNoteId = useMeetingRecordingStore((s) => s.recordingNoteId);
  const recordingNoteTitle = useMeetingRecordingStore((s) => s.recordingNoteTitle);

  // The backlog card holds a note id, not a note; fetched here so it opens a
  // note the same way the list does.
  const openNoteById = useCallback(
    async (noteId: number) => {
      const note = await window.electronAPI?.getNote?.(noteId);
      if (note) onOpenNote(note);
    },
    [onOpenNote]
  );

  // Grouped by the day the meeting happened, so the list reads as a history
  // rather than an undifferentiated stack. The note being recorded right now
  // is excluded — it gets the live row above the list instead.
  const groups = useMemo(() => {
    const buckets: { id: string; label: string; items: NoteItem[] }[] = [];
    for (const meeting of meetings) {
      if (isRecording && meeting.id === recordingNoteId) continue;
      const date = normalizeDbDate(meeting.created_at || meeting.updated_at);
      const label = Number.isNaN(date.getTime()) ? t("common.unknown") : formatDateGroup(date, t);
      const last = buckets[buckets.length - 1];
      if (last && last.label === label) last.items.push(meeting);
      else buckets.push({ id: `home-group-${buckets.length}`, label, items: [meeting] });
    }
    return buckets;
  }, [meetings, isRecording, recordingNoteId, t]);

  const hasRows = isRecording || meetings.length > 0;

  return (
    <div className="px-6 pb-10 pt-5">
      <div className="mx-auto w-full max-w-5xl">
        {/* The one act this page owns: start. Search sits in the window
            header, shared by every screen. */}
        <div className="flex items-center">
          <Button
            onClick={() => onStartMeeting(null)}
            disabled={isStartingMeeting || isRecording}
            className="h-10 rounded-full px-5 text-[13px] font-semibold shadow-[0_4px_24px_-8px_var(--color-primary)]"
          >
            <AudioLines size={15} strokeWidth={2} />
            {t("home.hero.start")}
          </Button>
        </div>

        {!isConnected && <CalendarNudge />}

        <div className="mt-5">
          {/* While recording, the live list row below is the recording
              indicator — NowCard's own live card would say it twice. */}
          {!isRecording && (
            <NowCard
              events={events}
              onStartMeeting={onStartMeeting}
              isStartingMeeting={isStartingMeeting}
              onOpenRecordingNote={onOpenRecordingNote}
            />
          )}
          <NeedsWriteUpCard onOpenNote={openNoteById} />
        </div>

        <div className="mt-2 flex gap-8">
          <div className="min-w-0 flex-1">
            {hasError && (
              <div className="mt-2 flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive-subtle/70 px-3 py-2.5">
                <AlertTriangle size={14} className="mt-px shrink-0 text-destructive" />
                <p className="min-w-0 flex-1 text-xs leading-relaxed text-foreground">
                  {t("home.recent.error")}
                </p>
                <Button
                  variant="outline-flat"
                  size="sm"
                  onClick={reload}
                  className="h-6 shrink-0 px-2 text-[11px]"
                >
                  {t("common.retry")}
                </Button>
              </div>
            )}

            {isLoading && !hasRows ? (
              <div className="mt-3 space-y-1.5">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-11 w-full rounded-xl" />
                ))}
              </div>
            ) : !hasRows ? (
              <EmptyMeetings
                onStartMeeting={() => onStartMeeting(null)}
                isStartingMeeting={isStartingMeeting}
              />
            ) : (
              <div className="mt-1">
                {/* The meeting happening right now, above everything with its
                    own pulse — the one row that is not history yet. */}
                {isRecording && (
                  <div className="pt-2">
                    <div className="flex items-center py-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {formatDateGroup(new Date(), t)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={onOpenRecordingNote}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left",
                        "border border-primary/25 bg-primary/[0.06]",
                        "transition-colors duration-150 ease-snap hover:bg-primary/[0.1]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      )}
                    >
                      <span className="relative flex size-2 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                        <span className="relative inline-flex size-2 rounded-full bg-primary" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-foreground">
                        {recordingNoteTitle?.trim() || t("notes.meeting.stopDialog.untitled")}
                      </span>
                      <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        {t("home.activeSession.ongoing")}
                      </span>
                    </button>
                  </div>
                )}

                {groups.map((group, index) => {
                  // The live row already sits under a "Today" header; the first
                  // group repeating it would label the same day twice.
                  const labelCovered =
                    isRecording && index === 0 && group.label === formatDateGroup(new Date(), t);
                  return (
                    <div key={group.id} className={index > 0 || isRecording ? "mt-1" : ""}>
                      {!labelCovered && (
                        <div className="sticky top-0 z-10 flex items-center bg-background py-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {group.label}
                          </span>
                        </div>
                      )}
                      <ul className="relative z-0 space-y-0.5">
                        {group.items.map((meeting) => (
                          <li key={meeting.id}>
                            <MeetingRow note={meeting} onOpen={onOpenNote} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}

                {meetings.length > 0 && (
                  <div className="mt-4 flex justify-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onBrowseAll}
                      className="h-7 px-3 text-[11px] text-muted-foreground"
                    >
                      {t("home.recent.browseAll")}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <aside className="hidden w-64 shrink-0 lg:block">
            {isConnected && <UpcomingMeetings events={events} isLoading={eventsLoading} />}
          </aside>
        </div>
      </div>
    </div>
  );
}

function EmptyMeetings({
  onStartMeeting,
  isStartingMeeting,
}: {
  onStartMeeting: () => void;
  isStartingMeeting: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-4 flex flex-col items-center rounded-2xl border border-dashed border-border-subtle px-6 py-12 text-center">
      <CalendarClock size={22} className="text-muted-foreground/40" />
      <p className="mt-3 text-sm font-medium text-foreground">{t("home.recent.emptyTitle")}</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
        {t("home.recent.emptyDescription")}
      </p>
      <Button
        variant="default"
        size="sm"
        className="mt-4 h-8 rounded-full px-4 text-xs"
        disabled={isStartingMeeting}
        onClick={onStartMeeting}
      >
        {t("home.recent.emptyAction")}
      </Button>
    </div>
  );
}
