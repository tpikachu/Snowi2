import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import UpcomingMeetings from "../UpcomingMeetings";
import ActivityNoteRow from "../activity/ActivityNoteRow";
import NowCard from "./NowCard";
import MeetingActivityCard from "./MeetingActivityCard";
import CommitmentsCard from "./CommitmentsCard";
import NeedsWriteUpCard from "./NeedsWriteUpCard";
import AiSetupCard from "./AiSetupCard";
import StatusPanel from "./StatusPanel";
import { useRecentMeetings } from "../../hooks/useRecentMeetings";
import { useUpcomingEvents } from "../../hooks/useUpcomingEvents";
import { formatDateGroup, normalizeDbDate } from "../../utils/dateFormatting";
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
 * Home: what is happening, what is next, what just happened, and whether the
 * app is actually ready to capture it.
 *
 * Home used to be a mixed feed of notes, meetings and dictations — the same
 * objects the notes library already lists, in a second arrangement. Two views
 * of one collection is a navigation problem, not a feature, so Home no longer
 * lists notes at all. It is scoped by *time and meetings*: now, next, recent.
 * "Everything I have" is one place, and it is Notes.
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

  // The cards below hold a note id, not a note: a commitment records which
  // meeting it came from, and the backlog query returns columns rather than
  // whole rows. Fetched here so both open a note the same way the feed does.
  const openNoteById = useCallback(
    async (noteId: number) => {
      const note = await window.electronAPI?.getNote?.(noteId);
      if (note) onOpenNote(note);
    },
    [onOpenNote]
  );

  // Grouped by the day the meeting happened, so the list reads as a history
  // rather than an undifferentiated stack.
  const groups = useMemo(() => {
    const buckets: { id: string; label: string; items: NoteItem[] }[] = [];
    for (const meeting of meetings) {
      const date = normalizeDbDate(meeting.created_at || meeting.updated_at);
      const label = Number.isNaN(date.getTime()) ? t("common.unknown") : formatDateGroup(date, t);
      const last = buckets[buckets.length - 1];
      if (last && last.label === label) last.items.push(meeting);
      else buckets.push({ id: `home-group-${buckets.length}`, label, items: [meeting] });
    }
    return buckets;
  }, [meetings, t]);

  return (
    <div className="px-5 pb-8 pt-4">
      <div className="mx-auto w-full max-w-5xl">
        <NowCard
          events={events}
          onStartMeeting={onStartMeeting}
          isStartingMeeting={isStartingMeeting}
          onOpenRecordingNote={onOpenRecordingNote}
        />

        <MeetingActivityCard />

        {/* All three hide themselves when there is nothing to say. Order is by
            how much they are asking of the user: commitments are a to-do list,
            the write-up backlog is a repair job, and the AI setup is an offer
            — so it goes last, where it cannot push real work down the page. */}
        <CommitmentsCard onOpenNote={openNoteById} />
        <NeedsWriteUpCard onOpenNote={openNoteById} />
        <AiSetupCard />

        <div className="mt-4 flex gap-6">
          <div className="min-w-0 flex-1">
            <div className="flex h-7 items-center gap-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("home.recent.title")}
              </h2>
              <span className="tabular-figures text-[11px] text-muted-foreground/60">
                {meetings.length}
              </span>
              <div className="flex-1" />
              {meetings.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onBrowseAll}
                  className="h-6 px-2 text-[11px] text-muted-foreground"
                >
                  {t("home.recent.browseAll")}
                </Button>
              )}
            </div>

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

            {isLoading && meetings.length === 0 ? (
              <div className="mt-2 space-y-1.5">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : meetings.length === 0 ? (
              <EmptyMeetings
                onStartMeeting={() => onStartMeeting(null)}
                isStartingMeeting={isStartingMeeting}
              />
            ) : (
              <div className="mt-1">
                {groups.map((group, index) => (
                  <div key={group.id} className={index > 0 ? "mt-5" : ""}>
                    <div className="sticky top-0 z-10 flex items-center gap-2.5 bg-background py-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {group.label}
                      </span>
                      <div className="h-px flex-1 bg-border-subtle" />
                    </div>
                    <ul className="relative z-0 space-y-1.5">
                      {group.items.map((meeting) => (
                        <li key={meeting.id}>
                          <ActivityNoteRow note={meeting} onOpen={onOpenNote} preferCreatedAt />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className="hidden w-64 shrink-0 space-y-6 lg:block">
            {isConnected && (
              <div>
                <UpcomingMeetings events={events} isLoading={eventsLoading} />
              </div>
            )}
            <StatusPanel enabled />
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
    <div className="mt-2 flex flex-col items-center rounded-lg border border-dashed border-border-subtle px-6 py-10 text-center">
      <CalendarClock size={22} className="text-muted-foreground/40" />
      <p className="mt-3 text-sm font-medium text-foreground">{t("home.recent.emptyTitle")}</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
        {t("home.recent.emptyDescription")}
      </p>
      <Button
        variant="default"
        size="sm"
        className="mt-4 h-7 text-xs"
        disabled={isStartingMeeting}
        onClick={onStartMeeting}
      >
        {t("home.recent.emptyAction")}
      </Button>
    </div>
  );
}
