import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ExternalLink,
  Lightbulb,
  MessageSquareText,
  Pause,
  Play,
  SendHorizontal,
  Square,
} from "lucide-react";
import { capturedMsAt, type MeetingPanelSnapshot } from "../utils/meetingPanelSnapshot";
import type { PanelTranscript } from "../utils/meetingPanelTranscript";
import type { MeetingPanelCommand } from "../types/electron";
import { formatMmSs } from "../utils/formatDuration";
import { cn } from "./lib/utils";

/**
 * The meeting panel: where the meeting happens.
 *
 * It used to be a status bar, back when the meeting itself lived in the main
 * window. Now the main window minimises when a meeting starts and this is the
 * surface — a suggestion the assistant has already prepared, a small live
 * transcript, and a question box.
 *
 * The three sections are sized by how much attention each deserves, which is
 * not how much space they would naturally want. The suggestion is at the top,
 * carrying the accent, because it is the thing worth glancing at mid sentence.
 * The transcript is capped at about five lines and never grows: it is there to
 * confirm the meeting is being heard, not to be read — anyone reading a
 * transcript during a call has stopped attending to the call. Every remaining
 * pixel goes to the assistant, which is the reason to keep the panel open.
 *
 * Still a view, not a controller. The capture graph lives in the control
 * panel's renderer; this window renders published state and sends commands
 * back, so pause, resume and stop have one implementation.
 *
 * Always-dark on purpose, like the dictation HUD: it floats over someone
 * else's window, not inside ours.
 */

const BAR_COUNT = 5;
const BAR_WEIGHTS = [0.58, 0.84, 1, 0.84, 0.58];
const BAR_FLOOR = 0.2;
const METER_HEIGHT_PX = 14;
const CLOCK_INTERVAL_MS = 250;

/** Below this the window is a bar again, and the panes are not worth drawing. */
const COMPACT_HEIGHT_PX = 140;

/**
 * The transcript is capped at about five lines and never grows.
 *
 * It is here to show the meeting is being heard, not to be read — anyone
 * reading a transcript during a call has stopped listening to the call. Giving
 * it the leftover space, as a `flex-1` pane would, makes the least useful part
 * of this window the biggest part of it. The room goes to the assistant
 * instead, which is the reason to have the panel open at all.
 */
const TRANSCRIPT_MAX_HEIGHT_PX = 92;

const computeBarHeight = (level: number, index: number) => {
  const scaled = Math.sqrt(level) * 2.4 * BAR_WEIGHTS[index];
  return `${(METER_HEIGHT_PX * Math.max(BAR_FLOOR, Math.min(1, scaled))).toFixed(2)}px`;
};

const truncateTitle = (title: string) =>
  title.length > 28 ? `${title.slice(0, 27).trimEnd()}…` : title;

export default function MeetingPanelOverlay() {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<MeetingPanelSnapshot | null>(null);
  const [transcript, setTranscript] = useState<PanelTranscript | null>(null);
  const [level, setLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [isCompact, setIsCompact] = useState(false);

  const transcriptRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // The window loads after the meeting has already started, so the state it
    // missed is fetched once rather than waited for.
    void window.electronAPI?.meetingPanelGetState?.().then((initial) => {
      if (initial) setSnapshot(initial);
    });
    void window.electronAPI?.meetingPanelGetTranscript?.().then((initial) => {
      if (initial) setTranscript(initial);
    });

    const unbindState = window.electronAPI?.onMeetingPanelState?.(setSnapshot);
    const unbindLevel = window.electronAPI?.onMeetingPanelLevel?.(setLevel);
    const unbindTranscript = window.electronAPI?.onMeetingPanelTranscript?.(setTranscript);
    return () => {
      unbindState?.();
      unbindLevel?.();
      unbindTranscript?.();
    };
  }, []);

  // The panel is resizable down to a bar. Rather than two components, the panes
  // drop out below a height where they would be unreadable anyway.
  useEffect(() => {
    const measure = () => setIsCompact(window.innerHeight < COMPACT_HEIGHT_PX);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (!snapshot) return undefined;
    // Read from the snapshot's own timestamp on every tick rather than counted
    // up locally, so time is never lost to a throttled or hidden window.
    const update = () => setElapsedMs(capturedMsAt(snapshot, Date.now()));
    update();
    if (snapshot.isPaused) return undefined;
    const intervalId = setInterval(update, CLOCK_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [snapshot]);

  // Follows the conversation. No "scroll back to live" affordance here on
  // purpose: this pane holds a couple of minutes at most, and the full
  // transcript is a click away in the note.
  useEffect(() => {
    const element = transcriptRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [transcript]);

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
    !isPaused && (snapshot.micStatus === "reconnecting" || snapshot.micStatus === "unavailable");

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

  const lines = transcript?.lines ?? [];

  return (
    <div
      className="meeting-panel-window flex h-full w-full flex-col bg-transparent p-1"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div
        className={cn(
          "hud-surface flex h-full w-full flex-col overflow-hidden rounded-[13px]",
          isPaused ? "hud-surface" : isWaitingForMic ? "hud-surface-warn" : "hud-surface-live"
        )}
      >
        {/* Status row — the old panel, now the header. */}
        <div className="flex shrink-0 items-center gap-2 py-1 pl-2.5 pr-1.5">
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

        {!isCompact && (
          <div
            className="flex min-h-0 flex-1 flex-col gap-1.5 px-1.5 pb-1.5"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            {/* Suggestion. The hero of this window: the one thing worth
                reading mid sentence, so it gets the visible weight — a tinted
                ground and the accent rule down its edge. Not yet wired to a
                model; the placeholder says so rather than pretending to think. */}
            <section className="shrink-0 rounded-[9px] border border-hud-accent/25 border-l-2 border-l-hud-accent bg-hud-accent/[0.07] px-2.5 py-2">
              <div className="mb-1 flex items-center gap-1.5">
                <Lightbulb size={10} className="text-hud-accent" />
                <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-hud-accent/90">
                  {t("notes.meetingPanel.suggestion.label")}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-hud-muted/80">
                {t("notes.meetingPanel.suggestion.pending")}
              </p>
            </section>

            {/* Transcript. Capped, never grows — see TRANSCRIPT_MAX_HEIGHT_PX. */}
            <section className="flex shrink-0 flex-col rounded-[9px] border border-hud-border bg-white/[0.03]">
              <div className="flex shrink-0 items-center gap-1.5 px-2.5 pb-1 pt-1.5">
                <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-hud-muted/70">
                  {t("notes.meetingPanel.transcript.label")}
                </span>
                <span className="h-px flex-1 bg-hud-border" aria-hidden="true" />
                {(transcript?.hiddenCount ?? 0) > 0 && (
                  <span className="shrink-0 text-[9px] text-hud-muted/50">
                    {t("notes.meetingPanel.transcript.earlier", {
                      count: transcript?.hiddenCount ?? 0,
                    })}
                  </span>
                )}
              </div>
              <div
                ref={transcriptRef}
                style={{ maxHeight: TRANSCRIPT_MAX_HEIGHT_PX }}
                className="space-y-0.5 overflow-y-auto px-2.5 pb-2"
              >
                {lines.length === 0 ? (
                  <p className="pt-0.5 text-[11px] leading-relaxed text-hud-muted/50">
                    {t("notes.meetingPanel.transcript.waiting")}
                  </p>
                ) : (
                  lines.map((line) => (
                    <p key={line.key} className="text-[11px] leading-snug">
                      <span
                        className={cn(
                          "mr-1.5 text-[9px] font-semibold uppercase tracking-[0.06em]",
                          line.source === "mic" ? "text-hud-accent/80" : "text-hud-muted/60"
                        )}
                      >
                        {line.source === "mic"
                          ? t("transcript.speaker.you")
                          : t("transcript.speaker.others")}
                      </span>
                      <span className={cn(line.live ? "text-hud-muted/70" : "text-hud-muted")}>
                        {line.text}
                      </span>
                    </p>
                  ))
                )}
              </div>
            </section>

            {/* The assistant. This is what the leftover height goes to, because
                it is the reason to keep the panel open — a question you need
                answered now, and the room to read the answer. */}
            <section className="flex min-h-0 flex-1 flex-col rounded-[9px] border border-hud-border bg-white/[0.04]">
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 px-3 py-3 text-center">
                <MessageSquareText size={14} className="text-hud-muted/40" />
                <p className="text-[11px] leading-relaxed text-hud-muted/60">
                  {t("notes.meetingPanel.ask.empty")}
                </p>
              </div>

              {/* Disabled, and it says why. A box that swallows what you type
                  is worse than one that admits it is not ready. */}
              <form
                className="flex shrink-0 items-center gap-1.5 border-t border-hud-border px-2 py-1.5"
                onSubmit={(event) => event.preventDefault()}
              >
                <input
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  disabled
                  placeholder={t("notes.meetingPanel.ask.comingSoon")}
                  aria-label={t("notes.meetingPanel.ask.label")}
                  className={cn(
                    "min-w-0 flex-1 bg-transparent text-[11px] text-hud-foreground outline-none",
                    "placeholder:text-hud-muted/50 disabled:cursor-not-allowed"
                  )}
                />
                <button
                  type="submit"
                  disabled
                  aria-label={t("notes.meetingPanel.ask.send")}
                  className="flex size-5 shrink-0 items-center justify-center rounded text-hud-muted disabled:opacity-40"
                >
                  <SendHorizontal size={11} />
                </button>
              </form>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
