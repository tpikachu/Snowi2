import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpRight } from "lucide-react";
import type { NoteItem } from "../../types/electron";
import { cn } from "../lib/utils";
import { formatMmSs } from "../../utils/formatDuration";
import { formatMeetingWindow, formatSessionLength } from "../../utils/meetingWindow";
import { normalizeDbDate } from "../../utils/dateFormatting";

function countWords(note: NoteItem): number {
  const source = note.content?.trim() ? note.content : (note.transcript ?? "");
  if (!source) return 0;
  const plain = source.replace(/<[^>]*>/g, " ").trim();
  return plain ? plain.split(/\s+/).length : 0;
}

interface ActivityNoteRowProps {
  note: NoteItem;
  onOpen: (note: NoteItem) => void;
  /**
   * Show when the note was created rather than last edited. Home's meeting
   * list is ordered by when the meeting happened, and a row stamped with a
   * later edit would contradict the day it is filed under.
   */
  preferCreatedAt?: boolean;
}

/**
 * A note or meeting in the activity stream. Read-only by design: opening it
 * hands off to the notes section, which owns every note mutation.
 */
export default function ActivityNoteRow({
  note,
  onOpen,
  preferCreatedAt = false,
}: ActivityNoteRowProps) {
  const { t, i18n } = useTranslation();

  const time = useMemo(() => {
    const raw = preferCreatedAt
      ? note.created_at || note.updated_at
      : note.updated_at || note.created_at;
    const date = normalizeDbDate(raw);
    return Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });
  }, [note.updated_at, note.created_at, preferCreatedAt, i18n.language]);

  const isMeeting = note.note_type === "meeting";
  // A meeting reports the window it ran for; anything else has only a length.
  // "14:05 – 14:52" answers "when was that call" without opening the note,
  // which a bare "47:18" never does.
  const sessionWindow = isMeeting ? formatMeetingWindow(note, i18n.language) : null;
  const duration = isMeeting
    ? formatSessionLength(note)
    : note.audio_duration_seconds && note.audio_duration_seconds > 0
      ? formatMmSs(Math.round(note.audio_duration_seconds))
      : null;
  const words = countWords(note);
  const speakers =
    isMeeting && note.expected_speaker_count && note.expected_speaker_count > 0
      ? note.expected_speaker_count
      : null;

  const typeLabel = isMeeting
    ? t("activity.types.meeting")
    : note.note_type === "upload"
      ? t("activity.types.upload")
      : t("activity.types.note");

  const meta = [
    typeLabel,
    // The tilde marks a window inferred from a legacy row's duration, which is
    // wrong by however long the meeting was paused.
    sessionWindow
      ? sessionWindow.approximate
        ? `~${sessionWindow.text}`
        : sessionWindow.text
      : null,
    duration,
    words > 0 ? t("activity.words", { count: words }) : null,
    speakers ? t("activity.speakers", { count: speakers }) : null,
  ].filter(Boolean) as string[];

  return (
    <button
      type="button"
      onClick={() => onOpen(note)}
      className={cn(
        "group/row block w-full rounded-lg border border-l-2 px-3 py-2.5 text-left",
        "outline-none transition-colors duration-150 ease-snap",
        "border-border-subtle bg-card hover:border-border hover:bg-surface-3",
        "focus-visible:ring-2 focus-visible:ring-ring",
        isMeeting ? "border-l-primary/70" : "border-l-transparent"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="min-w-10 shrink-0 whitespace-nowrap pt-0.5 text-[11px] leading-4 tabular-figures text-muted-foreground"
          aria-hidden={time ? undefined : true}
        >
          {time}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-5 text-foreground">
            {note.title?.trim() || t("notes.list.untitled")}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] leading-none text-muted-foreground">
            {meta.map((part, index) => (
              <span key={`${index}-${part}`} className="flex items-center gap-1.5">
                {index > 0 && (
                  <span aria-hidden="true" className="text-muted-foreground/40">
                    ·
                  </span>
                )}
                <span className={index === 0 ? undefined : "tabular-figures"}>{part}</span>
              </span>
            ))}
          </div>
        </div>

        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center self-start rounded-sm text-muted-foreground",
            "opacity-0 transition-opacity duration-150 ease-snap",
            "group-hover/row:opacity-100 group-focus-visible/row:opacity-100"
          )}
        >
          <ArrowUpRight size={13} />
          <span className="sr-only">{t("activity.open")}</span>
        </span>
      </div>
    </button>
  );
}
