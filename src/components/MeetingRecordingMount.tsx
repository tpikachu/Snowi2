import { useCallback, useEffect, useRef } from "react";
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
import { useMeetingAssist } from "../hooks/useMeetingAssist";
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

  /**
   * Write the notes, once the user has said to keep the meeting.
   *
   * This used to start the moment the prompt appeared, on the theory that the
   * notes would be ready by the time the user finished deciding. That traded
   * away the wrong thing: it spends an inference call — real money on a BYOK
   * key — on a meeting the user may be about to discard, and it sends the
   * transcript of that meeting to a model after they have decided they do not
   * want it kept. Discard has to mean nothing happened.
   *
   * Everything is read out of `pendingStop` before `resolvePendingStop` clears
   * it, so the work runs against the values this dialog was showing rather
   * than against state that has already moved on.
   */
  const keepMeeting = useCallback(() => {
    const pending = useMeetingRecordingStore.getState().pendingStop;
    void resolvePendingStop(true);

    if (!pending || pending.noteId == null || !pending.hasContent) return;
    const noteId = pending.noteId;
    const speakerLabels = { you: t("notes.speaker.you"), them: t("notes.speaker.them") };

    void autoGenerateMeetingNotes({
      noteId,
      noteTitle: pending.noteTitle ?? null,
      segments: pending.segments ?? [],
      speakerLabels,
      titlePlaceholders: MEETING_TITLE_PLACEHOLDERS.map((key) => t(key)),
      labels: {
        noModel: t("notes.actions.errors.noModel"),
        noEndpoint: t("notes.actions.errors.noEndpoint"),
        actionFailed: t("notes.actions.errors.actionFailed"),
      },
    });

    // Memory extraction rides the same trigger but is not tied to the note
    // result: it reads segments back from the database (so the ids it cites are
    // the ones a citation resolves against), and a meeting should still yield
    // its commitments when note generation is off or fails.
    void generateMeetingMemory({ noteId, speakerLabels });
  }, [t]);

  if (!pendingStop) return null;

  const isEmpty = !pendingStop.hasContent;

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        // Dismissing without choosing keeps the meeting: the safe answer. It
        // goes through the same path as Save, so a dismissed prompt still
        // produces the notes a kept meeting is supposed to have.
        if (!open && useMeetingRecordingStore.getState().pendingStop) keepMeeting();
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
      onConfirm={keepMeeting}
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

  // The assistant runs here, not in the panel: this is the renderer that owns
  // the capture graph and the model clients, so a question typed in the panel
  // and one asked in-app go through one implementation.
  const assist = useMeetingAssist();
  useMeetingPanelBridge({ onAsk: (question) => void assist.ask(question) });

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
