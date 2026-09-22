import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "./lib/utils";
import { useBarSetupStatus } from "../hooks/useBarSetupStatus";
import { capturedMsAt, type MeetingPanelSnapshot } from "../utils/meetingPanelSnapshot";

/**
 * The assistant dot — the assistant bar reduced to one circle (ASSISTANT_DOT;
 * client direction 2026-09-21, after Kalypta's launch reel: one button, the
 * state at a glance).
 *
 * The `?agent=true` window is 96px of transparent glass with a 48px circle
 * in the middle; the margin is room for the glow. Idle, the circle is dark
 * with a grey wave glyph and nothing moves. While a meeting records the
 * glyph and edge take the app's cyan, a ring breathes outward and the bars
 * move — main sends the recording snapshot here as well as to the cue card.
 *
 * One click does the one thing the state allows: idle, it starts a meeting
 * (the same manual path as the hotkey and the old bar's Start meeting);
 * recording, it ends the session — the `stop` panel command, after which
 * main surfaces the control panel with Keep or Discard, exactly the flow
 * the card's Stop button takes. Right-click is the tray's menu, popped here.
 * The dot drags by hand (a press that moves is a drag, not a click) and
 * remembers its place. Everything the bar used to carry lives elsewhere:
 * the ask field in the app window, the settings in the menu.
 *
 * Setup that is still missing shows as a small amber badge; the tooltip
 * spells it out. A click still starts the meeting unless the speech model
 * itself is missing — transcription alone is a meeting worth recording —
 * and then it opens the setup guide instead.
 */

const DOT_POSITION_KEY = "assistantDotPosition";
/** A press that travels less than this is a click. */
const DRAG_THRESHOLD_PX = 4;
/** The download arc's geometry: a circle just outside the 48px dot. */
const ARC_RADIUS = 25;
const ARC_CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS;

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

function readDotPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(DOT_POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
    const x = Number(parsed?.x);
    const y = Number(parsed?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  } catch {
    return null;
  }
}

function saveDotPosition(x: number, y: number): void {
  try {
    localStorage.setItem(DOT_POSITION_KEY, JSON.stringify({ x, y }));
  } catch {
    /* a place that cannot persist is still kept for this run */
  }
}

export default function AssistantDot() {
  const { t } = useTranslation();

  // The recording snapshot main forwards here; null between meetings.
  const [snapshot, setSnapshot] = useState<MeetingPanelSnapshot | null>(null);
  useEffect(() => {
    let cancelled = false;
    void window.electronAPI
      ?.meetingPanelGetState?.()
      .then((initial) => {
        if (!cancelled && initial) setSnapshot(initial);
      })
      .catch(() => {});
    const unsubscribe = window.electronAPI?.onMeetingPanelState?.((next) =>
      setSnapshot(next ?? null)
    );
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);
  const isRecording = Boolean(snapshot?.isRecording);
  const isPaused = Boolean(snapshot?.isPaused);

  // The clock in the tooltip, from the snapshot's own timestamps so a
  // throttled window never loses time.
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    if (!snapshot?.isRecording) {
      setElapsedMs(0);
      return undefined;
    }
    const tick = () => setElapsedMs(capturedMsAt(snapshot, Date.now()));
    tick();
    if (snapshot.isPaused) return undefined;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [snapshot]);

  // Onboarding state lives in the control panel's localStorage; the storage
  // event keeps this window honest the moment setup finishes over there.
  const [setupComplete, setSetupComplete] = useState(
    () => localStorage.getItem("onboardingCompleted") === "true"
  );
  useEffect(() => {
    const sync = () => setSetupComplete(localStorage.getItem("onboardingCompleted") === "true");
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  // What is behind the dot, from main's sampler: on a dark backdrop the dot
  // goes light so it can be found (client, 2026-09-22).
  const [backdrop, setBackdrop] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onDotBackdrop?.((tone) => setBackdrop(tone));
    // Main sends a tone only when it changes, and the first one can land
    // before this listener exists (the window is shown as it loads), so ask
    // for what main already knows.
    let cancelled = false;
    window.electronAPI
      ?.getDotBackdrop?.()
      .then((tone) => {
        if (!cancelled && tone) setBackdrop(tone);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const { missing, download, downloadBlocksMeetingStart } = useBarSetupStatus();
  // Only a missing speech model blocks the start: without one there is
  // nothing to record into. A microphone flag that reads as missing is not
  // the same as no microphone (the flag is set by onboarding's permission
  // step, and the capture itself asks the OS) — the recording flow reports a
  // mic that truly fails, and the badge and tooltip still say so here.
  const startBlocked = missing.includes("speech");
  const setupSummary = missing.map((id) => t(`agentMode.bar.setup.${id}`)).join("\n");

  // The remembered place, applied once. Main's first summon would otherwise
  // put the dot in the corner; setting bounds tells it the dot is placed.
  useEffect(() => {
    const saved = readDotPosition();
    if (!saved) return;
    void window.electronAPI?.getOwnWindowBounds?.().then((bounds) => {
      if (!bounds) return;
      void window.electronAPI?.setOwnWindowBounds?.(saved.x, saved.y, bounds.width, bounds.height);
    });
  }, []);

  // Drag by hand. Screen coordinates, so the drag keeps tracking as the
  // window moves under the cursor; a press that travels is not a click.
  const suppressClickRef = useRef(false);
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.screenX;
    const startY = e.screenY;
    let bounds: { x: number; y: number; width: number; height: number } | null = null;
    let moved = false;
    let lastDx = 0;
    let lastDy = 0;
    void window.electronAPI?.getOwnWindowBounds?.().then((b) => {
      bounds = b;
    });
    const onMove = (ev: MouseEvent) => {
      lastDx = ev.screenX - startX;
      lastDy = ev.screenY - startY;
      if (!moved && Math.abs(lastDx) + Math.abs(lastDy) < DRAG_THRESHOLD_PX) return;
      if (!bounds) return;
      moved = true;
      void window.electronAPI?.setOwnWindowBounds?.(
        bounds.x + lastDx,
        bounds.y + lastDy,
        bounds.width,
        bounds.height
      );
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!moved) return;
      suppressClickRef.current = true;
      // The place actually taken, after main's clamp to the work area.
      void window.electronAPI?.getOwnWindowBounds?.().then((b) => {
        if (b) saveDotPosition(b.x, b.y);
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const handleClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (isRecording) {
      // Ends the session: main surfaces the control panel, where Keep or
      // Discard and the write-up follow — the card's Stop, from the dot.
      void window.electronAPI?.meetingPanelCommand?.("stop");
      return;
    }
    if (downloadBlocksMeetingStart) return;
    if (!setupComplete) {
      void window.electronAPI?.openControlPanel?.();
      return;
    }
    if (startBlocked) {
      // "setup" lands the panel on Home with the capabilities card open.
      void window.electronAPI?.openControlPanel?.("setup");
      return;
    }
    void window.electronAPI?.startManualMeeting?.();
  }, [isRecording, downloadBlocksMeetingStart, setupComplete, startBlocked]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    void window.electronAPI?.agentDotMenu?.();
  }, []);

  // Escape tucks the dot away between meetings, as it did the bar. Never
  // during one: the recording indicator stays on screen.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isRecording) return;
      event.preventDefault();
      void window.electronAPI?.hideAgentOverlay?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isRecording]);

  // The one verb the state allows, as the accessible name; the tooltip adds
  // what setup still needs.
  let label: string;
  if (isRecording) {
    label = t(isPaused ? "agentMode.dot.paused" : "agentMode.dot.endMeeting", {
      time: formatClock(elapsedMs),
    });
  } else if (downloadBlocksMeetingStart) {
    label = download
      ? download.isInstalling
        ? t("agentMode.bar.installing")
        : t("agentMode.bar.downloading", { percent: Math.round(download.percentage) })
      : t("agentMode.bar.preparing");
  } else if (!setupComplete) {
    label = t("agentMode.bar.finishSetupHint");
  } else if (startBlocked) {
    label = setupSummary;
  } else {
    label = t("agentMode.bar.startMeeting");
  }
  const title =
    !isRecording && setupComplete && missing.length > 0 && !startBlocked
      ? `${label}\n${setupSummary}`
      : label;

  const arcOffset = download
    ? ARC_CIRCUMFERENCE * (1 - Math.max(0, Math.min(100, download.percentage)) / 100)
    : ARC_CIRCUMFERENCE;

  return (
    // `dark` pins the hud tokens; the window is otherwise transparent and
    // the circle is the only thing drawn.
    <div className="agent-overlay-window dark flex h-screen w-screen select-none items-center justify-center bg-transparent">
      <button
        type="button"
        aria-label={label}
        title={title}
        data-recording={isRecording ? "true" : undefined}
        data-backdrop={backdrop ?? undefined}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={cn(
          "assistant-dot relative flex cursor-pointer items-center justify-center p-0",
          isRecording && "assistant-dot--rec",
          isRecording && isPaused && "assistant-dot--paused",
          backdrop === "dark" && "assistant-dot--on-dark"
        )}
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <line className="assistant-dot__bar" x1="4" y1="9" x2="4" y2="15" />
          <line className="assistant-dot__bar" x1="8" y1="6" x2="8" y2="18" />
          <line className="assistant-dot__bar" x1="12" y1="3" x2="12" y2="21" />
          <line className="assistant-dot__bar" x1="16" y1="7" x2="16" y2="17" />
          <line className="assistant-dot__bar" x1="20" y1="10" x2="20" y2="14" />
        </svg>
        {/* A speech-model download: a thin arc around the dot, filling as it
            lands. Shown for a download that blocks recording and for one
            that does not — the user asked for a model, and the dot is the
            one surface always on screen to answer "is it done yet". */}
        {download && (
          <svg
            className="pointer-events-none absolute -inset-[4px] -rotate-90"
            viewBox="0 0 56 56"
            aria-hidden="true"
            data-download={Math.round(download.percentage)}
          >
            <circle
              cx="28"
              cy="28"
              r={ARC_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={ARC_CIRCUMFERENCE}
              strokeDashoffset={arcOffset}
              className="text-hud-accent transition-[stroke-dashoffset] duration-300"
            />
          </svg>
        )}
        {/* Setup still missing: one amber badge. The tooltip says which piece. */}
        {!isRecording && missing.length > 0 && (
          <span
            data-setup-missing=""
            className="absolute -right-px -top-px size-3 animate-pulse rounded-full bg-warning ring-2 ring-hud-surface"
          />
        )}
      </button>
    </div>
  );
}
