import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Markdown, { type Components } from "react-markdown";
import {
  Brain,
  Check,
  ChevronDown,
  Copy,
  CornerDownLeft,
  Eraser,
  Eye,
  EyeOff,
  ExternalLink,
  Globe,
  History,
  LayoutDashboard,
  Lightbulb,
  Monitor,
  Pause,
  Play,
  Quote,
  SendHorizontal,
  Settings2,
  Sparkles,
  Square,
  TriangleAlert,
  X,
} from "lucide-react";
import ModelPickerChip from "./ModelPickerChip";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { useSettingsStore } from "../stores/settingsStore";
import { capturedMsAt, type MeetingPanelSnapshot } from "../utils/meetingPanelSnapshot";
import type {
  AssistAnswer,
  AssistLastTime,
  AssistMode,
  MeetingAssistState,
} from "../utils/meetingAssistState";
import { parseAssistAnswer, sayAnswerText } from "../utils/assistAnswerFormat";
import { describeAnswerSources } from "../utils/answerProvenance";
import { MAX_WEB_SOURCES, sourceLabel } from "../utils/assistAnswerStream";
import type {
  DisplayInfo,
  MeetingPanelCommand,
  ScreenRecordingAccessResult,
} from "../types/electron";
import { formatMmSs } from "../utils/formatDuration";
import { cn } from "./lib/utils";

/**
 * The meeting cue card: where the meeting happens.
 *
 * Three zones, top to bottom, and nothing else — the shape the reference
 * product taught users to expect, then made better where it counts:
 *
 *  1. The ask bar. One field across the top, the card's single strong
 *     affordance, with the two questions every meeting asks as ghost chips
 *     right under it. Nothing to configure here.
 *  2. The thread. Newest first, directly under the field that produced it:
 *     the live answer, then earlier answers dimmed below a hairline. An
 *     answer is a direct line, a few bullets, and — lifted into its own
 *     accent-edged block with a copy button — the exact words to say. The
 *     assistant's unprompted "you could say next" line uses the same block,
 *     so everything sayable looks the same. No uppercase labels, no
 *     provenance lines, no chrome between the reader and the words.
 *  3. The toolbar. Capture status on the left (level, clock, pause, stop),
 *     configuration on the right (observe my screen, thinking, model), and
 *     Transcript — the card's one way out, to the dashboard's note.
 *     Everything that used to be a labeled row is an icon here, and the
 *     toolbar is the card's drag handle.
 *
 * Still a view, not a controller. The capture graph lives in the control
 * panel's renderer; this window renders published state and sends commands
 * back, so pause, resume and stop have one implementation.
 *
 * Always-dark on purpose, like the dictation HUD: it floats over someone
 * else's window, not inside ours. One glass surface (.hud-surface), tonal
 * rather than drawn — the window edge is the only border; wells and chips
 * are washes on the glass. Three type registers: 14px for anything read or
 * typed, 12px for chips, 11px for the rare small label.
 */

const BAR_COUNT = 5;
const BAR_WEIGHTS = [0.58, 0.84, 1, 0.84, 0.58];
const BAR_FLOOR = 0.2;
const METER_HEIGHT_PX = 12;
const CLOCK_INTERVAL_MS = 250;

/** Below this the window is a bar again: ask field over toolbar, no thread. */
const COMPACT_HEIGHT_PX = 140;
/** Rendered in the cue card's own window (ASSISTANT_DOT), not inside the bar's. */
const inOwnWindow =
  typeof window !== "undefined" && window.location.search.includes("meeting-panel=true");

const computeBarHeight = (level: number, index: number) => {
  const scaled = Math.sqrt(level) * 2.4 * BAR_WEIGHTS[index];
  return `${(METER_HEIGHT_PX * Math.max(BAR_FLOOR, Math.min(1, scaled))).toFixed(2)}px`;
};

/**
 * Answers render as markdown, restyled for the dark glass: bold for the
 * decisive fact, dash lists for the facts. The say-line has already been
 * lifted out (parseAssistAnswer), so inline code here is a stray, kept small.
 * Headings and links are flattened rather than styled: the prompt bans them,
 * and a stray one should degrade to text, not to a broken register.
 */
const ANSWER_MARKDOWN_COMPONENTS: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-4 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5 marker:text-hud-muted">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-hud-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => (
    <code className="rounded bg-white/[0.1] px-1 py-0.5 font-mono text-[12px] text-hud-foreground">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-lg bg-white/[0.1] p-2 font-mono text-[12px] last:mb-0">
      {children}
    </pre>
  ),
  h1: ({ children }) => <p className="mb-2 font-semibold last:mb-0">{children}</p>,
  h2: ({ children }) => <p className="mb-2 font-semibold last:mb-0">{children}</p>,
  h3: ({ children }) => <p className="mb-2 font-semibold last:mb-0">{children}</p>,
  a: ({ children }) => <>{children}</>,
  blockquote: ({ children }) => <div className="mb-2 last:mb-0">{children}</div>,
};

/** The round icon buttons of the toolbar and the thread footer. */
const iconButtonClass = cn(
  "flex size-7 shrink-0 items-center justify-center rounded-lg",
  "text-hud-muted transition-colors duration-150",
  "hover:bg-white/10 hover:text-hud-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-accent/70",
  "disabled:cursor-not-allowed disabled:opacity-40"
);

/** Quiet text buttons — the quick actions and the thread's verbs. */
const ghostButtonClass = cn(
  "flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-medium",
  "text-hud-muted transition-colors duration-150",
  "hover:bg-white/[0.08] hover:text-hud-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-accent/70",
  "disabled:cursor-not-allowed disabled:opacity-40"
);

/**
 * The cue card's web search toggle — session state that starts off with
 * every meeting (client direction, 2026-09-18). On, asks may search the web
 * through the chat provider's own search tool, and the answer names its
 * sources. The state lives in the control panel's assist store (the
 * renderer that asks), arrives here in the assist snapshot, and flips
 * through the allow-listed command channel like Clear. On a route that
 * cannot search it is disabled, with the reason as its tooltip.
 */
function WebSearchControl({
  assist,
  disabled,
  onSend,
}: {
  assist: MeetingAssistState | null;
  disabled: boolean;
  onSend: (command: MeetingPanelCommand) => void;
}) {
  const { t } = useTranslation();
  const on = assist?.webSearch === true;
  const available = assist?.webSearchAvailable === true;
  const hint = !available
    ? t(
        assist?.webSearchUnavailableReason === "local"
          ? "notes.meetingPanel.webSearch.unavailableLocal"
          : "notes.meetingPanel.webSearch.unavailable"
      )
    : on
      ? t("notes.meetingPanel.webSearch.disable")
      : t("notes.meetingPanel.webSearch.enable");
  return (
    <button
      type="button"
      onClick={() => onSend(on ? "webSearchOff" : "webSearchOn")}
      disabled={disabled || !available}
      aria-pressed={on}
      aria-label={hint}
      title={hint}
      className={cn(
        iconButtonClass,
        on && available && "bg-hud-accent/20 text-hud-accent hover:bg-hud-accent/30"
      )}
    >
      <Globe size={13} />
    </button>
  );
}

/** The dark popover the model chip already uses on the card. */
const hudPopoverClass =
  "border-white/10 bg-[oklch(0.21_0.008_230)] text-hud-foreground shadow-[0_8px_24px_-8px_rgb(0_0_0/0.7)]";

const noDrag = { WebkitAppRegion: "no-drag" } as React.CSSProperties;
const drag = { WebkitAppRegion: "drag" } as React.CSSProperties;

function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((text: string) => {
    void navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }, []);
  return [copied, copy];
}

/**
 * Words to say, as a block: an accent edge, the line in reading type, and a
 * copy button — because the line is often destined for the chat box of the
 * very meeting it was asked in. Used for the answer's say-line and for the
 * assistant's unprompted suggestion alike, so everything sayable on the card
 * looks the same.
 */
function SayLine({
  text,
  icon: Icon = Quote,
  dim = false,
  label,
  title,
  streaming = false,
  tone = "accent",
}: {
  text: string;
  icon?: typeof Quote;
  dim?: boolean;
  label: string;
  title?: string;
  /** Still arriving: a caret follows the text. */
  streaming?: boolean;
  /** Quiet is the unprompted suggestion's muted edge; accent means an answer to what was asked. */
  tone?: "accent" | "quiet";
}) {
  const { t } = useTranslation();
  const [copied, copy] = useCopy();
  return (
    <div
      role="group"
      aria-label={label}
      title={title}
      className={cn(
        "flex items-start gap-2 rounded-lg border-l-2 py-2 pl-2.5 pr-1",
        tone === "accent"
          ? "border-hud-accent bg-hud-accent/[0.08]"
          : "border-hud-muted/40 bg-white/[0.05]",
        "transition-opacity duration-300",
        dim && "opacity-55"
      )}
    >
      <Icon size={13} className="mt-[4px] shrink-0 text-hud-accent" />
      <p className="min-w-0 flex-1 text-[14px] leading-relaxed text-hud-foreground">
        {text}
        {streaming && (
          <span className="ml-0.5 inline-block h-3 w-[2px] translate-y-[2px] animate-pulse bg-hud-accent" />
        )}
      </p>
      <button
        type="button"
        onClick={() => copy(text)}
        aria-label={copied ? t("common.copied") : t("notes.meetingPanel.answer.copyLine")}
        title={copied ? t("common.copied") : t("notes.meetingPanel.answer.copyLine")}
        className={cn(iconButtonClass, "size-6", copied && "text-hud-accent")}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </div>
  );
}

/**
 * "This meeting has met before" — the pre-meeting brief's visible edge. One
 * quiet line in the empty state, before anything has been said.
 */
function LastTimeLine({ lastTime }: { lastTime: AssistLastTime }) {
  const { t, i18n } = useTranslation();
  const parsed = new Date(lastTime.date);
  const date = Number.isNaN(parsed.getTime())
    ? lastTime.date.slice(0, 10)
    : parsed.toLocaleDateString(i18n.language, { month: "short", day: "numeric" });
  return (
    <p className="flex min-w-0 items-center justify-center gap-1.5 text-[11px] text-hud-muted">
      <History size={11} className="shrink-0" />
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
 * One answer in the thread. Live: the newest, with its verbs. Settled: an
 * earlier one, dimmed below a hairline, for re-reading only.
 */
function AnswerBlock({
  answer,
  live,
  ready,
  needsModel,
  onThinkDeeper,
  onClear,
  onConfigure,
}: {
  answer: AssistAnswer;
  live: boolean;
  ready: boolean;
  needsModel: boolean;
  onThinkDeeper: (question: string) => void;
  onClear: () => void;
  onConfigure: () => void;
}) {
  const { t } = useTranslation();
  const [copied, copy] = useCopy();
  const { form, body, sayLine, blocks } = useMemo(
    () => parseAssistAnswer(answer.text),
    [answer.text]
  );
  // Words to say copy as the words, never the fences around them.
  const copyText = form === "say" ? sayAnswerText({ blocks, body }) : answer.text;
  // A lead-in whose block has not arrived yet is shown only while it still
  // may — once the answer has settled an empty block is nothing to show.
  const shownBlocks = blocks.filter((block) => block.text || (answer.streaming && block.open));

  const renderSayBlock = (block: (typeof blocks)[number], index: number) => (
    <div key={index}>
      {block.lead && <p className="mb-1 text-[11px] text-hud-muted">{block.lead}</p>}
      <SayLine
        text={block.text}
        label={t(
          index === 0 ? "notes.meetingPanel.answer.sayLine" : "notes.meetingPanel.answer.altLine"
        )}
        streaming={answer.streaming && block.open}
      />
    </div>
  );

  // What the answer read beyond the meeting; nothing for a plain fast answer.
  const provenance = describeAnswerSources(
    {
      searched: answer.searched === true,
      screens: answer.screens ?? 0,
      sources: answer.sources,
      mode: answer.mode,
    },
    {
      searchedWeb: t("notes.meetingPanel.answer.searchedWeb"),
      viewedScreens: (count) => t("notes.meetingPanel.answer.viewedScreen", { count }),
      from: t("notes.meetingPanel.sourcesLabel"),
      checkedNotes: t("notes.meetingPanel.answer.checkedNotes"),
    }
  );
  const webSources = (answer.webSources ?? []).slice(0, MAX_WEB_SOURCES);

  return (
    <article className={cn(!live && "mt-3 border-t border-hud-border pt-3 opacity-70")}>
      {/* The question, as one muted line: the answer under it never needs a
          label saying what it answers. */}
      <p className="truncate text-[12px] font-medium text-hud-muted" title={answer.question}>
        {answer.question}
      </p>

      {answer.errorKey ? (
        <>
          <p className="mt-1.5 text-[13px] leading-relaxed text-hud-warning">
            {t(answer.errorKey)}
          </p>
          {/* A missing model is not retryable — the fix lives in Settings. */}
          {needsModel && (
            <button type="button" onClick={onConfigure} className={cn(ghostButtonClass, "mt-1.5")}>
              <Settings2 size={11} />
              {t("notes.meetingPanel.ask.configureModels")}
            </button>
          )}
        </>
      ) : answer.streaming && !answer.text ? (
        /* Thinking pays its latency up front, in retrieval, before a single
           token exists; fast is simply waiting for the first one. */
        <p className="mt-1.5 animate-pulse text-[13px] leading-relaxed text-hud-muted">
          {answer.mode === "thinking" ? t("notes.meetingPanel.ask.searchingNotes") : "…"}
        </p>
      ) : form === "say" ? (
        /* Words to say: the say block first, the reasons under it as
           markdown, then a second block when the model offered a firmer or
           softer version under its lead-in. Streams straight into the
           block; the open one carries the caret, else the reasons do. */
        <div className="mt-1.5 space-y-2">
          {shownBlocks.slice(0, 1).map((block) => renderSayBlock(block, 0))}
          {body && (
            <div className="text-[13px] leading-relaxed text-hud-foreground/90">
              <Markdown components={ANSWER_MARKDOWN_COMPONENTS}>{body}</Markdown>
              {answer.streaming && !blocks.some((block) => block.open) && (
                <span className="ml-0.5 inline-block h-3 w-[2px] translate-y-[2px] animate-pulse bg-hud-accent" />
              )}
            </div>
          )}
          {shownBlocks.slice(1).map((block, index) => renderSayBlock(block, index + 1))}
        </div>
      ) : (
        <>
          {body && (
            <div className="mt-1.5 text-[14px] leading-relaxed text-hud-foreground/90">
              <Markdown components={ANSWER_MARKDOWN_COMPONENTS}>{body}</Markdown>
              {/* The caret is the only "it is working" signal an answer
                  needs: the text itself is the progress bar. */}
              {answer.streaming && !sayLine && (
                <span className="ml-0.5 inline-block h-3 w-[2px] translate-y-[2px] animate-pulse bg-hud-accent" />
              )}
            </div>
          )}
          {sayLine && (
            <div className={cn(body ? "mt-2" : "mt-1.5")}>
              <SayLine text={sayLine} label={t("notes.meetingPanel.answer.sayLine")} />
            </div>
          )}
        </>
      )}

      {/* The live end's footer: where the answer came from, and its verbs.
          Quiet text, no fills — present but never louder than the answer.
          Hidden while streaming: the one action that matters then is reading. */}
      {live && !answer.streaming && (
        <div className="mt-2 flex items-center gap-0.5">
          {provenance && (
            <p
              className="min-w-0 flex-1 truncate pr-2 text-[11px] text-hud-muted"
              title={answer.sources.map((source) => source.title).join(", ")}
            >
              {provenance}
            </p>
          )}
          {!provenance && <span className="flex-1" />}
          {/* The escalation, only on a settled fast answer: the "that was not
              in this meeting" next step. Re-asks the same question over the
              notes with this draft attached. */}
          {!answer.errorKey && answer.mode === "fast" && (
            <button
              type="button"
              onClick={() => onThinkDeeper(answer.question)}
              disabled={!ready}
              title={t("notes.meetingPanel.ask.thinkDeeperHint")}
              className={ghostButtonClass}
            >
              <Brain size={11} />
              {t("notes.meetingPanel.ask.thinkDeeper")}
            </button>
          )}
          {!answer.errorKey && (
            <button
              type="button"
              onClick={() => copy(copyText)}
              aria-label={copied ? t("common.copied") : t("common.copy")}
              title={copied ? t("common.copied") : t("common.copy")}
              className={cn(iconButtonClass, "size-6", copied && "text-hud-accent")}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          )}
          <button
            type="button"
            onClick={onClear}
            aria-label={t("notes.meetingPanel.thread.clear")}
            title={t("notes.meetingPanel.thread.clear")}
            className={cn(iconButtonClass, "size-6")}
          >
            <Eraser size={12} />
          </button>
        </div>
      )}

      {/* What the search read, as links: the text names the source in words
          and never carries a URL, so this row is where the page itself is. */}
      {live && !answer.streaming && !answer.errorKey && webSources.length > 0 && (
        <ul
          className="mt-1.5 flex flex-wrap items-center gap-1"
          aria-label={t("notes.meetingPanel.webSearch.sources")}
        >
          {webSources.map((source) => (
            <li key={source.url}>
              <button
                type="button"
                onClick={() => void window.electronAPI?.openExternal(source.url)}
                title={source.url}
                className={cn(ghostButtonClass, "max-w-[200px]")}
              >
                <ExternalLink size={10} className="shrink-0 opacity-70" />
                <span className="truncate">{sourceLabel(source)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/**
 * "Observe my screen", in the toolbar: the eye, and — only when there is
 * more than one display — which screen(s) it watches.
 *
 * On, every answer carries a screenshot of every display (the meeting is on
 * whichever screen this card is not, and the model is what can tell which).
 * The eye turns warning-colored when the OS has not granted screen access,
 * because an eye that is on while nothing is captured is the single most
 * confusing state this feature has; clicking it then re-requests access.
 */
function ObserveControls() {
  const { t } = useTranslation();
  const observe = useSettingsStore((s) => s.meetingScreenObserve);
  const setObserve = useSettingsStore((s) => s.setMeetingScreenObserve);
  const target = useSettingsStore((s) => s.meetingScreenObserveTarget);
  const setTarget = useSettingsStore((s) => s.setMeetingScreenObserveTarget);
  const [access, setAccess] = useState<ScreenRecordingAccessResult | null>(null);
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    const api = window.electronAPI;
    const [nextAccess, nextDisplays] = await Promise.all([
      api?.checkScreenRecordingAccess?.().catch(() => null) ?? null,
      api?.listDisplays?.().catch(() => []) ?? [],
    ]);
    if (nextAccess) setAccess(nextAccess);
    setDisplays(Array.isArray(nextDisplays) ? nextDisplays : []);
  }, []);

  useEffect(() => {
    if (observe) void refresh();
  }, [observe, refresh]);

  const blocked = observe && !!access && (!access.granted || !access.supported);
  const relaunch = observe && !!access?.granted && !!access.needsRelaunch;

  const toggle = useCallback(async () => {
    if (observe && !blocked) {
      setObserve(false);
      return;
    }
    // Turning on (or clicking a blocked eye) is the moment to ask the OS:
    // on macOS this registers the app under Screen Recording and opens the
    // pane; elsewhere it resolves granted at once.
    setObserve(true);
    const result = await window.electronAPI?.requestScreenRecordingAccess?.().catch(() => null);
    if (result) setAccess(result);
    void refresh();
  }, [observe, blocked, setObserve, refresh]);

  const hint = !observe
    ? t("notes.meetingPanel.observe.enable")
    : access && !access.supported
      ? t("notes.meetingPanel.observe.unsupported")
      : blocked
        ? t("notes.meetingPanel.observe.needsAccess")
        : relaunch
          ? t("notes.meetingPanel.observe.needsRelaunch")
          : t("notes.meetingPanel.observe.disable");

  const chosen = displays.find((display) => `display:${display.id}` === target);
  const targetLabel = chosen
    ? t("notes.meetingPanel.observe.screen", { n: chosen.index + 1 })
    : t("notes.meetingPanel.observe.allScreens");

  const rowClass = cn(
    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px]",
    "text-hud-foreground/90 transition-colors duration-100 hover:bg-white/10",
    "focus-visible:outline-none focus-visible:bg-white/10"
  );

  return (
    <>
      <button
        type="button"
        onClick={() => void toggle()}
        aria-pressed={observe}
        aria-label={hint}
        title={hint}
        className={cn(
          iconButtonClass,
          observe && !blocked && "bg-hud-accent/20 text-hud-accent hover:bg-hud-accent/30",
          blocked && "bg-hud-warning/15 text-hud-warning hover:bg-hud-warning/25",
          relaunch && "text-hud-warning"
        )}
      >
        {observe ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>

      {observe && !blocked && displays.length > 1 && (
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            // A display plugged in mid-meeting shows up the next time the
            // picker opens, without a toggle of the eye.
            if (next) void refresh();
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              title={t("notes.meetingPanel.observe.chooseScreen")}
              aria-label={t("notes.meetingPanel.observe.chooseScreen")}
              className={cn(ghostButtonClass, "h-7 text-[11px]")}
            >
              <Monitor size={11} />
              <span className="max-w-[88px] truncate">{targetLabel}</span>
              <ChevronDown size={10} className="opacity-70" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className={cn("w-56 p-1.5", hudPopoverClass)}>
            <p className="px-2 pb-1 pt-0.5 text-[11px] uppercase tracking-[0.06em] text-hud-muted">
              {t("notes.meetingPanel.observe.chooseScreen")}
            </p>
            <button
              type="button"
              className={rowClass}
              onClick={() => {
                setTarget("all");
                setOpen(false);
              }}
            >
              <span className="min-w-0 flex-1 truncate">
                {t("notes.meetingPanel.observe.allScreens")}
              </span>
              {!chosen && <Check size={12} className="shrink-0 text-hud-accent" />}
            </button>
            {displays.map((display) => (
              <button
                key={display.id}
                type="button"
                className={rowClass}
                onClick={() => {
                  setTarget(`display:${display.id}`);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1 truncate">
                  {t("notes.meetingPanel.observe.screen", { n: display.index + 1 })}
                  {display.primary && (
                    <span className="text-hud-muted">
                      {" · "}
                      {t("notes.meetingPanel.observe.primary")}
                    </span>
                  )}
                </span>
                <span data-numeric className="shrink-0 text-[11px] text-hud-muted">
                  {display.width}×{display.height}
                </span>
                {chosen?.id === display.id && (
                  <Check size={12} className="shrink-0 text-hud-accent" />
                )}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </>
  );
}

interface MeetingPanelOverlayProps {
  /**
   * The toolbar's natural width in CSS px, whenever it changes — the card's
   * own window uses it as its minimum width, since a toolbar clipped at the
   * right loses the Transcript button and the X (client, 2026-09-23).
   */
  onToolbarWidth?: (px: number) => void;
}

/** The toolbar row's natural width: its clusters at full size, the drag gap
 *  at its minimum, plus the row's padding and gaps. Pure over DOM measures. */
function measureToolbarWidth(toolbar: HTMLElement): number {
  const style = getComputedStyle(toolbar);
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const gap = parseFloat(style.columnGap) || 0;
  const children = Array.from(toolbar.children) as HTMLElement[];
  let width = padding + gap * Math.max(0, children.length - 1);
  for (const child of children) {
    if (child.dataset.dragGap !== undefined) {
      width += parseFloat(getComputedStyle(child).minWidth) || 0;
    } else {
      width += child.getBoundingClientRect().width;
    }
  }
  return Math.ceil(width) + 2;
}

export default function MeetingPanelOverlay({ onToolbarWidth }: MeetingPanelOverlayProps = {}) {
  const { t } = useTranslation();
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar || !onToolbarWidth) return;
    let last = 0;
    const report = () => {
      const width = measureToolbarWidth(toolbar);
      if (width !== last) {
        last = width;
        onToolbarWidth(width);
      }
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(toolbar);
    for (const child of Array.from(toolbar.children)) observer.observe(child);
    return () => observer.disconnect();
  });
  const [snapshot, setSnapshot] = useState<MeetingPanelSnapshot | null>(null);
  /**
   * Null until the control panel has actually said something, so "no model
   * is configured" and "not heard from yet" stay distinct states — only the
   * first may tell the user to go set something up.
   */
  const [assist, setAssist] = useState<MeetingAssistState | null>(null);
  const [level, setLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [question, setQuestion] = useState("");
  // Per-meeting, not persisted: fast has to be what the next meeting opens
  // on, or "instant by default" only holds until someone tries thinking once.
  const [mode, setMode] = useState<AssistMode>("fast");
  const [isCompact, setIsCompact] = useState(false);

  const threadRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // The window loads after the meeting has already started, so the state it
    // missed is fetched once rather than waited for. Both are caught: on a
    // dev run where main predates a channel the invoke rejects, and an
    // unhandled rejection is a worse way to learn that than a quiet card.
    void window.electronAPI
      ?.meetingPanelGetState?.()
      .then((initial) => {
        if (initial) setSnapshot(initial);
      })
      .catch(() => {});
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

  // The card is resizable down to a bar. Rather than two components, the
  // thread drops out below a height where it would be unreadable anyway.
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

  // Newest first: a new question puts its answer at the top, right under the
  // field it was typed in, so the thread scrolls back to the top for it.
  useEffect(() => {
    threadRef.current?.scrollTo({ top: 0 });
  }, [assist?.answer?.question]);

  const send = useCallback(async (command: MeetingPanelCommand) => {
    setIsBusy(true);
    try {
      await window.electronAPI?.meetingPanelCommand?.(command);
    } finally {
      setIsBusy(false);
    }
  }, []);

  const ask = useCallback((text: string, askMode: AssistMode) => {
    void window.electronAPI?.meetingPanelAsk?.(text, askMode);
  }, []);

  const submitQuestion = useCallback(() => {
    const trimmed = question.trim();
    if (!trimmed) return;
    // Cleared optimistically: leaving the question in the box invites a
    // second identical send while the first streams.
    setQuestion("");
    ask(trimmed, mode);
  }, [question, mode, ask]);

  if (!snapshot?.isRecording) return null;

  const isPaused = snapshot.isPaused;
  const isWaitingForMic =
    !isPaused && (snapshot.micStatus === "reconnecting" || snapshot.micStatus === "unavailable");

  const title = snapshot.title ?? t("notes.meeting.stopDialog.untitled");
  const pauseLabel = isPaused ? t("notes.meeting.resume") : t("notes.meeting.pause");
  const stopLabel = t("notes.editor.stop");
  const transcriptLabel = t("notes.meetingPanel.transcript.show");

  // Says what is actually being captured — the clock's tooltip. A meeting
  // running on system audio alone after the mic dropped must not claim a mic.
  const sourceLabel = isPaused
    ? t("notes.meetingPanel.sources.paused")
    : isWaitingForMic
      ? t("notes.meetingPill.waitingForMicrophone")
      : snapshot.systemAudio
        ? t("notes.meetingPanel.sources.both")
        : t("notes.meetingPanel.sources.micOnly");

  const suggestion = assist?.suggestion ?? null;
  const answer = assist?.answer ?? null;
  // Guarded: an assist payload from a main process that predates history
  // (dev live-reload) simply renders a thread of one.
  const history = assist?.answerHistory ?? [];
  const assistReady = assist?.configured === true;
  const assistNeedsModel = assist?.configured === false;
  const hasThread = !!answer || history.length > 0;

  const quickActions: Array<{ label: string; mode: AssistMode; icon: typeof Sparkles }> = [
    { label: t("notes.meetingPanel.quickActions.whatToSay"), mode: "fast", icon: Sparkles },
    { label: t("notes.meetingPanel.quickActions.recap"), mode: "thinking", icon: History },
    ...(assist?.lastTime
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
    <div
      className="meeting-panel-window flex h-full w-full flex-col bg-transparent p-1"
      style={drag}
    >
      <div
        className={cn(
          "hud-surface flex h-full w-full flex-col overflow-hidden rounded-[13px]",
          isWaitingForMic ? "hud-surface-warn" : !isPaused && "hud-surface-live"
        )}
      >
        {/* ---- 1. The ask bar ------------------------------------------ */}
        <form
          style={noDrag}
          className={cn(
            "mx-2 mt-2 flex shrink-0 items-center gap-2 rounded-xl bg-white/[0.08] py-1.5 pl-3 pr-1.5",
            "transition-colors duration-150 focus-within:bg-white/[0.12]"
          )}
          onSubmit={(event) => {
            event.preventDefault();
            submitQuestion();
          }}
        >
          <input
            ref={inputRef}
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
              "input-inline h-7 min-w-0 flex-1 bg-transparent p-0 text-[14px] text-hud-foreground outline-none",
              "placeholder:text-hud-muted disabled:cursor-not-allowed"
            )}
          />
          {/* A return keycap until there is something to send, then the
              accent send button: the affordance says what Enter does. */}
          {question.trim() ? (
            <button
              type="submit"
              disabled={!assistReady}
              aria-label={t("notes.meetingPanel.ask.send")}
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-lg",
                "bg-hud-accent text-hud-surface transition-colors duration-150 hover:bg-hud-accent/85",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-accent/70",
                "disabled:bg-white/10 disabled:text-hud-muted"
              )}
            >
              <SendHorizontal size={13} />
            </button>
          ) : (
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-hud-muted"
            >
              <CornerDownLeft size={12} />
            </span>
          )}
        </form>

        {/* The named verbs, as ghost chips right under the field they feed.
            Each label IS the question sent. */}
        {!isCompact && (
          <div style={noDrag} className="flex shrink-0 flex-wrap items-center gap-0.5 px-2 pt-1.5">
            {quickActions.map(({ label, mode: askMode, icon: Icon }) => (
              <button
                key={label}
                type="button"
                onClick={() => ask(label, askMode)}
                disabled={!assistReady}
                className={ghostButtonClass}
              >
                <Icon size={11} className="text-hud-accent/90" />
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ---- 2. The thread ------------------------------------------- */}
        {!isCompact && (
          <div
            ref={threadRef}
            style={noDrag}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-2 pt-2"
          >
            {/* The assistant's unprompted line: what you could say next,
                already computed by the time it appears (see useMeetingAssist).
                Dimmed rather than hidden once the conversation moves on —
                slightly old advice beats a blank when someone is waiting for
                you to speak. */}
            {suggestion && (
              <div className={cn("shrink-0", hasThread && "mb-3 border-b border-hud-border pb-3")}>
                {/* Its own heading and a quiet edge: beside an answer, the
                    unprompted line and the reply to a question were
                    indistinguishable (client, 2026-09-14) — the accent block
                    now always means "what you asked". */}
                <p className="mb-1 text-[12px] font-medium text-hud-muted">
                  {t("notes.meetingPanel.suggestion.heading")}
                </p>
                <SayLine
                  text={suggestion.text}
                  icon={Lightbulb}
                  tone="quiet"
                  dim={suggestion.stale}
                  label={t("notes.meetingPanel.suggestion.sayNext")}
                  title={
                    suggestion.sources.length > 0
                      ? `${t("notes.meetingPanel.sourcesLabel")} ${suggestion.sources
                          .map((source) => source.title)
                          .join(", ")}`
                      : t("notes.meetingPanel.suggestion.sayNext")
                  }
                />
              </div>
            )}

            {hasThread ? (
              <>
                {answer && (
                  <AnswerBlock
                    answer={answer}
                    live
                    ready={assistReady}
                    needsModel={assistNeedsModel}
                    onThinkDeeper={(text) => ask(text, "thinking")}
                    onClear={() => void send("clearAsks")}
                    onConfigure={() => void send("configureModels")}
                  />
                )}
                {/* Earlier answers, newest first below the live one, so
                    advice from ten minutes ago is one scroll away. */}
                {[...history].reverse().map((past, index) => (
                  <AnswerBlock
                    key={`${history.length - index}:${past.question}`}
                    answer={past}
                    live={false}
                    ready={assistReady}
                    needsModel={assistNeedsModel}
                    onThinkDeeper={(text) => ask(text, "thinking")}
                    onClear={() => void send("clearAsks")}
                    onConfigure={() => void send("configureModels")}
                  />
                ))}
              </>
            ) : (
              !suggestion && (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
                  <p className="text-[12px] leading-relaxed text-hud-muted">
                    {assistNeedsModel
                      ? t("notes.meetingPanel.ask.needsModel")
                      : !assistReady
                        ? t("notes.meetingPanel.ask.connecting")
                        : assist?.suggestionPending
                          ? t("notes.meetingPanel.suggestion.working")
                          : t("notes.meetingPanel.ask.empty")}
                  </p>
                  {assistNeedsModel && (
                    <button
                      type="button"
                      onClick={() => void send("configureModels")}
                      className={cn(ghostButtonClass, "bg-white/[0.08] text-hud-foreground/90")}
                    >
                      <Settings2 size={11} />
                      {t("notes.meetingPanel.ask.configureModels")}
                    </button>
                  )}
                  {assist?.lastTime && <LastTimeLine lastTime={assist.lastTime} />}
                </div>
              )
            )}
          </div>
        )}

        {/* ---- 3. The toolbar ------------------------------------------ */}
        <div
          ref={toolbarRef}
          data-cue-card-toolbar=""
          className={cn(
            "flex shrink-0 items-center gap-0.5 px-1.5 py-1.5",
            !isCompact && "border-t border-hud-border"
          )}
        >
          {/* Capture status: the level meter and the clock, the title and
              the audio sources as their tooltip. */}
          <span
            title={`${title} · ${sourceLabel}`}
            className="flex h-7 shrink-0 items-center gap-2 rounded-lg px-1.5"
          >
            {isWaitingForMic ? (
              <TriangleAlert size={12} className="shrink-0 text-hud-warning" />
            ) : (
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
                      isPaused ? "bg-hud-muted" : "bg-hud-accent"
                    )}
                    style={{ height: computeBarHeight(isPaused ? 0 : level, i) }}
                  />
                ))}
              </span>
            )}
            <span
              data-numeric
              className={cn(
                "text-[12px] font-semibold leading-none tracking-[0.01em]",
                isWaitingForMic ? "text-hud-warning" : "text-hud-muted"
              )}
            >
              {isPaused
                ? t("notes.meetingPanel.sources.paused")
                : formatMmSs(Math.floor(elapsedMs / 1000))}
            </span>
          </span>

          <span style={noDrag} className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => void send(isPaused ? "resume" : "pause")}
              disabled={isBusy}
              aria-label={pauseLabel}
              title={pauseLabel}
              className={iconButtonClass}
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
                "flex h-7 items-center justify-center gap-1.5 rounded-lg px-2.5",
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

          {/* The gap between the clusters is the drag handle. */}
          <span data-drag-gap="" className="min-w-2 flex-1" />

          {/* Never shrinks: the window is at least as wide as this row. */}
          <span style={noDrag} className="flex shrink-0 items-center gap-0.5">
            <ObserveControls />
            <WebSearchControl
              assist={assist}
              disabled={isBusy || !assistReady}
              onSend={(command) => void send(command)}
            />
            {/* Thinking: answers also search the past notes. An icon toggle,
                not a segmented control — fast is the default and the
                tooltip is where the trade is explained. */}
            <button
              type="button"
              onClick={() => setMode(mode === "thinking" ? "fast" : "thinking")}
              disabled={!assistReady}
              aria-pressed={mode === "thinking"}
              aria-label={t("notes.meetingPanel.mode.label")}
              title={
                mode === "thinking"
                  ? t("notes.meetingPanel.mode.thinkingOn")
                  : t("notes.meetingPanel.mode.thinkingOff")
              }
              className={cn(
                iconButtonClass,
                mode === "thinking" && "bg-hud-accent/20 text-hud-accent hover:bg-hud-accent/30"
              )}
            >
              <Brain size={13} />
            </button>
            {/* The chip writes the same chatIntelligence scope the app chat's
                chip writes — one brain, pickable from either surface — and
                stays enabled while the card says "needs model", because
                picking one is the fix. */}
            <ModelPickerChip scope="chatIntelligence" variant="hud" className="h-7" />
            {/* The transcript lives in the meeting's note, one click away:
                main surfaces the dashboard and the note opens on its
                transcript view. An icon only — the dashboard — with the
                label as its tooltip and accessible name: the toolbar is
                the card's tightest row, and a labeled button here took the
                room the model chip needs. */}
            <button
              type="button"
              onClick={() => void send("transcript")}
              title={transcriptLabel}
              className={ghostButtonClass}
            >
              <LayoutDashboard size={11} className="text-hud-accent/90" />
              {t("notes.meetingPanel.transcript.button")}
            </button>
            {/* In its own window (ASSISTANT_DOT) the card can be put away:
                the dot stays, glowing, and the menu brings the card back.
                Stop is the meeting's end; this is only the card's. */}
            {inOwnWindow && (
              <button
                type="button"
                onClick={() => void send("hide")}
                title={t("notes.meetingPanel.hide")}
                aria-label={t("notes.meetingPanel.hide")}
                className={iconButtonClass}
              >
                <X size={13} />
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
