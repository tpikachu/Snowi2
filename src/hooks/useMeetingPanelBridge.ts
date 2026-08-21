import { useEffect } from "react";
import {
  buildMeetingPanelSnapshot,
  snapshotsEqual,
  type MeetingPanelSnapshot,
} from "../utils/meetingPanelSnapshot";
import {
  pauseRecording,
  requestStopRecording,
  resumeRecording,
  useMeetingRecordingStore,
} from "../stores/meetingRecordingStore";
import {
  buildPanelTranscript,
  panelTranscriptsEqual,
  type PanelTranscript,
} from "../utils/meetingPanelTranscript";
import { isControlPanelWindow } from "../utils/windowContext";
import type { MeetingPanelCommand } from "../types/electron";
import logger from "../utils/logger";

/**
 * How often the transcript tail is rebuilt and, if it changed, sent.
 * Fast enough to read as live, slow enough that a streaming caption does not
 * cost one IPC round trip per word.
 */
const TRANSCRIPT_PUBLISH_MS = 250;

/**
 * Connects the meeting store to the floating panel, which lives in its own
 * renderer and so cannot read the store directly.
 *
 * Deliberately one-directional in the data and one-directional in the control:
 * state is published outwards, commands come back inwards and are applied by
 * the same store functions the in-app buttons call. The panel never gets to
 * drive the capture graph itself, so there is only one implementation of what
 * pause, resume and stop mean.
 */
export function useMeetingPanelBridge(): void {
  useEffect(() => {
    // The bridge belongs to whichever renderer owns the capture graph. The
    // panel's own window must never publish back to itself.
    if (!isControlPanelWindow()) return undefined;

    let lastPublished: MeetingPanelSnapshot | null = null;

    const publish = (force = false) => {
      const snapshot = buildMeetingPanelSnapshot(useMeetingRecordingStore.getState(), Date.now());
      if (!force && snapshotsEqual(lastPublished, snapshot)) return;
      lastPublished = snapshot;
      window.electronAPI?.meetingPanelPublish?.(snapshot);
    };

    // The transcript rides its own channel and its own clock. Publishing it
    // from the store subscription would cross the IPC boundary on every word
    // of every partial — several times a second once captions stream — and the
    // panel cannot render faster than this anyway.
    let lastTranscript: PanelTranscript | null = null;

    const publishTranscript = () => {
      const state = useMeetingRecordingStore.getState();
      const transcript = state.isRecording
        ? buildPanelTranscript(state)
        : { lines: [], hiddenCount: 0 };
      if (panelTranscriptsEqual(lastTranscript, transcript)) return;
      lastTranscript = transcript;
      window.electronAPI?.meetingPanelTranscript?.(transcript);
    };

    publish(true);
    publishTranscript();
    const unsubscribe = useMeetingRecordingStore.subscribe(() => publish());
    const transcriptTimer = setInterval(publishTranscript, TRANSCRIPT_PUBLISH_MS);

    const unbindCommand = window.electronAPI?.onMeetingPanelCommand?.(
      (command: MeetingPanelCommand) => {
        void (async () => {
          try {
            if (command === "pause") await pauseRecording();
            else if (command === "resume") await resumeRecording();
            else if (command === "stop") await requestStopRecording();
            // "open" only had to surface the control panel, which main did.
          } catch (err) {
            logger.error(
              "Meeting panel command failed",
              { command, error: (err as Error).message },
              "meeting"
            );
          }
        })();
      }
    );

    return () => {
      unsubscribe();
      clearInterval(transcriptTimer);
      unbindCommand?.();
      // Tells main the meeting is no longer being published, so the panel does
      // not outlive the renderer that was driving it.
      window.electronAPI?.meetingPanelPublish?.(null);
    };
  }, []);
}
