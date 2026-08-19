import { useEffect, useRef, useState } from "react";
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
import { autoGenerateMeetingNotes } from "../helpers/meetingNoteGeneration";
import { generateMeetingMemory } from "../helpers/memoryGeneration";
import { MEETING_TITLE_PLACEHOLDERS } from "../utils/meetingNoteInput";
import { configureToastProps } from "./ui/configureToastProps";
import { transcriptionRemedy } from "../config/settingsRemedies";

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
  const [isGenerating, setIsGenerating] = useState(false);

  const noteId = pendingStop?.noteId ?? null;
  const hasContent = pendingStop?.hasContent ?? false;

  useEffect(() => {
    if (noteId == null || !hasContent) return;
    // Started while the prompt is up rather than after Save, so the notes are
    // usually written by the time the user has finished deciding. Discarding
    // cancels it — see resolvePendingStop.
    let cancelled = false;
    void autoGenerateMeetingNotes({
      noteId,
      noteTitle: pendingStop?.noteTitle ?? null,
      segments: pendingStop?.segments ?? [],
      speakerLabels: { you: t("notes.speaker.you"), them: t("notes.speaker.them") },
      titlePlaceholders: MEETING_TITLE_PLACEHOLDERS.map((key) => t(key)),
      labels: {
        noModel: t("notes.actions.errors.noModel"),
        noEndpoint: t("notes.actions.errors.noEndpoint"),
        actionFailed: t("notes.actions.errors.actionFailed"),
      },
    }).then((started) => {
      if (!cancelled) setIsGenerating(started);
    });

    // Memory extraction rides the same trigger but is not tied to the note
    // result: it reads segments back from the database (so the ids it cites are
    // the ones a citation resolves against), and a meeting should still yield
    // its commitments when note generation is off or fails. Silent by design —
    // nothing about it is worth interrupting the stop dialog for.
    void generateMeetingMemory({
      noteId,
      speakerLabels: { you: t("notes.speaker.you"), them: t("notes.speaker.them") },
    });

    return () => {
      cancelled = true;
    };
    // Deliberately keyed on the note alone: this must fire once per stop, not
    // again every time a translation function identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, hasContent]);

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
          : [
              t("notes.meeting.stopDialog.description", {
                title: pendingStop.noteTitle || t("notes.meeting.stopDialog.untitled"),
              }),
              isGenerating ? t("notes.meeting.stopDialog.generating") : "",
            ]
              .filter(Boolean)
              .join(" ")
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
  const { toast, dismiss } = useToast();
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
    // A meeting that failed because transcription was never set up cannot be
    // retried into working, so that toast carries the trip to the setting.
    const remedy = transcriptionRemedy("meeting", { message: error });
    let toastId = "";
    toastId = toast({
      title: t("notes.meeting.title"),
      description: MEETING_ERROR_KEYS[error] ? t(MEETING_ERROR_KEYS[error]) : error,
      variant: "destructive",
      ...configureToastProps(remedy, () => {
        if (toastId) dismiss(toastId);
      }),
    });
    // errorNonce re-fires this toast when the same error repeats back-to-back.
  }, [error, errorNonce, toast, dismiss, t]);

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
