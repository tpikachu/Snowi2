import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Brain,
  ExternalLink,
  History,
  Lightbulb,
  MessageSquareText,
  Pause,
  Play,
  SendHorizontal,
  Square,
  Zap,
} from "lucide-react";
import { capturedMsAt, type MeetingPanelSnapshot } from "../utils/meetingPanelSnapshot";
import type { PanelTranscript } from "../utils/meetingPanelTranscript";
import type {
  AssistLastTime,
  AssistMode,
  AssistNoteRef,
  MeetingAssistState,
} from "../utils/meetingAssistState";
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

/** How many past notes are named under a suggestion or an answer. */
const MAX_VISIBLE_SOURCES = 3;

/**
 * The two speeds of an answer, as a two-button segment in the ask row.
 *
 * Fast is the default and re-defaults every meeting: mid-call the person on
 * the other end is already waiting, so the instant mode has to be the one a
 * hurried click gets. Thinking is the deliberate choice — the label and the
 * tooltip say what the extra seconds buy, because a mode switch nobody can
 * explain is a mode switch nobody uses.
 */
function ModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: AssistMode;
  onChange: (mode: AssistMode) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const options: Array<{ id: AssistMode; icon: typeof Zap; label: string; hint: string }> = [
    {
      id: "fast",
      icon: Zap,
      label: t("notes.meetingPanel.mode.fast"),
      hint: t("notes.meetingPanel.mode.fastHint"),
    },
    {
      id: "thinking",
      icon: Brain,
      label: t("notes.meetingPanel.mode.thinking"),
      hint: t("notes.meetingPanel.mode.thinkingHint"),
    },
  ];

  return (
    <div
      role="radiogroup"
      aria-label={t("notes.meetingPanel.mode.label")}
      className="flex shrink-0 items-center gap-px rounded-md border border-hud-border p-px"
    >
      {options.map(({ id, icon: Icon, label, hint }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={mode === id}
          disabled={disabled}
          onClick={() => onChange(id)}
          title={hint}
          className={cn(
            "flex h-5 items-center gap-1 rounded-[5px] px-1.5 text-[9px] font-medium",
            "transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-accent/70",
            "disabled:cursor-not-allowed disabled:opacity-40",
            mode === id
              ? "bg-hud-accent/15 text-hud-accent"
              : "text-hud-muted/70 hover:bg-white/5 hover:text-hud-foreground"
          )}
        >
          <Icon size={9} />
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * "This meeting has met before" — the pre-meeting brief's visible edge.
 *
 * One quiet row, not a card: what it earns the user is the knowledge that the
 * assistant already holds last occurrence's claims, and one click to hear
 * them. The click asks a real question in thinking mode; the button label *is*
 * the question, so what the user pressed and what the assistant was asked can
 * never disagree.
 */
function LastTimeStrip({
  lastTime,
  ready,
  onAsk,
}: {
  lastTime: AssistLastTime;
  ready: boolean;
  onAsk: (question: string) => void;
}) {
  const { t, i18n } = useTranslation();

  const parsed = new Date(lastTime.date);
  const date = Number.isNaN(parsed.getTime())
    ? lastTime.date.slice(0, 10)
    : parsed.toLocaleDateString(i18n.language, { month: "short", day: "numeric" });
  const askLabel = t("notes.meetingPanel.lastTime.ask");

  return (
    <section className="flex shrink-0 items-center gap-1.5 rounded-[9px] border border-hud-border bg-white/[0.03] px-2.5 py-1">
      <History size={10} className="shrink-0 text-hud-muted/60" />
      <span className="min-w-0 flex-1 truncate text-[10px] text-hud-muted">
        {t("notes.meetingPanel.lastTime.summary", { date })}
        {lastTime.openClaims > 0 && (
          <span className="text-hud-foreground/75">
            {" · "}
            {t("notes.meetingPanel.lastTime.open", { count: lastTime.openClaims })}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={() => onAsk(askLabel)}
        disabled={!ready}
        className={cn(
          "flex shrink-0 items-center gap-1 rounded-md border border-hud-border px-1.5 py-0.5",
          "text-[10px] text-hud-muted transition-colors duration-150",
          "hover:bg-white/10 hover:text-hud-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-accent/70",
          "disabled:cursor-not-allowed disabled:opacity-40"
        )}
      >
        <Brain size={9} />
        {askLabel}
      </button>
    </section>
  );
}

/**
 * The three questions every meeting eventually asks, as one-click chips.
 *
 * The machinery existed before the buttons did — fast assist, thinking
 * retrieval, the series brief — but a text box is an empty prompt, and
 * mid-call nobody composes. Each label IS the question sent, LastTimeStrip's
 * rule: what the user pressed and what the assistant was asked cannot
 * disagree. "What's still open?" appears only for a recognized recurring
 * meeting, because without a previous occurrence it is a question about
 * nothing.
 */
function QuickActions({
  ready,
  hasSeries,
  onAsk,
}: {
  ready: boolean;
  hasSeries: boolean;
  onAsk: (question: string, mode: AssistMode) => void;
}) {
  const { t } = useTranslation();
  const actions: Array<{ label: string; mode: AssistMode; icon: typeof Zap }> = [
    { label: t("notes.meetingPanel.quickActions.whatToSay"), mode: "fast", icon: Zap },
    { label: t("notes.meetingPanel.quickActions.recap"), mode: "thinking", icon: Brain },
    ...(hasSeries
      ? [
          {
            label: t("notes.meetingPanel.quickActions.stillOpen"),
            mode: "thinking" as AssistMode,
            icon: History,
          },
        ]
      : []),
  ];

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1">
      {actions.map(({ label, mode, icon: Icon }) => (
        <button
          key={label}
          type="button"
          onClick={() => onAsk(label, mode)}
          disabled={!ready}
          className={cn(
            "flex items-center gap-1 rounded-md border border-hud-border px-1.5 py-0.5",
            "text-[10px] text-hud-muted transition-colors duration-150",
            "hover:bg-white/10 hover:text-hud-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-accent/70",
            "disabled:cursor-not-allowed disabled:opacity-40"
          )}
        >
          <Icon size={9} />
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Which past notes this was built from.
 *
 * Named rather than cited inline: mid-call there is no time to follow a
 * citation, but seeing "Acme kickoff" under a claim is enough to know whether
 * to trust it — and enough to catch the assistant answering about the wrong
 * meeting, which is the failure mode retrieval actually has.
 */
function SourceList({ sources }: { sources: readonly AssistNoteRef[] }) {
  const { t } = useTranslation();
  if (sources.length === 0) return null;

  const shown = sources.slice(0, MAX_VISIBLE_SOURCES);
  const extra = sources.length - shown.length;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      <span className="text-[9px] uppercase tracking-[0.06em] text-hud-muted/45">
        {t("notes.meetingPanel.sourcesLabel")}
      </span>
      {shown.map((source) => (
        <span
          key={source.noteId}
          title={source.title}
          className="max-w-[9rem] truncate rounded border border-hud-border px-1 py-px text-[9px] text-hud-muted/70"
        >
          {source.title}
        </span>
      ))}
      {extra > 0 && <span className="text-[9px] text-hud-muted/45">+{extra}</span>}
    </div>
  );
}

export default function MeetingPanelOverlay() {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<MeetingPanelSnapshot | null>(null);
  const [transcript, setTranscript] = useState<PanelTranscript | null>(null);
  /**
   * Null until the control panel has actually said something.
   *
   * Defaulting to an idle state instead made "no model is configured" and "I
   * have not heard from the assistant yet" the same value, and the panel
   * rendered the harsher of the two — telling people to go set up a model they
   * had already set up. The two are now distinct, and an unheard-from
   * assistant says so.
   */
  const [assist, setAssist] = useState<MeetingAssistState | null>(null);
  const [level, setLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [question, setQuestion] = useState("");
  // Per-meeting, not persisted: fast has to be what the next meeting opens on,
  // or the "instant by default" promise only holds until someone tries thinking
  // once and forgets to switch back.
  const [mode, setMode] = useState<AssistMode>("fast");
  const [isCompact, setIsCompact] = useState(false);

  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const answerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // The window loads after the meeting has already started, so the state it
    // missed is fetched once rather than waited for.
    void window.electronAPI?.meetingPanelGetState?.().then((initial) => {
      if (initial) setSnapshot(initial);
    });
    void window.electronAPI?.meetingPanelGetTranscript?.().then((initial) => {
      if (initial) setTranscript(initial);
    });
    // Caught rather than left dangling: on a dev run where the main process
    // predates this channel the invoke rejects, and an unhandled rejection is
    // a worse way to learn that than an honest "connecting" pane.
    void window.electronAPI
      ?.meetingPanelGetAssist?.()
      .then((initial) => {
        if (initial) setAssist(initial);
      })
      .catch(() => {});

    const unbindState = window.electronAPI?.onMeetingPanelState?.(setSnapshot);
    const unbindLevel = window.electronAPI?.onMeetingPanelLevel?.(setLevel);
    const unbindTranscript = window.electronAPI?.onMeetingPanelTranscript?.(setTranscript);
    const unbindAssist = window.electronAPI?.onMeetingPanelAssist?.(setAssist);
    return () => {
      unbindState?.();
      unbindLevel?.();
      unbindTranscript?.();
      unbindAssist?.();
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

  // An answer streams in from the bottom, so the newest sentence stays visible
  // without the user reaching for a scrollbar mid-call.
  useEffect(() => {
    const element = answerRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [assist?.answer?.text]);

  const send = useCallback(async (command: MeetingPanelCommand) => {
    setIsBusy(true);
    try {
      await window.electronAPI?.meetingPanelCommand?.(command);
    } finally {
      setIsBusy(false);
    }
  }, []);

  const submitQuestion = useCallback(() => {
    const trimmed = question.trim();
    if (!trimmed) return;
    // Cleared optimistically. The answer replaces it on screen, and leaving the
    // question in the box invites a second identical send while the first
    // streams.
    setQuestion("");
    void window.electronAPI?.meetingPanelAsk?.(trimmed, mode);
  }, [question, mode]);

  // The escalation: the same question again, this time over past notes. One
  // click, because the moment someone wants it is the moment a fast answer
  // just said "that is not in this meeting". Deliberately does not move the
  // toggle — it escalates this question, not the default.
  const askAgainWithNotes = useCallback((text: string) => {
    void window.electronAPI?.meetingPanelAsk?.(text, "thinking");
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
  const suggestion = assist?.suggestion ?? null;
  const answer = assist?.answer ?? null;
  // Three states, not two: configured, known to need a model, and not yet
  // heard from. Only the middle one may accuse the user of skipping setup.
  const assistReady = assist?.configured === true;
  const assistNeedsModel = assist?.configured === false;

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
            {/* Last time this meeting met — present only for a recognized
                recurring meeting, on screen from the first second, before
                anything has been said. */}
            {assist?.lastTime && (
              <LastTimeStrip
                lastTime={assist.lastTime}
                ready={assistReady}
                onAsk={askAgainWithNotes}
              />
            )}

            {/* Suggestion. The hero of this window: the one thing worth
                reading mid sentence, so it gets the visible weight — a tinted
                ground and the accent rule down its edge. Already computed by
                the time it appears; see useMeetingAssist for why. */}
            <section className="shrink-0 rounded-[9px] border border-hud-accent/25 border-l-2 border-l-hud-accent bg-hud-accent/[0.07] px-2.5 py-2">
              <div className="mb-1 flex items-center gap-1.5">
                <Lightbulb size={10} className="text-hud-accent" />
                <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-hud-accent/90">
                  {t("notes.meetingPanel.suggestion.label")}
                </span>
                {suggestion?.stale && (
                  <span className="ml-auto shrink-0 text-[9px] text-hud-muted/50">
                    {t("notes.meetingPanel.suggestion.stale")}
                  </span>
                )}
              </div>

              {suggestion ? (
                <>
                  {/* Dimmed rather than hidden once the conversation moves on:
                      slightly old advice still beats a blank box when someone
                      is waiting for you to speak. */}
                  <p
                    className={cn(
                      "text-xs leading-relaxed",
                      suggestion.stale ? "text-hud-foreground/45" : "text-hud-foreground"
                    )}
                  >
                    {suggestion.text}
                  </p>
                  <SourceList sources={suggestion.sources} />
                </>
              ) : (
                <p className="text-xs leading-relaxed text-hud-muted/70">
                  {assistNeedsModel
                    ? t("notes.meetingPanel.suggestion.needsModel")
                    : !assistReady
                      ? t("notes.meetingPanel.suggestion.connecting")
                      : assist?.suggestionPending
                        ? t("notes.meetingPanel.suggestion.working")
                        : t("notes.meetingPanel.suggestion.empty")}
                </p>
              )}
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

            {/* The named verbs, one row above the assistant they feed. */}
            <QuickActions
              ready={assistReady}
              hasSeries={!!assist?.lastTime}
              onAsk={(text, askMode) => void window.electronAPI?.meetingPanelAsk?.(text, askMode)}
            />

            {/* The assistant. This is what the leftover height goes to, because
                it is the reason to keep the panel open — a question you need
                answered now, and the room to read the answer. */}
            <section className="flex min-h-0 flex-1 flex-col rounded-[9px] border border-hud-border bg-white/[0.04]">
              {answer ? (
                <div ref={answerRef} className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
                  <p className="flex items-baseline gap-1.5 text-[10px] font-medium leading-snug text-hud-muted/60">
                    <span className="min-w-0">{answer.question}</span>
                    {/* Which speed produced this — so a transcript-only answer
                        is never mistaken for one that checked the notes. */}
                    <span className="shrink-0 text-[9px] font-normal uppercase tracking-[0.06em] text-hud-muted/40">
                      {answer.mode === "thinking"
                        ? t("notes.meetingPanel.mode.thinking")
                        : t("notes.meetingPanel.mode.fast")}
                    </span>
                  </p>
                  {answer.errorKey ? (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-hud-warning">
                      {t(answer.errorKey)}
                    </p>
                  ) : answer.streaming && !answer.text && answer.mode === "thinking" ? (
                    /* Thinking pays its latency up front, in retrieval, before
                       a single token exists to stream. Saying what the wait is
                       makes it deliberate instead of broken. */
                    <p className="mt-1.5 animate-pulse text-[11px] leading-relaxed text-hud-muted/60">
                      {t("notes.meetingPanel.ask.searchingNotes")}
                    </p>
                  ) : (
                    <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-hud-foreground">
                      {answer.text}
                      {/* The caret is the only "it is working" signal an
                          answer needs: the text itself is the progress bar. */}
                      {answer.streaming && (
                        <span className="ml-0.5 inline-block h-3 w-[2px] translate-y-[2px] animate-pulse bg-hud-accent" />
                      )}
                    </p>
                  )}
                  {!answer.streaming && <SourceList sources={answer.sources} />}
                  {/* The escalation. Only on a settled fast answer: it is the
                      "that was not in this meeting" next step, and offering to
                      re-check the notes under an answer that already checked
                      them would be a button that does nothing. */}
                  {!answer.streaming && !answer.errorKey && answer.mode === "fast" && (
                    <button
                      type="button"
                      onClick={() => askAgainWithNotes(answer.question)}
                      disabled={!assistReady}
                      className={cn(
                        "mt-1.5 flex items-center gap-1 rounded-md border border-hud-border px-1.5 py-0.5",
                        "text-[10px] text-hud-muted transition-colors duration-150",
                        "hover:bg-white/10 hover:text-hud-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-accent/70",
                        "disabled:cursor-not-allowed disabled:opacity-40"
                      )}
                    >
                      <Brain size={9} />
                      {t("notes.meetingPanel.ask.checkNotes")}
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 px-3 py-3 text-center">
                  <MessageSquareText size={14} className="text-hud-muted/40" />
                  <p className="text-[11px] leading-relaxed text-hud-muted/60">
                    {assistNeedsModel
                      ? t("notes.meetingPanel.ask.needsModel")
                      : !assistReady
                        ? t("notes.meetingPanel.ask.connecting")
                        : t("notes.meetingPanel.ask.empty")}
                  </p>
                  {/* The one place the two modes are explained in a sentence,
                      shown before the first question — the moment the choice
                      first exists. */}
                  {assistReady && (
                    <p className="text-[10px] leading-relaxed text-hud-muted/40">
                      {t("notes.meetingPanel.ask.modesHint")}
                    </p>
                  )}
                </div>
              )}

              <form
                className="flex shrink-0 items-center gap-1.5 border-t border-hud-border px-2 py-1.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitQuestion();
                }}
              >
                <ModeToggle mode={mode} onChange={setMode} disabled={!assistReady} />
                <input
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  disabled={!assistReady}
                  placeholder={
                    assistReady
                      ? mode === "thinking"
                        ? t("notes.meetingPanel.ask.placeholderThinking")
                        : t("notes.meetingPanel.ask.placeholder")
                      : assistNeedsModel
                        ? t("notes.meetingPanel.ask.needsModelPlaceholder")
                        : t("notes.meetingPanel.ask.connectingPlaceholder")
                  }
                  aria-label={t("notes.meetingPanel.ask.label")}
                  className={cn(
                    "min-w-0 flex-1 bg-transparent text-[11px] text-hud-foreground outline-none",
                    "placeholder:text-hud-muted/50 disabled:cursor-not-allowed"
                  )}
                />
                <button
                  type="submit"
                  disabled={!assistReady || !question.trim()}
                  aria-label={t("notes.meetingPanel.ask.send")}
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded",
                    "text-hud-accent transition-colors duration-150 hover:bg-white/10",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-accent/70",
                    "disabled:text-hud-muted disabled:opacity-40 disabled:hover:bg-transparent"
                  )}
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
