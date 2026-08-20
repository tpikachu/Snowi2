import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { useMeetingsNeedingWriteUp } from "../../hooks/useMeetingsNeedingWriteUp";
import { useActionProcessingStore } from "../../stores/actionProcessingStore";
import { getGenerateNotesAction } from "../../helpers/meetingNoteGeneration";
import { buildWriteUpRequest } from "../../helpers/noteWriteUp";
import { runBackgroundAction } from "../../stores/actionProcessingStore";
import { getSettings, selectResolvedNoteFormatting } from "../../stores/settingsStore";
import { isRegenerableNoteTitle } from "../../helpers/regenerableNoteTitle";
import { MEETING_TITLE_PLACEHOLDERS } from "../../utils/meetingNoteInput";
import { formatMeetingWindow } from "../../utils/meetingWindow";
import type { MeetingNeedingWriteUp } from "../../types/electron";

/**
 * Meetings that were recorded and never written up.
 *
 * This is a failure that is otherwise completely silent: a write-up can be
 * missing because no model was configured, because the request failed, or
 * because the app closed mid-generation — and in each case the recording just
 * sits in the library looking like every other note. The transcript is safe
 * the whole time, which is exactly why nobody notices.
 *
 * Generating runs through the same helpers the note editor's button uses, so
 * a write-up started here is the same write-up, with the same title guard.
 * When the cause was a missing model it fails the same way too — with the
 * error toast that carries a Configure button.
 */
export default function NeedsWriteUpCard({
  onOpenNote,
}: {
  onOpenNote?: (noteId: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const { meetings, total, isLoading } = useMeetingsNeedingWriteUp(true);
  const noteStates = useActionProcessingStore((s) => s.noteStates);
  const [starting, setStarting] = useState<number | null>(null);

  const generate = useCallback(
    async (meeting: MeetingNeedingWriteUp) => {
      setStarting(meeting.id);
      try {
        const note = await window.electronAPI?.getNote?.(meeting.id);
        if (!note) return;

        const request = buildWriteUpRequest(note.content ?? "", note.transcript ?? "", {
          you: t("notes.speaker.you"),
          them: t("notes.speaker.them"),
        });
        if (!request) return;

        const action = await getGenerateNotesAction();
        if (!action) return;

        runBackgroundAction(
          meeting.id,
          request.input,
          request.contentHash,
          action,
          {
            modelId: selectResolvedNoteFormatting(getSettings()).model,
            isMeetingNote: request.isMeetingNote,
            allowTitleGeneration: isRegenerableNoteTitle(
              note.title ?? "",
              MEETING_TITLE_PLACEHOLDERS.map((key) => t(key)),
              null
            ),
          },
          {
            // A missing model reports itself through this, which carries the
            // remedy that opens the right settings panel.
            noModel: t("notes.actions.errors.noModel"),
            noEndpoint: t("notes.actions.errors.noEndpoint"),
            actionFailed: t("notes.actions.errors.actionFailed"),
          }
        );
      } finally {
        setStarting(null);
      }
    },
    [t]
  );

  if (isLoading || total === 0) return null;

  return (
    <section className="mt-4 rounded-lg border border-border-subtle px-4 py-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("home.writeUp.title")}
        </h2>
        <span className="text-[11px] text-muted-foreground/60">{total}</span>
      </div>
      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
        {t("home.writeUp.description")}
      </p>

      <ul className="mt-2 space-y-px">
        {meetings.map((meeting) => {
          const isRunning = noteStates[meeting.id]?.status === "processing";
          const isStarting = starting === meeting.id;
          const ran = formatMeetingWindow(meeting, i18n.language);

          return (
            <li
              key={meeting.id}
              className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-foreground/4"
            >
              <FileText size={13} className="shrink-0 text-muted-foreground/50" />
              <button
                type="button"
                onClick={() => onOpenNote?.(meeting.id)}
                className="min-w-0 flex-1 truncate rounded-sm text-left text-xs text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                {meeting.title?.trim() || t("notes.list.untitledNote")}
              </button>
              {ran && (
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
                  {ran.approximate ? `~${ran.text}` : ran.text}
                </span>
              )}
              <Button
                variant="outline-flat"
                size="sm"
                className="h-6 shrink-0 px-2 text-[11px]"
                disabled={isRunning || isStarting}
                onClick={() => generate(meeting)}
              >
                {isRunning || isStarting ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  t("home.writeUp.action")
                )}
              </Button>
            </li>
          );
        })}
      </ul>

      {total > meetings.length && (
        <p className="mt-2 text-[11px] text-muted-foreground/70">
          {t("home.writeUp.more", { count: total - meetings.length })}
        </p>
      )}
    </section>
  );
}
