import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "./ui/useToast";
import {
  discardMeetingPreRoll,
  getMicAnalyser,
  primeMeetingWorklet,
  resolvePendingStop,
  startMeetingPreRoll,
  useMeetingRecordingStore,
} from "../stores/meetingRecordingStore";
import { ConfirmDialog } from "./ui/dialog";
import { useMeetingPanelBridge } from "../hooks/useMeetingPanelBridge";

const EMA_PREV = 0.5;
const EMA_NEXT = 0.5;
// The floating panel's meter is fed from the same analyser as the in-app one,
// but at a rate a process boundary can carry: a level is only worth sending as
// often as the eye can read it.
const PANEL_LEVEL_INTERVAL_MS = 80;

// Sentinel errors set by meetingRecordingStore, translated at display time.
const MEETING_ERROR_KEYS: Record<string, string> = {};

/**
 * The keep-or-discard prompt shown after Stop.
 *
 * Lives here, on the single global mount, rather than beside either Stop
 * button: the pill and the note's own bottom bar can both end a meeting, and
 * two dialogs racing to describe the same stop is worse than one.
 *
 * Save is the confirm action even when nothing was recorded, so the keyboard
 * default can never be the destructive one — a stray Enter must not delete a
 * meeting.
 */
function MeetingStopDialog() {
  const { t } = useTranslation();
  const pendingStop = useMeetingRecordingStore((s) => s.pendingStop);

  if (!pendingStop) return null;

  const isEmpty = !pendingStop.hasContent;

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        // Dismissing without choosing keeps the meeting: the safe answer.
        if (!open && useMeetingRecordingStore.getState().pendingStop) void resolvePendingStop(true);
      }}
      title={
        isEmpty ? t("notes.meeting.stopDialog.titleEmpty") : t("notes.meeting.stopDialog.title")
      }
      description={
        isEmpty
          ? t("notes.meeting.stopDialog.descriptionEmpty")
          : t("notes.meeting.stopDialog.description", {
              title: pendingStop.noteTitle || t("notes.meeting.stopDialog.untitled"),
            })
      }
      confirmText={t("notes.meeting.stopDialog.save")}
      cancelText={t("notes.meeting.stopDialog.discard")}
      onConfirm={() => void resolvePendingStop(true)}
      onCancel={() => void resolvePendingStop(false)}
    />
  );
}

export default function MeetingRecordingMount() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const isRecording = useMeetingRecordingStore((s) => s.isRecording);
  const error = useMeetingRecordingStore((s) => s.error);
  const errorNonce = useMeetingRecordingStore((s) => s.errorNonce);
  const micCaptureStatus = useMeetingRecordingStore((s) => s.micCaptureStatus);
  const wasMicUnavailable = useRef(false);

  useMeetingPanelBridge();

  useEffect(() => {
    primeMeetingWorklet();
  }, []);

  useEffect(() => {
    const unbind = window.electronAPI?.onMeetingPreRoll?.((action) => {
      if (action === "start") void startMeetingPreRoll();
      else discardMeetingPreRoll();
    });
    return () => {
      unbind?.();
      // The renderer going away must release the microphone and destroy the
      // buffer; nothing else is holding either.
      discardMeetingPreRoll();
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    toast({
      title: t("notes.meeting.title"),
      description: MEETING_ERROR_KEYS[error] ? t(MEETING_ERROR_KEYS[error]) : error,
      variant: "destructive",
    });
    // errorNonce re-fires this toast when the same error repeats back-to-back.
  }, [error, errorNonce, toast, t]);

  useEffect(() => {
    if (micCaptureStatus === "unavailable" && !wasMicUnavailable.current) {
      wasMicUnavailable.current = true;
      toast({
        title: t("hooks.audioRecording.micDisconnected.title"),
        description: t("hooks.audioRecording.micDisconnected.meetingDescription"),
        variant: "default",
      });
    } else if (micCaptureStatus === "active" && wasMicUnavailable.current) {
      wasMicUnavailable.current = false;
      toast({
        title: t("hooks.audioRecording.micRestored.title"),
        description: t("hooks.audioRecording.micRestored.description"),
        variant: "default",
      });
    } else if (micCaptureStatus === "inactive") {
      wasMicUnavailable.current = false;
    }
  }, [micCaptureStatus, toast, t]);

  useEffect(() => {
    if (!isRecording) return;

    let rafId = 0;
    let smoothed = 0;
    let buf = new Float32Array(256);
    let lastPanelLevelAt = 0;

    const tick = () => {
      const analyser = getMicAnalyser();
      if (analyser) {
        if (buf.length !== analyser.fftSize) {
          buf = new Float32Array(analyser.fftSize);
        }
        analyser.getFloatTimeDomainData(buf);
        let sumSquares = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = buf[i];
          sumSquares += v * v;
        }
        const rms = Math.sqrt(sumSquares / buf.length);
        smoothed = EMA_PREV * smoothed + EMA_NEXT * rms;
        const clamped = smoothed < 0 ? 0 : smoothed > 1 ? 1 : smoothed;
        useMeetingRecordingStore.setState({ currentMicLevel: clamped });

        const now = performance.now();
        if (now - lastPanelLevelAt >= PANEL_LEVEL_INTERVAL_MS) {
          lastPanelLevelAt = now;
          window.electronAPI?.meetingPanelLevel?.(clamped);
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      useMeetingRecordingStore.setState({ currentMicLevel: 0 });
      // Otherwise the panel's meter would hold whatever the last frame showed.
      window.electronAPI?.meetingPanelLevel?.(0);
    };
  }, [isRecording]);

  return <MeetingStopDialog />;
}
