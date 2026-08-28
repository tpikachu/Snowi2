import { useTranslation } from "react-i18next";
import { formatSessionLength, resolveMeetingWindow } from "../../utils/meetingWindow";
import { normalizeDbDate } from "../../utils/dateFormatting";
import { cn } from "../lib/utils";
import type { NoteItem } from "../../types/electron";

/**
 * A meeting in the home list: the title, and on the right how long it ran and
 * when it started. Nothing else — word counts and speaker counts are facts
 * about the file, not the meeting, and every extra number on the row is a
 * reason the list stops being glanceable. The details live one click away in
 * the note.
 */
export default function MeetingRow({
  note,
  onOpen,
}: {
  note: NoteItem;
  onOpen: (note: NoteItem) => void;
}) {
  const { t, i18n } = useTranslation();

  const window = resolveMeetingWindow(note);
  const duration = formatSessionLength(note);
  const startDate = window?.start ?? normalizeDbDate(note.created_at || note.updated_at);
  const startTime = Number.isNaN(startDate.getTime())
    ? null
    : startDate.toLocaleTimeString(i18n.language, { hour: "numeric", minute: "2-digit" });

  return (
    <button
      type="button"
      onClick={() => onOpen(note)}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left",
        "transition-colors duration-150 ease-snap",
        "hover:bg-surface-1",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium leading-snug text-foreground">
        {note.title?.trim() || t("notes.meeting.stopDialog.untitled")}
      </span>
      {duration && (
        <span className="shrink-0 rounded-full border border-border-subtle bg-surface-2 px-2 py-0.5 text-[11px] font-semibold tabular-figures text-foreground/90">
          {window?.approximate ? `~${duration}` : duration}
        </span>
      )}
      {startTime && (
        <span className="w-16 shrink-0 text-right text-[11px] tabular-figures text-muted-foreground">
          {startTime}
        </span>
      )}
    </button>
  );
}
