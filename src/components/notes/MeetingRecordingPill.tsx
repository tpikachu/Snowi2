import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Square } from "lucide-react";
import { stopRecording, useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import { cn } from "../lib/utils";
import { isControlPanelWindow } from "../../utils/windowContext";
import { formatMmSs } from "../../utils/formatDuration";

interface MeetingRecordingPillProps {
  activeView: string;
  activeNoteId: number | null;
  onReturnToNote: () => void;
}

/* The floating twin of the dictation HUD: same capsule geometry, same
 * centre-weighted meter, same tabular clock, same always-dark ground. It
 * follows the toast convention rather than the app theme because it is a
 * status object floating over the workspace, not part of it. */

const BAR_COUNT = 5;
// Centre bars lead so the stack reads as a level, not a progress bar.
const BAR_WEIGHTS = [0.58, 0.84, 1, 0.84, 0.58];
const BAR_FLOOR = 0.2;
const METER_HEIGHT_PX = 14;

const truncateTitle = (title: string) =>
  title.length > 24 ? `${title.slice(0, 23).trimEnd()}…` : title;

const computeBarHeight = (level: number, index: number) => {
  // sqrt curve maps small RMS values (typical speech ~0.05-0.1) into a visible
  // range — linear scaling kept the bars clamped at the floor.
  const scaled = Math.sqrt(level) * 2.4 * BAR_WEIGHTS[index];
  return `${(METER_HEIGHT_PX * Math.max(BAR_FLOOR, Math.min(1, scaled))).toFixed(2)}px`;
};

export default function MeetingRecordingPill({
  activeView,
  activeNoteId,
  onReturnToNote,
}: MeetingRecordingPillProps) {
  const { t } = useTranslation();
  const isRecording = useMeetingRecordingStore((s) => s.isRecording);
  const recordingNoteId = useMeetingRecordingStore((s) => s.recordingNoteId);
  const recordingNoteTitle = useMeetingRecordingStore((s) => s.recordingNoteTitle);
  const micLevel = useMeetingRecordingStore((s) => s.currentMicLevel);
  const micCaptureStatus = useMeetingRecordingStore((s) => s.micCaptureStatus);
  const isWaitingForMic = micCaptureStatus === "reconnecting" || micCaptureStatus === "unavailable";
  const [isStopping, setIsStopping] = useState(false);

  // Anchored on the recording transition, not on mount: this pill only renders
  // while the user is away from the recording note, so a mount-time start
  // would restart the clock every time they navigate.
  const startedAtRef = useRef<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isRecording) {
      startedAtRef.current = null;
      setElapsedSeconds(0);
      return undefined;
    }
    if (startedAtRef.current == null) startedAtRef.current = Date.now();
    const update = () =>
      setElapsedSeconds(Math.floor((Date.now() - (startedAtRef.current ?? Date.now())) / 1000));
    update();
    const intervalId = setInterval(update, 250);
    return () => clearInterval(intervalId);
  }, [isRecording]);

  const isViewingRecordingNote =
    activeView === "personal-notes" && activeNoteId === recordingNoteId;

  if (!isRecording || isViewingRecordingNote || !isControlPanelWindow()) {
    return null;
  }

  const handleStop = async () => {
    if (isStopping) return;
    setIsStopping(true);
    try {
      await stopRecording();
    } finally {
      setIsStopping(false);
    }
  };

  const title = truncateTitle(recordingNoteTitle ?? "");
  const returnLabel = t("notes.meetingPill.returnToNote");
  const stopLabel = t("notes.editor.stop");
  const elapsedLabel = formatMmSs(elapsedSeconds);

  return createPortal(
    <div
      className="fixed top-2 left-1/2 -translate-x-1/2 z-30"
      style={
        {
          WebkitAppRegion: "no-drag",
          animation: "grow-to-bar 0.45s cubic-bezier(0.22, 1, 0.36, 1) both",
        } as React.CSSProperties
      }
    >
      <div
        className={cn(
          "hud-surface flex h-9 items-center gap-2 rounded-[11px] pl-2 pr-1.5",
          isWaitingForMic ? "hud-surface-warn" : "hud-surface-live"
        )}
      >
        <button
          type="button"
          onClick={onReturnToNote}
          aria-label={returnLabel}
          title={returnLabel}
          className={cn(
            "-mx-1 flex items-center gap-2 rounded-md px-1 py-1",
            "transition-colors duration-150",
            "hover:bg-white/6 active:bg-white/10",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-accent/70"
          )}
        >
          <span
            className="flex shrink-0 items-end gap-[2px]"
            style={{ height: METER_HEIGHT_PX }}
            aria-hidden="true"
          >
            {Array.from({ length: BAR_COUNT }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "w-[2px] rounded-full",
                  isWaitingForMic ? "bg-hud-warning" : "bg-hud-accent"
                )}
                style={{ height: computeBarHeight(isWaitingForMic ? 0 : micLevel, i) }}
              />
            ))}
          </span>
          <span className="max-w-[14rem] truncate text-xs font-medium text-hud-foreground">
            {isWaitingForMic ? t("notes.meetingPill.waitingForMicrophone") : title}
          </span>
          <span
            data-numeric
            className={cn(
              "text-[11px] font-semibold leading-none tracking-[0.01em]",
              isWaitingForMic ? "text-hud-warning" : "text-hud-muted"
            )}
          >
            {elapsedLabel}
          </span>
        </button>

        <span className="h-4 w-px shrink-0 bg-hud-border" aria-hidden="true" />

        <button
          type="button"
          onClick={handleStop}
          disabled={isStopping}
          aria-label={stopLabel}
          title={stopLabel}
          className={cn(
            "flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2",
            "text-[11px] font-medium transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-accent/70",
            isStopping
              ? "cursor-not-allowed bg-white/4 text-hud-muted/50"
              : "bg-hud-danger/15 text-hud-danger hover:bg-hud-danger/25"
          )}
        >
          <Square size={9} fill="currentColor" />
          {stopLabel}
        </button>
      </div>
    </div>,
    document.body
  );
}
