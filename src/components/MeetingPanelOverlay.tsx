import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Pause, Play, Square } from "lucide-react";
import {
  capturedMsAt,
  type MeetingPanelSnapshot,
} from "../utils/meetingPanelSnapshot";
import type { MeetingPanelCommand } from "../types/electron";
import { formatMmSs } from "../utils/formatDuration";
import { cn } from "./lib/utils";

/**
 * The meeting panel: a floating status bar that stays with the user while they
 * are in the meeting rather than in Snowi.
 *
 * It is a view, not a controller — the capture graph lives in the control
 * panel's renderer, so this window renders published snapshots and sends
 * commands back. Anything it can do, the in-app controls can do too, and both
 * go through the same store functions.
 *
 * Visually it is the dictation HUD's language reused wholesale: same capsule,
 * same centre-weighted meter, same tabular clock, same always-dark ground. It
 * follows that convention rather than the app theme because it floats over
 * someone else's window, not inside ours.
 */

const BAR_COUNT = 5;
const BAR_WEIGHTS = [0.58, 0.84, 1, 0.84, 0.58];
const BAR_FLOOR = 0.2;
const METER_HEIGHT_PX = 14;
const CLOCK_INTERVAL_MS = 250;

const computeBarHeight = (level: number, index: number) => {
  const scaled = Math.sqrt(level) * 2.4 * BAR_WEIGHTS[index];
  return `${(METER_HEIGHT_PX * Math.max(BAR_FLOOR, Math.min(1, scaled))).toFixed(2)}px`;
};

const truncateTitle = (title: string) =>
  title.length > 28 ? `${title.slice(0, 27).trimEnd()}…` : title;

export default function MeetingPanelOverlay() {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<MeetingPanelSnapshot | null>(null);
  const [level, setLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    // The window loads after the meeting has already started, so the state it
    // missed is fetched once rather than waited for.
    void window.electronAPI?.meetingPanelGetState?.().then((initial) => {
      if (initial) setSnapshot(initial);
    });

    const unbindState = window.electronAPI?.onMeetingPanelState?.(setSnapshot);
    const unbindLevel = window.electronAPI?.onMeetingPanelLevel?.(setLevel);
    return () => {
      unbindState?.();
      unbindLevel?.();
    };
  }, []);

  useEffect(() => {
    if (!snapshot) return undefined;
    // Read from the snapshot's own timestamp on every tick rather than counted
    // up locally: this window is hidden whenever the control panel has focus,
    // and a clock built from ticks would lose exactly that time.
    const update = () => setElapsedMs(capturedMsAt(snapshot, Date.now()));
    update();
    if (snapshot.isPaused) return undefined;
    const intervalId = setInterval(update, CLOCK_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [snapshot]);

  const send = useCallback(async (command: MeetingPanelCommand) => {
    setIsBusy(true);
    try {
      await window.electronAPI?.meetingPanelCommand?.(command);
    } finally {
      setIsBusy(false);
    }
  }, []);

  if (!snapshot?.isRecording) return null;

  const isPaused = snapshot.isPaused;
  const isWaitingForMic =
    !isPaused &&
    (snapshot.micStatus === "reconnecting" || snapshot.micStatus === "unavailable");

  const title = truncateTitle(snapshot.title ?? t("notes.meeting.stopDialog.untitled"));
  const pauseLabel = isPaused ? t("notes.meeting.resume") : t("notes.meeting.pause");
  const stopLabel = t("notes.editor.stop");
  const openLabel = t("notes.meetingPanel.openNote");

  // Says what is actually being captured. A meeting running on system audio
  // alone after the microphone dropped should not still claim a microphone.
  const sourceLabel = isPaused
    ? t("notes.meetingPanel.sources.paused")
    : isWaitingForMic
      ? snapshot.systemAudio
        ? t("notes.meetingPanel.sources.systemOnly")
        : t("notes.meetingPanel.sources.noMic")
      : snapshot.systemAudio
        ? t("notes.meetingPanel.sources.both")
        : t("notes.meetingPanel.sources.micOnly");

  return (
    <div
      className="meeting-panel-window flex h-full w-full items-center bg-transparent p-1"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div
        className={cn(
          "hud-surface flex h-full w-full items-center gap-2 rounded-[13px] pl-2.5 pr-1.5",
          isPaused ? "hud-surface" : isWaitingForMic ? "hud-surface-warn" : "hud-surface-live"
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
                "w-[2px] rounded-full transition-[height] duration-75",
                isPaused ? "bg-hud-muted" : isWaitingForMic ? "bg-hud-warning" : "bg-hud-accent"
              )}
              style={{ height: computeBarHeight(isPaused || isWaitingForMic ? 0 : level, i) }}
            />
          ))}
        </span>

        <span className="flex min-w-0 flex-1 flex-col justify-center gap-px">
          <span className="truncate text-xs font-medium leading-tight text-hud-foreground">
            {isPaused ? t("notes.meeting.pausedWithTitle", { title }) : title}
          </span>
          <span
            className={cn(
              "truncate text-[10px] leading-tight",
              isWaitingForMic ? "text-hud-warning" : "text-hud-muted"
            )}
          >
            {isWaitingForMic ? t("notes.meetingPill.waitingForMicrophone") : sourceLabel}
          </span>
        </span>

        <span
          data-numeric
          className={cn(
            "shrink-0 text-[11px] font-semibold leading-none tracking-[0.01em]",
            isWaitingForMic ? "text-hud-warning" : "text-hud-muted"
          )}
        >
          {formatMmSs(Math.floor(elapsedMs / 1000))}
        </span>

        <span className="h-4 w-px shrink-0 bg-hud-border" aria-hidden="true" />

        <span
          className="flex shrink-0 items-center gap-1"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <button
            type="button"
            onClick={() => void send("open")}
            aria-label={openLabel}
            title={openLabel}
            className={cn(
              "flex size-6 items-center justify-center rounded-md",
              "text-hud-muted transition-colors duration-150",
              "hover:bg-white/10 hover:text-hud-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-accent/70"
            )}
          >
            <ExternalLink size={11} />
          </button>

          <button
            type="button"
            onClick={() => void send(isPaused ? "resume" : "pause")}
            disabled={isBusy}
            aria-label={pauseLabel}
            title={pauseLabel}
            className={cn(
              "flex size-6 items-center justify-center rounded-md",
              "text-hud-muted transition-colors duration-150",
              "hover:bg-white/10 hover:text-hud-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-accent/70",
              "disabled:opacity-50"
            )}
          >
            {isPaused ? (
              <Play size={11} fill="currentColor" />
            ) : (
              <Pause size={11} fill="currentColor" />
            )}
          </button>

          <button
            type="button"
            onClick={() => void send("stop")}
            disabled={isBusy}
            aria-label={stopLabel}
            title={stopLabel}
            className={cn(
              "flex h-7 items-center justify-center gap-1.5 rounded-lg px-2",
              "text-[11px] font-medium transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-accent/70",
              "bg-hud-danger/15 text-hud-danger hover:bg-hud-danger/25",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            <Square size={9} fill="currentColor" />
            {stopLabel}
          </button>
        </span>
      </div>
    </div>
  );
}
