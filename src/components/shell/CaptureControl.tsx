import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CalendarClock, Loader2, Mic, Square } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../lib/utils";
import { formatMmSs } from "../../utils/formatDuration";
import { formatHotkeyLabel } from "../../utils/hotkeys";
import {
  stopRecording as stopMeetingRecording,
  useMeetingRecordingStore,
} from "../../stores/meetingRecordingStore";
import {
  requestDictationToggle,
  useDictationCaptureState,
  useDictationHotkeyStatus,
} from "./captureBridge";

/**
 * The shell's primary capture control.
 *
 * Lives in the content header so it is on screen in every section without
 * navigating, and away from the window controls on the opposite edge. The
 * header is a drag strip, so the whole control opts out with `no-drag`.
 *
 * It never starts a second capture: while either pipeline is live the two start
 * buttons are replaced by that capture's own live row, which is the only way to
 * stop it from here.
 */

/** Shared elapsed clock. `anchor` wins when the owner knows the real start. */
function useElapsedSeconds(active: boolean, anchor?: number | null): number {
  const startedAtRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) {
      startedAtRef.current = null;
      setElapsed(0);
      return undefined;
    }
    if (anchor != null) startedAtRef.current = anchor;
    else if (startedAtRef.current == null) startedAtRef.current = Date.now();

    const tick = () =>
      setElapsed(
        Math.max(0, Math.floor((Date.now() - (startedAtRef.current ?? Date.now())) / 1000))
      );
    tick();
    const intervalId = setInterval(tick, 250);
    return () => clearInterval(intervalId);
  }, [active, anchor]);

  return elapsed;
}

const capsuleClass = "flex h-7 items-center gap-2 rounded-md border pl-2 pr-1";

const capsuleActionClass = [
  "inline-flex h-5 shrink-0 items-center gap-1 rounded-sm px-1.5 text-[11px] font-medium",
  "outline-none transition-colors duration-150 ease-snap",
  "focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
].join(" ");

function LiveDot({ tone }: { tone: "danger" | "primary" }) {
  return (
    <span className="relative flex size-2 shrink-0" aria-hidden="true">
      <span
        className={cn(
          "absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:hidden",
          tone === "danger" ? "bg-destructive" : "bg-primary"
        )}
      />
      <span
        className={cn(
          "relative inline-flex size-2 rounded-full",
          tone === "danger" ? "bg-destructive" : "bg-primary"
        )}
      />
    </span>
  );
}

function ElapsedTime({ seconds, className }: { seconds: number; className?: string }) {
  return (
    <span className={cn("tabular-figures text-[11px] leading-none", className)}>
      {formatMmSs(seconds)}
    </span>
  );
}

export interface CaptureControlProps {
  /** Creates (or opens) a meeting note and starts mic + system capture. */
  onStartMeeting: () => void;
  /** The meeting note is being created — both start actions stay blocked. */
  isStartingMeeting: boolean;
  /** Jump back to the note the live meeting is being written into. */
  onOpenMeetingNote: () => void;
}

export default function CaptureControl({
  onStartMeeting,
  isStartingMeeting,
  onOpenMeetingNote,
}: CaptureControlProps) {
  const { t } = useTranslation();
  const dictation = useDictationCaptureState();
  const { isResolving, isRegistered, hotkey } = useDictationHotkeyStatus();
  const isMeetingRecording = useMeetingRecordingStore((s) => s.isRecording);
  const isMeetingTranscribing = useMeetingRecordingStore((s) => s.isTranscribing);
  const meetingMicStatus = useMeetingRecordingStore((s) => s.micCaptureStatus);
  const [isStoppingMeeting, setIsStoppingMeeting] = useState(false);
  const [isTogglingDictation, setIsTogglingDictation] = useState(false);

  const isMeetingBusy = isMeetingRecording || isMeetingTranscribing;
  const isDictationBusy = dictation.isRecording || dictation.isProcessing;
  const isBusy = isMeetingBusy || isDictationBusy || isStartingMeeting;

  const dictationElapsed = useElapsedSeconds(dictation.isRecording, dictation.startedAt);
  const meetingElapsed = useElapsedSeconds(isMeetingRecording);

  const toggleDictation = useCallback(async () => {
    if (isTogglingDictation) return;
    setIsTogglingDictation(true);
    try {
      await requestDictationToggle();
    } finally {
      setIsTogglingDictation(false);
    }
  }, [isTogglingDictation]);

  const handleStartDictation = useCallback(() => {
    if (isBusy) return;
    void toggleDictation();
  }, [isBusy, toggleDictation]);

  const handleStopDictation = useCallback(() => {
    if (!dictation.isRecording) return;
    void toggleDictation();
  }, [dictation.isRecording, toggleDictation]);

  const handleStopMeeting = useCallback(async () => {
    if (isStoppingMeeting) return;
    setIsStoppingMeeting(true);
    try {
      await stopMeetingRecording();
    } finally {
      setIsStoppingMeeting(false);
    }
  }, [isStoppingMeeting]);

  const wrapperStyle = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

  // ---- Live meeting -------------------------------------------------------
  if (isMeetingBusy) {
    const isWaitingForMic =
      meetingMicStatus === "reconnecting" || meetingMicStatus === "unavailable";
    const statusLabel = !isMeetingRecording
      ? t("capture.status.finishing")
      : isWaitingForMic
        ? t("notes.meetingPill.waitingForMicrophone")
        : t("capture.status.meetingRecording");

    return (
      <div
        className={cn(capsuleClass, "border-primary/30 bg-primary-subtle")}
        style={wrapperStyle}
        role="group"
        aria-label={t("capture.status.meetingRecording")}
      >
        {isMeetingRecording ? (
          <LiveDot tone="primary" />
        ) : (
          <Loader2 size={12} className="shrink-0 animate-spin text-primary" aria-hidden="true" />
        )}
        <span className="text-xs font-medium text-foreground" aria-live="polite">
          {statusLabel}
        </span>
        {isMeetingRecording && (
          <ElapsedTime seconds={meetingElapsed} className="text-muted-foreground" />
        )}
        <button
          type="button"
          onClick={onOpenMeetingNote}
          className={cn(
            capsuleActionClass,
            "text-muted-foreground hover:bg-surface-3 hover:text-foreground"
          )}
        >
          {t("capture.openNote")}
        </button>
        {isMeetingRecording && (
          <button
            type="button"
            onClick={handleStopMeeting}
            disabled={isStoppingMeeting}
            className={cn(
              capsuleActionClass,
              "bg-destructive-subtle text-destructive hover:bg-destructive/20"
            )}
          >
            <Square size={8} fill="currentColor" aria-hidden="true" />
            {t("notes.editor.stop")}
          </button>
        )}
      </div>
    );
  }

  // ---- Live dictation -----------------------------------------------------
  if (isDictationBusy) {
    return (
      <div
        className={cn(
          capsuleClass,
          dictation.isRecording
            ? "border-destructive/30 bg-destructive-subtle"
            : "border-border-subtle bg-surface-2"
        )}
        style={wrapperStyle}
        role="group"
        aria-label={t("capture.status.dictationRecording")}
      >
        {dictation.isRecording ? (
          <LiveDot tone="danger" />
        ) : (
          <Loader2
            size={12}
            className="shrink-0 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        )}
        <span className="text-xs font-medium text-foreground" aria-live="polite">
          {dictation.isRecording
            ? t("capture.status.dictationRecording")
            : t("capture.status.transcribing")}
        </span>
        {dictation.isRecording && (
          <>
            <ElapsedTime seconds={dictationElapsed} className="text-muted-foreground" />
            <button
              type="button"
              onClick={handleStopDictation}
              disabled={isTogglingDictation}
              className={cn(
                capsuleActionClass,
                "bg-destructive-subtle text-destructive hover:bg-destructive/20"
              )}
            >
              <Square size={8} fill="currentColor" aria-hidden="true" />
              {t("notes.editor.stop")}
            </button>
          </>
        )}
      </div>
    );
  }

  // ---- Idle ---------------------------------------------------------------
  const hotkeyLabel = hotkey ? formatHotkeyLabel(hotkey) : "";

  return (
    <div className="flex items-center gap-1.5" style={wrapperStyle}>
      <Button
        variant="default"
        size="sm"
        onClick={handleStartDictation}
        disabled={isBusy || isTogglingDictation}
        title={
          isRegistered
            ? t("capture.dictateHint", { hotkey: hotkeyLabel })
            : t("capture.dictateNoHotkeyHint")
        }
        className="h-7 gap-1.5 px-2.5 text-xs"
      >
        <Mic size={13} strokeWidth={2} aria-hidden="true" />
        {t("capture.dictate")}
        {isRegistered && hotkeyLabel && (
          <kbd className="ml-0.5 hidden rounded-sm bg-primary-foreground/20 px-1 py-px text-[10px] font-medium leading-[1.3] text-primary-foreground md:inline-block">
            {hotkeyLabel}
          </kbd>
        )}
      </Button>

      {!isResolving && !isRegistered && (
        <span
          title={t("capture.dictateNoHotkeyHint")}
          className="inline-flex h-5 items-center gap-1 rounded-sm border border-warning/30 bg-warning-subtle px-1.5 text-[10px] font-medium text-foreground"
        >
          <AlertTriangle size={10} className="shrink-0 text-warning" aria-hidden="true" />
          {t("capture.hotkeyMissing")}
        </span>
      )}

      <Button
        variant="outline-flat"
        size="sm"
        onClick={onStartMeeting}
        disabled={isBusy}
        title={t("capture.meetingHint")}
        className="h-7 gap-1.5 px-2.5 text-xs"
      >
        {isStartingMeeting ? (
          <Loader2 size={13} className="animate-spin" aria-hidden="true" />
        ) : (
          <CalendarClock size={13} strokeWidth={2} aria-hidden="true" />
        )}
        {t("capture.meeting")}
      </Button>
    </div>
  );
}
