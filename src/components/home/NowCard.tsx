import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Radio, Video } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../lib/utils";
import type { CalendarEvent } from "../../types/calendar";
import { getMeetingJoinUrl } from "../../helpers/meetingJoinUrl";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";

/** How far ahead a meeting counts as "about to start" rather than "later". */
const IMMINENT_MS = 15 * 60 * 1000;
const CLOCK_TICK_MS = 30_000;

interface NowCardProps {
  events: CalendarEvent[];
  onStartMeeting: (event?: CalendarEvent | null) => void;
  isStartingMeeting: boolean;
  onOpenRecordingNote: () => void;
}

/**
 * The one thing Home exists to answer: is something happening right now, and
 * what do I press?
 *
 * It renders at most one card, and only when there is a real answer — a live
 * recording, a meeting in progress, or one about to start. With nothing going
 * on it renders nothing at all rather than a placeholder, so its presence on
 * screen always means something.
 */
export default function NowCard({
  events,
  onStartMeeting,
  isStartingMeeting,
  onOpenRecordingNote,
}: NowCardProps) {
  const { t, i18n } = useTranslation();
  const isRecording = useMeetingRecordingStore((s) => s.isRecording);
  const recordingTitle = useMeetingRecordingStore((s) => s.recordingNoteTitle);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const target = useMemo(() => {
    let live: CalendarEvent | null = null;
    let imminent: CalendarEvent | null = null;

    for (const event of events) {
      const start = new Date(event.start_time).getTime();
      const end = new Date(event.end_time).getTime();
      if (Number.isNaN(start) || Number.isNaN(end)) continue;

      if (start <= now && now <= end) {
        // Earliest start wins, so an all-day event cannot mask the actual call.
        if (!live || start > new Date(live.start_time).getTime()) live = event;
      } else if (start > now && start - now <= IMMINENT_MS) {
        if (!imminent || start < new Date(imminent.start_time).getTime()) imminent = event;
      }
    }
    return live ?? imminent;
  }, [events, now]);

  // A live recording outranks the calendar: what the app is doing beats what
  // the calendar says it should be doing.
  if (isRecording) {
    return (
      <Card tone="live">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="relative flex size-2 shrink-0" aria-hidden="true">
            <span className="absolute inline-flex size-full animate-pulse rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-destructive" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-destructive">
              {t("home.now.recording")}
            </p>
            <p className="truncate text-sm font-medium text-foreground">
              {recordingTitle?.trim() || t("notes.list.untitled")}
            </p>
          </div>
        </div>
        <Button
          variant="outline-flat"
          size="sm"
          className="h-7 shrink-0 text-xs"
          onClick={onOpenRecordingNote}
        >
          {t("home.now.openNote")}
        </Button>
      </Card>
    );
  }

  if (!target) return null;

  const start = new Date(target.start_time).getTime();
  const isLive = start <= now;
  const joinUrl = getMeetingJoinUrl(target);
  const startsIn = Math.max(1, Math.round((start - now) / 60000));

  return (
    <Card tone={isLive ? "live" : "next"}>
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Radio size={14} className={cn("shrink-0", isLive ? "text-success" : "text-primary")} />
        <div className="min-w-0">
          <p
            className={cn(
              "text-[11px] font-semibold uppercase tracking-wide",
              isLive ? "text-success" : "text-primary"
            )}
          >
            {isLive ? t("home.now.inProgress") : t("home.now.startsIn", { count: startsIn })}
          </p>
          <p className="truncate text-sm font-medium text-foreground">
            {target.summary?.trim() || t("upcoming.untitledEvent")}
          </p>
          <p className="mt-0.5 text-[11px] tabular-figures text-muted-foreground">
            {new Date(target.start_time).toLocaleTimeString(i18n.language, {
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {joinUrl && (
          <Button
            variant="outline-flat"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => {
              window.electronAPI?.openExternal?.(joinUrl);
              window.electronAPI?.joinCalendarMeeting?.(target.id);
            }}
          >
            <Video size={12} />
            {t("upcoming.join")}
          </Button>
        )}
        <Button
          variant="default"
          size="sm"
          className="h-7 text-xs"
          disabled={isStartingMeeting}
          onClick={() => onStartMeeting(target)}
        >
          {t("home.now.record")}
        </Button>
      </div>
    </Card>
  );
}

function Card({ tone, children }: { tone: "live" | "next"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3.5 py-3",
        tone === "live"
          ? "border-primary/25 bg-primary-subtle/60"
          : "border-border/50 bg-card/60 dark:border-border-subtle/70 dark:bg-surface-2/60"
      )}
    >
      {children}
    </div>
  );
}
