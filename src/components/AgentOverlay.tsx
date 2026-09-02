import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { AppWindow, AudioLines, CornerDownLeft, Loader2, TriangleAlert, X } from "lucide-react";
import { cn } from "./lib/utils";
import { SETTINGS_SECTIONS } from "./settings/settingsNav";
import { filterBarPalette, groupBarPalette, type BarPaletteGroup } from "../utils/barPalette";
import MeetingPanelOverlay from "./MeetingPanelOverlay";
import { useBarSetupStatus } from "../hooks/useBarSetupStatus";
import { AgentTitleBar } from "./agent/AgentTitleBar";
import { AgentChat } from "./agent/AgentChat";
import { AgentInput } from "./agent/AgentInput";
import AudioManager from "../helpers/audioManager";
import { useChatPersistence } from "./chat/useChatPersistence";
import { useChatStreaming } from "./chat/useChatStreaming";
import { useChatMessageSender } from "./chat/useChatMessageSender";
import { useSettingsStore } from "../stores/settingsStore";
import type { ScreenContextImage } from "../types/electron";

const MIN_HEIGHT = 200;
const MIN_WIDTH = 360;
/** The cue card may be hand-shrunk further than the chat column — down to the
 *  header-only compact bar (MeetingPanelOverlay folds its panes below 140px).
 *  Matches AGENT_OVERLAY_CONFIG.minHeight, the window's hard floor. */
const MEETING_CARD_MIN_HEIGHT = 104;

/** The hand-set cue card size, remembered across meetings (and app runs). */
const MEETING_CARD_SIZE_KEY = "meetingCardSize";

function readMeetingCardSize(): { width: number; height: number } | null {
  try {
    const raw = localStorage.getItem(MEETING_CARD_SIZE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { width?: unknown; height?: unknown };
    const width = Number(parsed?.width);
    const height = Number(parsed?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    return { width, height };
  } catch {
    return null;
  }
}

function saveMeetingCardSize(width: number, height: number): void {
  try {
    localStorage.setItem(MEETING_CARD_SIZE_KEY, JSON.stringify({ width, height }));
  } catch {
    /* a size that cannot persist is still applied for this meeting */
  }
}

/**
 * The window-edge resize grips, shared by the chat column and the cue card.
 * no-drag explicitly: the cue card's whole surface is a drag region, and a
 * grip that drags the window instead of resizing it is a grip that lies.
 */
function ResizeHandles({
  onResizeStart,
}: {
  onResizeStart: (e: React.MouseEvent, direction: string) => void;
}) {
  const noDrag = { WebkitAppRegion: "no-drag" } as React.CSSProperties;
  return (
    <>
      {/* Edges */}
      <div
        className="absolute top-0 left-2 right-2 h-[5px] cursor-n-resize"
        style={noDrag}
        onMouseDown={(e) => onResizeStart(e, "n")}
      />
      <div
        className="absolute bottom-0 left-2 right-2 h-[5px] cursor-s-resize"
        style={noDrag}
        onMouseDown={(e) => onResizeStart(e, "s")}
      />
      <div
        className="absolute left-0 top-2 bottom-2 w-[5px] cursor-w-resize"
        style={noDrag}
        onMouseDown={(e) => onResizeStart(e, "w")}
      />
      <div
        className="absolute right-0 top-2 bottom-2 w-[5px] cursor-e-resize"
        style={noDrag}
        onMouseDown={(e) => onResizeStart(e, "e")}
      />
      {/* Corners */}
      <div
        className="absolute top-0 left-0 w-[10px] h-[10px] cursor-nw-resize"
        style={noDrag}
        onMouseDown={(e) => onResizeStart(e, "nw")}
      />
      <div
        className="absolute top-0 right-0 w-[10px] h-[10px] cursor-ne-resize"
        style={noDrag}
        onMouseDown={(e) => onResizeStart(e, "ne")}
      />
      <div
        className="absolute bottom-0 left-0 w-[10px] h-[10px] cursor-sw-resize"
        style={noDrag}
        onMouseDown={(e) => onResizeStart(e, "sw")}
      />
      <div
        className="absolute bottom-0 right-0 w-[10px] h-[10px] cursor-se-resize"
        style={noDrag}
        onMouseDown={(e) => onResizeStart(e, "se")}
      />
    </>
  );
}

/** The collapsed bar: an ask field over a control strip — two rows, sized so
 *  the field is readable at a glance. Must match AGENT_OVERLAY_CONFIG.minHeight. */
const BAR_HEIGHT = 104;
/** The bar with its palette open: room for every action and settings row. */
const PALETTE_HEIGHT = 440;
/** First expansion; a hand-resized height is remembered over this. */
const DEFAULT_EXPANDED_HEIGHT = 480;
/** The cue card the bar morphs into while a meeting records. */
const MEETING_CARD_HEIGHT = 520;

export default function AgentOverlay() {
  const { t } = useTranslation();
  const [partialTranscript, setPartialTranscript] = useState("");
  const [barText, setBarText] = useState("");
  // Whether the overlay's own AudioManager is capturing. Tracked here because
  // streaming's agentState never enters "listening" — that state belongs to
  // the model turn, and voice capture happens before a turn exists.
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const isVoiceRecordingRef = useRef(false);
  useEffect(() => {
    isVoiceRecordingRef.current = isVoiceRecording;
  }, [isVoiceRecording]);
  const audioManagerRef = useRef<InstanceType<typeof AudioManager> | null>(null);
  const agentStateRef = useRef<string>("idle");
  const barInputRef = useRef<HTMLInputElement | null>(null);

  const agentScreenContext = useSettingsStore((s) => s.agentScreenContext);
  const agentScreenContextPrompted = useSettingsStore((s) => s.agentScreenContextPrompted);
  const setAgentScreenContext = useSettingsStore((s) => s.setAgentScreenContext);
  const setAgentScreenContextPrompted = useSettingsStore((s) => s.setAgentScreenContextPrompted);

  const persistence = useChatPersistence();
  const { messages, setMessages, handleNewChat: persistenceNewChat } = persistence;

  const streaming = useChatStreaming({
    messages,
    setMessages,
    surface: "agent-overlay",
    onStreamComplete: (_assistantId, content, toolCalls, sources) => {
      persistence.saveAssistantMessage(content, toolCalls, sources);
    },
  });

  const { agentState } = streaming;

  useEffect(() => {
    agentStateRef.current = agentState;
  }, [agentState]);

  const addSystemMessage = useCallback(
    (content: string) => {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant" as const, content, isStreaming: false },
      ]);
    },
    [setMessages]
  );

  const createConversation = useCallback(
    () => persistence.createConversation(t("agentMode.titleBar.newChat")),
    [persistence, t]
  );
  const updateFirstMessageTitle = useCallback(
    ({
      conversationId,
      text,
      isFirstMessage,
    }: {
      conversationId: number;
      text: string;
      isFirstMessage: boolean;
    }) => {
      if (!isFirstMessage) return;
      const title = text.slice(0, 50) + (text.length > 50 ? "..." : "");
      window.electronAPI?.updateAgentConversationTitle?.(conversationId, title);
    },
    []
  );
  const sendMessage = useChatMessageSender({
    conversationId: persistence.conversationId,
    persistence,
    streaming,
    createConversation,
    onMessagePersisted: updateFirstMessageTitle,
  });

  /**
   * One send path for typed and spoken questions. The screenshot is captured
   * at send time (the screen the question is about is the one on display now),
   * attached only when the user opted in, and never blocks the question — a
   * failed capture sends text alone.
   */
  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      let screenContext: ScreenContextImage | undefined;
      if (useSettingsStore.getState().agentScreenContext) {
        try {
          screenContext = (await window.electronAPI?.captureScreenContext?.()) ?? undefined;
        } catch {
          screenContext = undefined;
        }
      }
      // No lane option: the bar is global chat over every meeting and note,
      // so it always gets the full chat model — a mode chooser here only
      // offered a way to get a worse answer.
      await sendMessage(text, screenContext ? { screenContext } : undefined);
    },
    [sendMessage]
  );

  const handleTranscriptionComplete = useCallback(
    async (text: string) => {
      if (text.trim()) await handleSend(text);
    },
    [handleSend]
  );
  const handleTranscriptionCompleteRef = useRef(handleTranscriptionComplete);
  useEffect(() => {
    handleTranscriptionCompleteRef.current = handleTranscriptionComplete;
  }, [handleTranscriptionComplete]);

  useEffect(() => {
    const am = new AudioManager();
    am.setSkipReasoning(true);
    am.setContext("agent");
    am.setCallbacks({
      onStateChange: () => {},
      onError: (error: { message?: string }) => {
        const msg = error?.message || (typeof error === "string" ? error : "Transcription failed");
        setIsVoiceRecording(false);
        setPartialTranscript("");
        addSystemMessage(`${t("agentMode.chat.errorPrefix")}: ${msg}`);
      },
      onTranscriptionComplete: (result: { text: string }) => {
        setIsVoiceRecording(false);
        setPartialTranscript("");
        handleTranscriptionCompleteRef.current(result.text);
      },
      onPartialTranscript: (text: string) => {
        setPartialTranscript(text);
      },
      onStreamingCommit: undefined,
      onTranslationFallback: undefined,
    });
    audioManagerRef.current = am;
    return () => {
      am.cleanup?.();
      window.removeEventListener("api-key-changed", (am as any)._onApiKeyChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addSystemMessage]);

  const startVoice = useCallback(() => {
    audioManagerRef.current?.startRecording();
    setIsVoiceRecording(true);
  }, []);
  const stopVoice = useCallback(() => {
    audioManagerRef.current?.stopRecording();
    setIsVoiceRecording(false);
  }, []);

  // While a meeting records, this window IS the cue card: main forwards the
  // recording snapshot here and the bar morphs in place. MeetingPanelOverlay
  // subscribes to the full state itself; the bar only needs the edge.
  const [meetingActive, setMeetingActive] = useState(false);
  const meetingActiveRef = useRef(false);
  useEffect(() => {
    meetingActiveRef.current = meetingActive;
  }, [meetingActive]);
  useEffect(() => {
    let cancelled = false;
    window.electronAPI
      ?.meetingPanelGetState?.()
      .then((snapshot) => {
        if (!cancelled) setMeetingActive(Boolean(snapshot?.isRecording));
      })
      .catch(() => {});
    const unsubscribe = window.electronAPI?.onMeetingPanelState?.((snapshot) =>
      setMeetingActive(Boolean(snapshot?.isRecording))
    );
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // Bar or chat column. Derived, not toggled: a conversation on screen is
  // what makes the tall window worth its pixels, and "New chat" collapsing
  // back to the bar falls out for free. Voice capture deliberately does not
  // expand — the bar itself shows the listening state, and the window grows
  // when the answer exists to fill it.
  const expanded = messages.length > 0 || (agentState !== "idle" && agentState !== "listening");

  // The command palette: clicking the ask field reveals the app's map —
  // actions and settings destinations — as a detached card under the bar,
  // the way the reference product's dropdown opens. Closed by Escape, the
  // card's X, activating a row, sending an ask, losing focus (input blur and
  // window blur), and the chat expanding over it. Blur-close is safe only
  // because the bar card is pinned to the window's top at a fixed height:
  // when the window shrinks back, no button moves under the cursor, so a
  // click on the control strip that caused the blur still lands.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteOpenRef = useRef(false);
  useEffect(() => {
    paletteOpenRef.current = paletteOpen;
  }, [paletteOpen]);
  useEffect(() => {
    if (expanded || meetingActive) setPaletteOpen(false);
  }, [expanded, meetingActive]);
  // Hiding the window (X, second Escape, tray) folds the palette with it, so
  // the next summon is the clean two-row bar, not a stale open menu — and a
  // focus loss to another app folds it the same way.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") setPaletteOpen(false);
    };
    const onWindowBlur = () => {
      setPaletteOpen(false);
      // Drop the field's element focus too. Without this the input silently
      // stays the window's focused element, so ANY later click on the bar
      // re-activates the window, Chromium restores focus to the input, and
      // the palette pops back open on every bar click.
      barInputRef.current?.blur();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, []);

  // The window follows the mode. Height is remembered across one
  // expand-collapse cycle so a hand-resized chat column comes back at the
  // size the user gave it, not the default.
  const lastExpandedHeightRef = useRef(DEFAULT_EXPANDED_HEIGHT);
  // Which shape the window was last asked to take. The palette opens and
  // closes with an instant window resize — a menu pops, it does not stretch —
  // while the other transitions are morphs and keep the animated path.
  const lastModeRef = useRef<"bar" | "palette" | "expanded" | "meeting">("bar");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const bounds = await window.electronAPI?.getAgentWindowBounds?.();
      if (cancelled) return;
      const width = bounds?.width ?? 560;
      const from = lastModeRef.current;
      if (meetingActive) {
        lastModeRef.current = "meeting";
        // The cue card comes back at the size a hand last gave it.
        const saved = readMeetingCardSize();
        window.electronAPI?.resizeAgentWindow?.(
          saved?.width ?? width,
          saved?.height ?? MEETING_CARD_HEIGHT
        );
      } else if (expanded) {
        lastModeRef.current = "expanded";
        window.electronAPI?.resizeAgentWindow?.(width, lastExpandedHeightRef.current);
      } else if (paletteOpen) {
        lastModeRef.current = "palette";
        window.electronAPI?.resizeAgentWindow?.(width, PALETTE_HEIGHT, { animate: false });
      } else {
        // Only a height the chat column actually held is worth remembering —
        // keyed on where the window came FROM, so a cue card's or palette's
        // height never becomes the chat's next opening size.
        if (from === "expanded" && bounds?.height && bounds.height > BAR_HEIGHT) {
          lastExpandedHeightRef.current = bounds.height;
        }
        lastModeRef.current = "bar";
        window.electronAPI?.resizeAgentWindow?.(width, BAR_HEIGHT, {
          animate: from !== "palette",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expanded, meetingActive, paletteOpen]);

  const handleResizeStart = useCallback((e: React.MouseEvent, direction: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.screenX;
    const startY = e.screenY;

    window.electronAPI?.getAgentWindowBounds?.().then((bounds) => {
      if (!bounds) return;
      const startBounds = { ...bounds };

      const handleMouseMove = (ev: MouseEvent) => {
        const dx = ev.screenX - startX;
        const dy = ev.screenY - startY;
        let { x, y, width, height } = startBounds;

        if (direction.includes("e")) width += dx;
        if (direction.includes("w")) {
          x += dx;
          width -= dx;
        }
        if (direction.includes("s")) height += dy;
        if (direction.includes("n")) {
          y += dy;
          height -= dy;
        }

        width = Math.max(MIN_WIDTH, width);
        height = Math.max(meetingActiveRef.current ? MEETING_CARD_MIN_HEIGHT : MIN_HEIGHT, height);

        window.electronAPI?.setAgentWindowBounds?.(x, y, width, height);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        // The size a hand gives the cue card is the size the next meeting
        // morph should honor.
        if (meetingActiveRef.current) {
          void window.electronAPI?.getAgentWindowBounds?.().then((b) => {
            if (b) saveMeetingCardSize(b.width, b.height);
          });
        }
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Never while recording: a stray Escape must not hide the one on-screen
      // indicator that a meeting is being captured.
      if (e.key !== "Escape" || meetingActiveRef.current) return;
      // Escape peels one layer at a time: first the palette, then the window.
      if (paletteOpenRef.current) {
        setPaletteOpen(false);
        return;
      }
      window.electronAPI?.hideAgentOverlay?.();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const unsubStart = window.electronAPI?.onAgentStartRecording?.(() => {
      startVoice();
    });

    const unsubStop = window.electronAPI?.onAgentStopRecording?.(() => {
      stopVoice();
    });

    const unsubToggle = window.electronAPI?.onAgentToggleRecording?.(() => {
      if (isVoiceRecordingRef.current) {
        stopVoice();
      } else if (agentStateRef.current === "idle") {
        startVoice();
      }
    });

    return () => {
      unsubStart?.();
      unsubStop?.();
      unsubToggle?.();
    };
  }, [startVoice, stopVoice]);

  const handleNewChat = useCallback(() => {
    persistenceNewChat();
    setPartialTranscript("");
    streaming.cancelStream();
  }, [persistenceNewChat, streaming]);

  const handleClose = useCallback(() => {
    window.electronAPI?.hideAgentOverlay?.();
  }, []);

  const handleBarSubmit = useCallback(() => {
    const text = barText.trim();
    if (!text) return;
    setBarText("");
    setPaletteOpen(false);
    void handleSend(text);
  }, [barText, handleSend]);

  const handleListen = useCallback(() => {
    // Main takes it from here: the meeting starts, the panel opens where this
    // bar is, and this window is hidden by the same hand that opened the panel.
    void window.electronAPI?.startManualMeeting?.();
  }, []);

  // The bar is now on screen from launch, which means it can be on screen
  // before the app is set up. Onboarding state lives in localStorage (owned by
  // the control panel window); the storage event keeps this window honest the
  // moment setup finishes over there.
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

  // Warnings, download progress, and the start gate all arrive over the
  // bar-status channel — the control panel window computes them, because
  // that is where settings change and where download progress events land.
  const {
    missing: setupWarnings,
    download: speechDownload,
    downloadBlocksMeetingStart,
  } = useBarSetupStatus();

  const handleFinishSetup = useCallback(() => {
    // "setup" lands the panel on Home with the capabilities card open.
    void window.electronAPI?.openControlPanel?.("setup");
  }, []);

  const handleToggleApp = useCallback(() => {
    void window.electronAPI?.toggleControlPanel?.();
  }, []);

  /**
   * The palette's rows, in render order (actions before settings, so the flat
   * highlight index and the grouped rendering agree). Labels arrive
   * translated because filtering matches what the user reads. The settings
   * rows come straight from SETTINGS_SECTIONS — the same IA the Settings
   * modal renders — so the palette can never offer a section that does not
   * exist.
   */
  const paletteRows = useMemo(
    () => [
      {
        id: "startMeeting",
        group: "actions" as BarPaletteGroup,
        label: t("agentMode.bar.startMeeting"),
        icon: AudioLines,
        disabled: downloadBlocksMeetingStart,
        run: handleListen,
      },
      {
        id: "appWindow",
        group: "actions" as BarPaletteGroup,
        label: t("agentMode.bar.appWindow"),
        icon: AppWindow,
        disabled: false,
        run: handleToggleApp,
      },
      ...SETTINGS_SECTIONS.map((section) => ({
        id: `settings-${section.id}`,
        group: "settings" as BarPaletteGroup,
        label: t(section.labelKey),
        icon: section.icon,
        disabled: false,
        run: () =>
          void window.electronAPI?.openControlPanel?.({ settings: { section: section.id } }),
      })),
    ],
    [t, downloadBlocksMeetingStart, handleListen, handleToggleApp]
  );
  const visiblePaletteRows = useMemo(
    () => filterBarPalette(paletteRows, barText),
    [paletteRows, barText]
  );
  const [paletteHighlight, setPaletteHighlight] = useState(0);
  useEffect(() => {
    setPaletteHighlight(0);
  }, [barText, paletteOpen]);

  const runPaletteRow = useCallback((row: { disabled: boolean; run: () => void }) => {
    if (row.disabled) return;
    setPaletteOpen(false);
    // Running a row is leaving the field: drop its focus so the window
    // re-activating afterwards cannot restore it and reopen the menu.
    barInputRef.current?.blur();
    row.run();
  }, []);

  const isRecordingVoice = isVoiceRecording;

  // Compact on purpose: the bar is a strip of pixels, so unfinished setup is
  // one pulsing warning icon. Hover spells out each missing piece; the click
  // lands on Home with the capabilities card forced open — the app's setup
  // guide, with a Set up button per item. It never gates Start meeting:
  // transcription alone is enough to record.
  const setupSummary = setupWarnings.map((id) => t(`agentMode.bar.setup.${id}`)).join("\n");
  const setupWarning =
    setupWarnings.length > 0 ? (
      <button
        type="button"
        onClick={handleFinishSetup}
        title={setupSummary}
        aria-label={setupSummary}
        className="flex size-7 shrink-0 items-center justify-center rounded-control text-warning hover:bg-warning/10"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <TriangleAlert className="size-4 animate-pulse" strokeWidth={2} />
      </button>
    ) : null;

  const consentRow = !agentScreenContextPrompted && (
    <div className="flex items-center gap-2 border-t border-white/10 bg-white/[0.06] px-3 py-2">
      <p className="min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground">
        {t("agentMode.screenConsent.question")}
      </p>
      <button
        type="button"
        onClick={() => {
          setAgentScreenContext(true);
          setAgentScreenContextPrompted(true);
        }}
        className="shrink-0 rounded-control border border-primary/35 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/15"
      >
        {t("agentMode.screenConsent.allow")}
      </button>
      <button
        type="button"
        onClick={() => setAgentScreenContextPrompted(true)}
        className="shrink-0 rounded-control px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
      >
        {t("agentMode.screenConsent.deny")}
      </button>
    </div>
  );

  // The cue card takes the whole window while a meeting records — one
  // surface, morphing, exactly as it reads to the user. Resizable like the
  // chat column; the grips sit over the card's own drag surface.
  if (meetingActive) {
    return (
      <div className="agent-overlay-window h-screen w-screen bg-transparent relative">
        <MeetingPanelOverlay />
        <ResizeHandles onResizeStart={handleResizeStart} />
      </div>
    );
  }

  // The cue card's material, exactly: dark glass with the one border on the
  // window edge (see .hud-surface) at the cue card's radius. Like the cue
  // card, the bar floats over other apps and never follows the app theme —
  // the root's `dark` scope below pins every token inside to the dark
  // palette, so the chat column and shared chat components render on glass
  // without their own restyling.
  const cardChrome = cn("hud-surface rounded-[13px]", "overflow-hidden");

  return (
    <div className="agent-overlay-window dark w-screen h-screen bg-transparent relative">
      {expanded ? (
        <div className={cn(cardChrome, "flex flex-col w-full h-full")}>
          {/* Collapsing IS starting fresh: the conversation is already in
              chat history, and "back to the bar" reads as done-with-this. */}
          <AgentTitleBar onCollapse={handleNewChat} />
          <AgentChat messages={messages} />
          {consentRow}
          <AgentInput
            agentState={agentState}
            partialTranscript={partialTranscript}
            onTextSubmit={handleSend}
            onCancel={streaming.cancelStream}
          />
        </div>
      ) : (
        /* The bar: an ask field over a control strip. Two rows on purpose —
           the field is the product's front door and gets a full row of
           readable 15px text, while every control drops to a quiet toolbar
           beneath it. The visual language is tonal, not drawn: one border
           on the card edge, and inside it only fills — a second stroke
           around the field is what made the old bar read as box-in-a-box.
           The container drags the window; everything interactive opts out,
           so the empty toolbar space is the handle.

           The bar is its OWN card at a fixed height, pinned to the top of
           the window; the palette is a second, detached card below it. The
           window grows to make room for the dropdown, but the bar never
           changes shape — that is what makes the palette read as a menu
           appearing rather than the bar stretching. */
        <div className="flex h-full w-full flex-col gap-1.5">
          {/* h-[104px] = BAR_HEIGHT: fixed so the resize animation cannot
              stretch the bar while the window grows. */}
          <div
            className={cn(cardChrome, "flex h-[104px] shrink-0 flex-col gap-1 p-2.5")}
            // While the palette is open the bar stops being a drag region: a
            // drag region's clicks are consumed by the OS, so a click on the
            // strip's empty space would neither blur the field nor close the
            // menu. With drag suspended, that click reaches the DOM, focus
            // falls to the body, and the input's blur folds the palette — the
            // way any menu closes. Dragging returns the moment it folds.
            style={{ WebkitAppRegion: paletteOpen ? "no-drag" : "drag" } as React.CSSProperties}
          >
            {!setupComplete ? (
              /* Pre-setup: the same two-row shell, with the hint where the
                 ask field will live — the bar's one job is to hand the user
                 to onboarding. */
              <>
                <div className="flex min-h-0 flex-1 items-center gap-2.5 rounded-xl bg-warning/[0.08] px-3.5">
                  <TriangleAlert
                    className="size-4 shrink-0 animate-pulse text-warning"
                    strokeWidth={1.75}
                  />
                  <p className="min-w-0 flex-1 truncate text-[13.5px] text-foreground/85">
                    {t("agentMode.bar.finishSetupHint")}
                  </p>
                </div>
                <div className="flex h-7 shrink-0 items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={handleFinishSetup}
                    className={cn(
                      "flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3",
                      "bg-warning/15 text-[12px] font-semibold text-warning",
                      "transition-colors duration-150 hover:bg-warning/25"
                    )}
                    style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                  >
                    {t("agentMode.bar.finishSetup")}
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    aria-label={t("agentMode.titleBar.close")}
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/70 hover:bg-white/[0.1] hover:text-foreground"
                    style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                  >
                    <X className="size-4" strokeWidth={1.75} />
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Row 1 — the ask field. A tonal fill, no stroke: the field
                    reads as a soft well in the card, and focus brightens the
                    well instead of drawing a ring around it. Clicking in also
                    opens the palette below — the app's map, one focus away. */}
                <div
                  className={cn(
                    "flex min-h-0 flex-1 items-center gap-2 rounded-xl px-3.5",
                    "bg-white/[0.08] transition-colors duration-150 focus-within:bg-white/[0.12]"
                  )}
                  style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                >
                  <input
                    ref={barInputRef}
                    type="text"
                    value={barText}
                    onChange={(e) => setBarText(e.target.value)}
                    onFocus={() => setPaletteOpen(true)}
                    onClick={() => setPaletteOpen(true)}
                    onBlur={() => setPaletteOpen(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (barText.trim()) {
                          handleBarSubmit();
                        } else if (paletteOpen) {
                          const row = visiblePaletteRows[paletteHighlight];
                          if (row) runPaletteRow(row);
                        }
                        return;
                      }
                      if (paletteOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                        e.preventDefault();
                        const count = visiblePaletteRows.length;
                        if (count === 0) return;
                        setPaletteHighlight((i) =>
                          e.key === "ArrowDown" ? (i + 1) % count : (i - 1 + count) % count
                        );
                      }
                    }}
                    placeholder={
                      isRecordingVoice
                        ? partialTranscript.trim() || t("agentMode.input.listening")
                        : t("agentMode.bar.placeholder")
                    }
                    className={cn(
                      // input-inline opts out of the app's boxed input chrome:
                      // the field's well is the surface here, not the input.
                      "input-inline min-w-0 flex-1 bg-transparent p-0 text-[15px] text-foreground",
                      "placeholder:text-muted-foreground focus:outline-none"
                    )}
                  />
                  <button
                    type="button"
                    onClick={handleBarSubmit}
                    disabled={!barText.trim()}
                    aria-label={t("agentMode.bar.send")}
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-lg",
                      "transition-colors duration-150",
                      barText.trim()
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "text-muted-foreground/50"
                    )}
                  >
                    <CornerDownLeft className="size-4" strokeWidth={1.75} />
                  </button>
                </div>

                {/* Row 2 — the control strip. Everything the field displaced:
                    warnings and download progress on the left; the meeting
                    and window verbs on the right. No lane chip here — the bar
                    is global chat and always sends the full chat model. */}
                <div className="flex h-7 shrink-0 items-center gap-1.5">
                  {setupWarning}
                  {/* The dictation mic was deliberately dropped from the bar —
                      typing and Listen are its two verbs; the hotkey still
                      reaches voice input for those who use it. */}
                  {/* A download that doesn't block recording still shows: the
                      user asked the app for a model, and the bar is the one
                      surface always on screen to answer "is it done yet". */}
                  {speechDownload && !downloadBlocksMeetingStart && (
                    <span
                      title={t("agentMode.bar.downloadingModel", {
                        model: speechDownload.displayName,
                      })}
                      className="flex h-7 shrink-0 items-center gap-1 rounded-control px-1.5 text-[11px] font-medium text-muted-foreground"
                      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                    >
                      <Loader2 className="size-3 animate-spin" strokeWidth={2} />
                      {Math.round(speechDownload.percentage)}%
                    </span>
                  )}
                  {/* Draggable breathing room: the strip's empty middle is the
                      window's handle. */}
                  <span className="min-w-0 flex-1" />
                  <button
                    type="button"
                    onClick={handleListen}
                    disabled={downloadBlocksMeetingStart}
                    title={
                      downloadBlocksMeetingStart
                        ? speechDownload
                          ? t("agentMode.bar.downloadingModel", {
                              model: speechDownload.displayName,
                            })
                          : t("shell.modelDownload.startBlocked")
                        : undefined
                    }
                    className={cn(
                      "flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3",
                      "bg-primary text-[12px] font-semibold text-primary-foreground",
                      "transition-colors duration-150 hover:bg-primary/90",
                      "disabled:cursor-default disabled:bg-white/[0.08] disabled:text-muted-foreground"
                    )}
                    style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                  >
                    {downloadBlocksMeetingStart ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
                        {/* Percent over a spinner alone: "42%" promises an end,
                            "Preparing…" only promises a wait. */}
                        {speechDownload
                          ? speechDownload.isInstalling
                            ? t("agentMode.bar.installing")
                            : t("agentMode.bar.downloading", {
                                percent: Math.round(speechDownload.percentage),
                              })
                          : t("agentMode.bar.preparing")}
                      </>
                    ) : (
                      <>
                        <AudioLines className="size-3.5" strokeWidth={2} />
                        {t("agentMode.bar.startMeeting")}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleApp}
                    title={t("agentMode.bar.appWindow")}
                    aria-label={t("agentMode.bar.appWindow")}
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/70 hover:bg-white/[0.1] hover:text-foreground"
                    style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                  >
                    <AppWindow className="size-4" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    aria-label={t("agentMode.titleBar.close")}
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/70 hover:bg-white/[0.1] hover:text-foreground"
                    style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                  >
                    <X className="size-4" strokeWidth={1.75} />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* The palette — the app's map in its own card under the bar,
              exactly the reference product's click-in dropdown: quick
              actions, then every Settings destination. Typing in the field
              filters it; Enter with text still asks the agent (the field's
              first job never changes). The card preventDefaults mousedown so
              interacting with it never blurs the field — the input's blur is
              what closes the menu. */}
          {paletteOpen && setupComplete && (
            <div
              onMouseDown={(e) => e.preventDefault()}
              className={cn(
                cardChrome,
                "palette-pop relative min-h-0 flex-1 overflow-y-auto p-1.5"
              )}
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
              {/* "Dismiss", not "Close": the bar's own X (Close) is on screen
                  at the same time, and two buttons announcing the same name
                  would be indistinguishable to a screen reader. */}
              <button
                type="button"
                onClick={() => setPaletteOpen(false)}
                aria-label={t("common.dismiss")}
                className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-lg text-muted-foreground/70 hover:bg-white/[0.1] hover:text-foreground"
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
              {groupBarPalette(visiblePaletteRows).map(({ group, rows }) => (
                <div key={group} className="mb-1 last:mb-0">
                  <p className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    {group === "actions" ? t("common.actions") : t("settingsModal.title")}
                  </p>
                  {rows.map((row) => {
                    const flatIndex = visiblePaletteRows.indexOf(row);
                    const Icon = row.icon;
                    return (
                      <button
                        key={row.id}
                        type="button"
                        disabled={row.disabled}
                        onClick={() => runPaletteRow(row)}
                        onMouseEnter={() => setPaletteHighlight(flatIndex)}
                        className={cn(
                          "flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left",
                          "text-[13px] text-foreground/90 transition-colors duration-100",
                          flatIndex === paletteHighlight && "bg-white/[0.1] text-foreground",
                          "disabled:cursor-default disabled:opacity-40"
                        )}
                      >
                        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                        {row.label}
                      </button>
                    );
                  })}
                </div>
              ))}
              {visiblePaletteRows.length === 0 && (
                <p className="px-2 py-3 text-[12px] text-muted-foreground">
                  {t("agentMode.palette.askHint")}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {expanded && <ResizeHandles onResizeStart={handleResizeStart} />}
    </div>
  );
}
