import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Markdown, { type Components } from "react-markdown";
import {
  Brain,
  Check,
  Copy,
  ExternalLink,
  History,
  Lightbulb,
  MessageSquareText,
  Pause,
  Play,
  SendHorizontal,
  Settings2,
  Square,
  Zap,
} from "lucide-react";
import ModelPickerChip from "./ModelPickerChip";
import { capturedMsAt, type MeetingPanelSnapshot } from "../utils/meetingPanelSnapshot";
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
 * surface — a suggestion the assistant has already prepared and a question
 * box.
 *
 * The sections are sized by how much attention each deserves, which is not
 * how much space they would naturally want. The suggestion is at the top,
 * carrying the accent, because it is the thing worth glancing at mid
 * sentence. There is deliberately no transcript here: reading words scroll by
 * mid-call means no longer listening to the call, the level meter already
 * proves capture, and the full transcript lives in the meeting's note. Every
 * remaining pixel goes to the assistant, which is the reason to keep the
 * panel open.
 *
 * The visual language is one dark glass surface (see .hud-surface — a deep
 * tint with a sliver of desktop showing through), tonal rather than drawn:
 * the window edge carries the only border, and everything inside is a fill —
 * chips, wells, and buttons are lighter washes on the glass, never boxes.
 * Fills sit a notch brighter than they would on paint, because a wash on a
 * translucent ground loses a step of contrast to whatever is behind it.
 * Three type registers only: 14px for anything read or typed (suggestion,
 * answer, the ask input), 12px for buttons and chips, 11px for the few
 * uppercase labels. Muted text never drops below the hud-muted token itself
 * — stacking opacity on top of it is what made the old labels fail WCAG
 * contrast on this dark surface.
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

const computeBarHeight = (level: number, index: number) => {
  const scaled = Math.sqrt(level) * 2.4 * BAR_WEIGHTS[index];
  return `${(METER_HEIGHT_PX * Math.max(BAR_FLOOR, Math.min(1, scaled))).toFixed(2)}px`;
};

const truncateTitle = (title: string) =>
  title.length > 28 ? `${title.slice(0, 27).trimEnd()}…` : title;

/** How many past notes are named under a suggestion or an answer. */
const MAX_VISIBLE_SOURCES = 3;

/**
 * Answers render as markdown, restyled for the HUD's dark surface: bold for
 * the decisive fact, dash lists for genuine lists, and a backticked line —
 * the "say this" line the prompts ask for — set in monospace on its own soft
 * well, the way a quotable line reads in the reference product. Headings and
 * links are flattened rather than styled: the prompt bans them, and a stray
 * one should degrade to text, not to a broken register.
 */
const ANSWER_MARKDOWN_COMPONENTS: Components = {
  // The air between blocks is the format: a direct sentence, a labeled list,
  // a takeaway — each reads as its own glanceable unit, not a wall.
  p: ({ children }) => <p className="mb-2.5 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2.5 list-disc space-y-1.5 pl-4 last:mb-0">{children}</ul>,
  ol: ({ children }) => (
    <ol className="mb-2.5 list-decimal space-y-1.5 pl-4 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-hud-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => (
    <code className="rounded-md bg-white/[0.1] px-1.5 py-0.5 font-mono text-[13px] leading-relaxed text-hud-foreground">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="mb-2.5 overflow-x-auto rounded-lg bg-white/[0.1] p-2 font-mono text-[13px] last:mb-0">
      {children}
    </pre>
  ),
  h1: ({ children }) => <p className="mb-2.5 font-semibold last:mb-0">{children}</p>,
  h2: ({ children }) => <p className="mb-2.5 font-semibold last:mb-0">{children}</p>,
  h3: ({ children }) => <p className="mb-2.5 font-semibold last:mb-0">{children}</p>,
  a: ({ children }) => <>{children}</>,
  blockquote: ({ children }) => <div className="mb-2.5 last:mb-0">{children}</div>,
};

/** The small round icon buttons in the header. */
const headerIconButtonClass = cn(
  "flex size-7 items-center justify-center rounded-lg",
  "text-hud-muted transition-colors duration-150",
  "hover:bg-white/10 hover:text-hud-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-accent/70",
  "disabled:cursor-not-allowed disabled:opacity-50"
);

/**
 * The two speeds of an answer, a compact segment inside the ask well.
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
      className="flex shrink-0 items-center gap-px rounded-full bg-white/[0.08] p-0.5"
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
            "flex h-6 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium",
            "transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-accent/70",
            "disabled:cursor-not-allowed disabled:opacity-40",
            mode === id
              ? "bg-hud-accent/20 text-hud-accent"
              : "text-hud-muted hover:text-hud-foreground"
          )}
        >
          <Icon size={10} />
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * "This meeting has met before" — the pre-meeting brief's visible edge.
 *
 * One quiet line of context, not a card and not a control: the action it used
 * to carry ("What's still open?") lives with the other quick actions, so this
 * only has to say what the assistant already knows.
 */
function LastTimeLine({ lastTime }: { lastTime: AssistLastTime }) {
  const { t, i18n } = useTranslation();

  const parsed = new Date(lastTime.date);
  const date = Number.isNaN(parsed.getTime())
    ? lastTime.date.slice(0, 10)
    : parsed.toLocaleDateString(i18n.language, { month: "short", day: "numeric" });

  return (
    <p className="flex min-w-0 shrink-0 items-center gap-1.5 text-[11px] text-hud-muted">
      <History size={11} className="shrink-0 text-hud-muted/80" />
      <span className="min-w-0 truncate">
        {t("notes.meetingPanel.lastTime.summary", { date })}
        {lastTime.openClaims > 0 && (
          <span className="text-hud-foreground/75">
            {" · "}
            {t("notes.meetingPanel.lastTime.open", { n: lastTime.openClaims })}
          </span>
        )}
      </span>
    </p>
  );
}

/**
 * The three questions every meeting eventually asks, as one-tap buttons.
 *
 * Each label IS the question sent, so what the user pressed and what the
 * assistant was asked can never disagree. Real pill buttons, not a row of
 * verbs: mid-call, an action has to look pressable at a glance. "What's still
 * open?" appears only for a recognized recurring meeting, because without a
 * previous occurrence it is a question about nothing.
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
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      {actions.map(({ label, mode, icon: Icon }) => (
        <button
          key={label}
          type="button"
          onClick={() => onAsk(label, mode)}
          disabled={!ready}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-full bg-white/[0.1] px-3",
            "text-[12px] font-medium text-hud-foreground transition-colors duration-150",
            "hover:bg-white/[0.16]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-accent/70",
            "disabled:cursor-not-allowed disabled:opacity-40"
          )}
        >
          <Icon size={11} className="text-hud-accent/80" />
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Which past notes this was built from.
 *
 * One muted line, not a chip per note: mid-call there is no time to follow a
 * citation, but seeing "Acme kickoff" under a claim is enough to know whether
 * to trust it — and enough to catch the assistant answering about the wrong
 * meeting, which is the failure mode retrieval actually has.
 */
function SourceLine({ sources }: { sources: readonly AssistNoteRef[] }) {
  const { t } = useTranslation();
  if (sources.length === 0) return null;

  const shown = sources.slice(0, MAX_VISIBLE_SOURCES);
  const extra = sources.length - shown.length;
  const names = shown.map((source) => source.title).join(" · ");

  return (
    <p
      title={sources.map((source) => source.title).join(", ")}
      className="mt-1.5 truncate text-[11px] text-hud-muted"
    >
      <span className="uppercase tracking-[0.06em] text-hud-muted/80">
        {t("notes.meetingPanel.sourcesLabel")}
      </span>{" "}
      {names}
      {extra > 0 && ` +${extra}`}
    </p>
  );
}

export default function MeetingPanelOverlay() {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<MeetingPanelSnapshot | null>(null);
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
  const [copied, setCopied] = useState(false);

  const answerRef = useRef<HTMLDivElement | null>(null);

  // The copied check belongs to one answer; a new one gets a fresh Copy.
  useEffect(() => {
    setCopied(false);
  }, [assist?.answer?.text]);

  const copyAnswer = useCallback((text: string) => {
    void navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // The window loads after the meeting has already started, so the state it
    // missed is fetched once rather than waited for.
    void window.electronAPI?.meetingPanelGetState?.().then((initial) => {
      if (initial) setSnapshot(initial);
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
    const unbindAssist = window.electronAPI?.onMeetingPanelAssist?.(setAssist);
    return () => {
      unbindState?.();
      unbindLevel?.();
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

  // The escalation: the same question again, this time over past notes — and
  // because the question is identical, the assist hook sends the fast draft
  // along for the thinking model to verify and extend rather than restart.
  // One click, because the moment someone wants it is the moment a fast
  // answer just said "that is not in this meeting". Deliberately does not
  // move the toggle — it escalates this question, not the default.
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
          isWaitingForMic ? "hud-surface-warn" : !isPaused && "hud-surface-live"
        )}
      >
        {/* Header — capture status left, capture controls right. */}
        <div
          className={cn(
            "flex shrink-0 items-center gap-2 py-1.5 pl-3 pr-1.5",
            !isCompact && "border-b border-hud-border"
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
            <span className="truncate text-xs font-semibold leading-tight text-hud-foreground">
              {isPaused ? t("notes.meeting.pausedWithTitle", { title }) : title}
            </span>
            <span
              className={cn(
                "truncate text-[11px] leading-tight",
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

          <span
            className="flex shrink-0 items-center gap-0.5"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <button
              type="button"
              onClick={() => void send("open")}
              aria-label={openLabel}
              title={openLabel}
              className={headerIconButtonClass}
            >
              <ExternalLink size={12} />
            </button>

            <button
              type="button"
              onClick={() => void send(isPaused ? "resume" : "pause")}
              disabled={isBusy}
              aria-label={pauseLabel}
              title={pauseLabel}
              className={headerIconButtonClass}
            >
              {isPaused ? (
                <Play size={12} fill="currentColor" />
              ) : (
                <Pause size={12} fill="currentColor" />
              )}
            </button>

            <button
              type="button"
              onClick={() => void send("stop")}
              disabled={isBusy}
              aria-label={stopLabel}
              title={stopLabel}
              className={cn(
                "ml-0.5 flex h-7 items-center justify-center gap-1.5 rounded-lg px-2.5",
                "text-[12px] font-medium transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-accent/70",
                "bg-hud-danger/20 text-hud-danger hover:bg-hud-danger/30",
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
            className="flex min-h-0 flex-1 flex-col gap-2.5 px-3 pb-2.5 pt-2"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            {/* Last time this meeting met — present only for a recognized
                recurring meeting, on screen from the first second, before
                anything has been said. */}
            {assist?.lastTime && <LastTimeLine lastTime={assist.lastTime} />}

            {/* Suggestion. The hero of this window: the one thing worth
                reading mid sentence, so it carries the accent and the largest
                type — and no box, because the words are the emphasis. Already
                computed by the time it appears; see useMeetingAssist for why. */}
            <section className="shrink-0">
              <div className="flex items-center gap-1.5">
                <Lightbulb size={12} className="text-hud-accent" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-hud-accent">
                  {t("notes.meetingPanel.suggestion.label")}
                </span>
                {suggestion?.stale && (
                  <span className="ml-auto shrink-0 text-[11px] text-hud-muted">
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
                      "mt-1 text-[14px] leading-relaxed",
                      suggestion.stale ? "text-hud-foreground/60" : "text-hud-foreground"
                    )}
                  >
                    {suggestion.text}
                  </p>
                  <SourceLine sources={suggestion.sources} />
                </>
              ) : (
                <p className="mt-1 text-[14px] leading-relaxed text-hud-muted">
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

            {/* The assistant. This is what the leftover height goes to, because
                it is the reason to keep the panel open — a question you need
                answered now, and the room to read the answer. */}
            {answer ? (
              <div ref={answerRef} className="min-h-0 flex-1 overflow-y-auto">
                {/* The question, as the asker's pill — right-aligned and solid
                    accent, the one place the surface reads as a chat, so the
                    answer below never needs a label saying what it answers. */}
                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl bg-hud-accent px-3 py-1.5 text-[12px] font-medium leading-snug text-hud-surface">
                    {answer.question}
                  </p>
                </div>
                {/* Provenance, not a mode name: which world the answer drew
                    on — so a transcript-only answer is never mistaken for one
                    that checked the notes. */}
                <p className="mt-2 text-[11px] text-hud-muted">
                  {answer.mode === "thinking"
                    ? t("notes.meetingPanel.answer.checkedNotes")
                    : t("notes.meetingPanel.answer.fromMeeting")}
                </p>
                {answer.errorKey ? (
                  <>
                    <p className="mt-1 text-[12px] leading-relaxed text-hud-warning">
                      {t(answer.errorKey)}
                    </p>
                    {/* A missing model is not retryable — the fix lives in
                        Settings, so the error carries the trip there. */}
                    {assistNeedsModel && (
                      <button
                        type="button"
                        onClick={() => void send("configureModels")}
                        className={cn(
                          "mt-2 flex h-7 items-center gap-1.5 rounded-full bg-white/[0.1] px-2.5",
                          "text-[11px] font-medium text-hud-foreground/90 transition-colors duration-150",
                          "hover:bg-white/[0.16] hover:text-hud-foreground",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-accent/70"
                        )}
                      >
                        <Settings2 size={11} />
                        {t("notes.meetingPanel.ask.configureModels")}
                      </button>
                    )}
                  </>
                ) : answer.streaming && !answer.text && answer.mode === "thinking" ? (
                  /* Thinking pays its latency up front, in retrieval, before
                     a single token exists to stream. Saying what the wait is
                     makes it deliberate instead of broken. */
                  <p className="mt-1 animate-pulse text-[12px] leading-relaxed text-hud-muted">
                    {t("notes.meetingPanel.ask.searchingNotes")}
                  </p>
                ) : (
                  <div className="mt-1.5 text-[14px] leading-relaxed text-hud-foreground/90">
                    <Markdown components={ANSWER_MARKDOWN_COMPONENTS}>{answer.text}</Markdown>
                    {/* The caret is the only "it is working" signal an
                        answer needs: the text itself is the progress bar. */}
                    {answer.streaming && (
                      <span className="ml-0.5 inline-block h-3 w-[2px] translate-y-[2px] animate-pulse bg-hud-accent" />
                    )}
                  </div>
                )}
                {!answer.streaming && <SourceLine sources={answer.sources} />}
                {!answer.streaming && !answer.errorKey && (
                  <div className="mt-2 flex items-center gap-1.5">
                    {/* The escalation. Only on a settled fast answer: it is
                        the "that was not in this meeting" next step, and
                        offering to re-check the notes under an answer that
                        already checked them would be a button that does
                        nothing. */}
                    {answer.mode === "fast" && (
                      <button
                        type="button"
                        onClick={() => askAgainWithNotes(answer.question)}
                        disabled={!assistReady}
                        title={t("notes.meetingPanel.ask.thinkDeeperHint")}
                        className={cn(
                          "flex h-7 items-center gap-1.5 rounded-full bg-white/[0.1] px-2.5",
                          "text-[11px] font-medium text-hud-foreground/90 transition-colors duration-150",
                          "hover:bg-white/[0.16] hover:text-hud-foreground",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-accent/70",
                          "disabled:cursor-not-allowed disabled:opacity-40"
                        )}
                      >
                        <Brain size={11} />
                        {t("notes.meetingPanel.ask.thinkDeeper")}
                      </button>
                    )}
                    {/* Copy, because the answer is often destined for the
                        chat box of the very meeting it was asked in. */}
                    <button
                      type="button"
                      onClick={() => copyAnswer(answer.text)}
                      aria-label={copied ? t("common.copied") : t("common.copy")}
                      title={copied ? t("common.copied") : t("common.copy")}
                      className={cn(
                        "flex size-7 items-center justify-center rounded-full bg-white/[0.1]",
                        "transition-colors duration-150 hover:bg-white/[0.16]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-accent/70",
                        copied ? "text-hud-accent" : "text-hud-muted hover:text-hud-foreground"
                      )}
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 px-3 text-center">
                <MessageSquareText size={16} className="text-hud-muted/70" />
                <p className="text-[12px] leading-relaxed text-hud-muted">
                  {assistNeedsModel
                    ? t("notes.meetingPanel.ask.needsModel")
                    : !assistReady
                      ? t("notes.meetingPanel.ask.connecting")
                      : t("notes.meetingPanel.ask.empty")}
                </p>
                {assistNeedsModel && (
                  <button
                    type="button"
                    onClick={() => void send("configureModels")}
                    className={cn(
                      "flex h-7 items-center gap-1.5 rounded-full bg-white/[0.1] px-2.5",
                      "text-[11px] font-medium text-hud-foreground/90 transition-colors duration-150",
                      "hover:bg-white/[0.16] hover:text-hud-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-accent/70"
                    )}
                  >
                    <Settings2 size={11} />
                    {t("notes.meetingPanel.ask.configureModels")}
                  </button>
                )}
                {/* The one place the two modes are explained in a sentence,
                    shown before the first question — the moment the choice
                    first exists. */}
                {assistReady && (
                  <p className="text-[11px] leading-relaxed text-hud-muted/80">
                    {t("notes.meetingPanel.ask.modesHint")}
                  </p>
                )}
              </div>
            )}

            {/* The named verbs, directly above the box they feed. */}
            <QuickActions
              ready={assistReady}
              hasSeries={!!assist?.lastTime}
              onAsk={(text, askMode) => void window.electronAPI?.meetingPanelAsk?.(text, askMode)}
            />

            {/* The ask well: one input surface, mode on the left, send on the
                right. The filled send button is the panel's single strong
                affordance — everything else stays quiet. */}
            <form
              className={cn(
                // A tonal well, no stroke — focus brightens the fill instead
                // of drawing a ring (matches the assistant bar's field).
                "flex shrink-0 items-center gap-1.5 rounded-xl bg-white/[0.1] p-1.5 pl-2",
                "transition-colors duration-150 focus-within:bg-white/[0.14]"
              )}
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
                  // input-inline opts out of the app's boxed input chrome —
                  // without it the global stylesheet draws its own border and
                  // focus ring inside this well.
                  "input-inline min-w-0 flex-1 bg-transparent p-0 text-[14px] text-hud-foreground outline-none",
                  "placeholder:text-hud-muted disabled:cursor-not-allowed"
                )}
              />
              {/* The assistant's model, changeable mid-meeting. Writes the
                  same chatIntelligence scope the app chat's chip writes — one
                  brain, pickable from either surface; the control panel's
                  assistant reads it fresh on the next ask via the store's
                  cross-window sync. Also the fix when no model is set: the
                  chip is enabled even while the panel says "needs model". */}
              <ModelPickerChip scope="chatIntelligence" variant="hud" />
              <button
                type="submit"
                disabled={!assistReady || !question.trim()}
                aria-label={t("notes.meetingPanel.ask.send")}
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full",
                  "bg-hud-accent text-hud-surface transition-colors duration-150 hover:bg-hud-accent/85",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-accent/70",
                  "disabled:bg-white/10 disabled:text-hud-muted"
                )}
              >
                <SendHorizontal size={13} />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
