import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Play, Square, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { formatMmSs } from "../../utils/formatDuration";

const BAR_COUNT = 5;

interface MeetingRecordControlProps {
  isRecording: boolean;
  isProcessing: boolean;
  /** The stored transcript parses, so another session can land in this note. */
  canResume: boolean;
  onStart: () => void;
  onStop: () => void;
}

/**
 * The note's one recording control, FIRST in the header's action row
 * (client direction, 2026-09-23 — it sat in the chat bar, where it read as
 * part of asking, then after the view switch as a grey ghost that read as
 * one option among six). Idle on a meeting note it is "Resume meeting" in
 * the accent with a play glyph — the same tone the recording pill wears, so
 * the slot keeps its meaning across states; while a session records it is
 * the elapsed clock and Stop; while the stop is being processed it waits.
 * Nothing renders on a note that cannot record.
 */
export default function MeetingRecordControl({
  isRecording,
  isProcessing,
  canResume,
  onStart,
  onStop,
}: MeetingRecordControlProps) {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isRecording) {
      setElapsed(0);
      return;
    }
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isRecording]);

  if (isRecording) {
    return (
      <button
        type="button"
        onClick={onStop}
        aria-label={t("notes.editor.stop")}
        className={cn(
          "flex h-7 shrink-0 items-center gap-2 rounded-lg pl-2.5 pr-2",
          "border border-primary/30 bg-primary-subtle text-primary",
          "transition-colors duration-150 hover:border-primary/50",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
      >
        <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
          {Array.from({ length: BAR_COUNT }, (_, i) => (
            <span
              key={i}
              className="h-full w-[2px] origin-bottom rounded-full bg-primary"
              style={{
                animation: `waveform-bar ${0.5 + i * 0.07}s ease-in-out infinite`,
                animationDelay: `${i * 0.04}s`,
              }}
            />
          ))}
        </span>
        <span data-numeric className="text-[11px] font-semibold tracking-[0.01em]">
          {formatMmSs(elapsed)}
        </span>
        <span className="h-3.5 w-px bg-primary/25" aria-hidden="true" />
        <Square size={9} fill="currentColor" />
      </button>
    );
  }

  if (isProcessing) {
    return (
      <span
        aria-label={t("notes.editor.processing")}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-input text-muted-foreground"
      >
        <Loader2 size={12} className="animate-spin" />
      </span>
    );
  }

  if (!canResume) return null;

  return (
    <button
      type="button"
      onClick={onStart}
      title={t("notes.editor.resumeMeetingHint")}
      className={cn(
        "flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5",
        "border border-primary/30 bg-primary-subtle text-[11px] font-medium text-primary",
        "transition-colors duration-150 hover:border-primary/50",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <Play size={10} fill="currentColor" />
      {t("notes.editor.resumeMeeting")}
    </button>
  );
}
