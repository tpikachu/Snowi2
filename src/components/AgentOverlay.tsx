import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { AppWindow, AudioLines, Loader2, Send, TriangleAlert, X } from "lucide-react";
import { cn } from "./lib/utils";
import MeetingPanelOverlay from "./MeetingPanelOverlay";
import { useSpeechModelDownloadStatus } from "../hooks/useSpeechModelDownloadStatus";
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

/** The collapsed bar: one row. Must match AGENT_OVERLAY_CONFIG.minHeight. */
const BAR_HEIGHT = 56;
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

  // The window follows the mode. Height is remembered across one
  // expand-collapse cycle so a hand-resized chat column comes back at the
  // size the user gave it, not the default.
  const lastExpandedHeightRef = useRef(DEFAULT_EXPANDED_HEIGHT);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const bounds = await window.electronAPI?.getAgentWindowBounds?.();
      if (cancelled) return;
      const width = bounds?.width ?? 560;
      if (meetingActive) {
        window.electronAPI?.resizeAgentWindow?.(width, MEETING_CARD_HEIGHT);
      } else if (expanded) {
        window.electronAPI?.resizeAgentWindow?.(width, lastExpandedHeightRef.current);
      } else {
        if (bounds?.height && bounds.height > BAR_HEIGHT && bounds.height !== MEETING_CARD_HEIGHT) {
          lastExpandedHeightRef.current = bounds.height;
        }
        window.electronAPI?.resizeAgentWindow?.(width, BAR_HEIGHT);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expanded, meetingActive]);

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
        height = Math.max(MIN_HEIGHT, height);

        window.electronAPI?.setAgentWindowBounds?.(x, y, width, height);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Never while recording: a stray Escape must not hide the one on-screen
      // indicator that a meeting is being captured.
      if (e.key === "Escape" && !meetingActiveRef.current) {
        window.electronAPI?.hideAgentOverlay?.();
      }
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

  const speechDownload = useSpeechModelDownloadStatus();
  const setupWarnings = useBarSetupStatus();

  const handleFinishSetup = useCallback(() => {
    // "setup" lands the panel on Home with the capabilities card open.
    void window.electronAPI?.openControlPanel?.("setup");
  }, []);

  const handleToggleApp = useCallback(() => {
    void window.electronAPI?.toggleControlPanel?.();
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
    <div className="flex items-center gap-2 border-t border-border/50 bg-surface-1 px-3 py-2">
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
  // surface, morphing, exactly as it reads to the user.
  if (meetingActive) {
    return (
      <div className="agent-overlay-window h-screen w-screen bg-transparent">
        <MeetingPanelOverlay />
      </div>
    );
  }

  return (
    <div className="agent-overlay-window w-screen h-screen bg-transparent relative">
      <div
        className={cn(
          "flex flex-col w-full h-full",
          "bg-surface-0",
          "border border-border/50 rounded-lg",
          "shadow-[var(--shadow-elevated)]",
          "overflow-hidden"
        )}
      >
        {expanded ? (
          <>
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
          </>
        ) : (
          /* The bar. The row itself drags the window; everything interactive
             opts out, so the empty space is the handle. */
          <div
            className="flex h-full items-center gap-1.5 px-2.5"
            style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
          >
            {!setupComplete ? (
              /* Pre-setup: the bar's one job is to hand the user to onboarding. */
              <>
                <TriangleAlert
                  className="size-4 shrink-0 animate-pulse text-warning"
                  strokeWidth={1.75}
                />
                <p className="min-w-0 flex-1 truncate px-1 text-[12.5px] text-muted-foreground">
                  {t("agentMode.bar.finishSetupHint")}
                </p>
                <button
                  type="button"
                  onClick={handleFinishSetup}
                  className={cn(
                    "flex h-8 shrink-0 items-center gap-1.5 rounded-control px-2.5",
                    "border border-warning/40 bg-warning/10 text-[12px] font-semibold text-warning",
                    "hover:bg-warning/20"
                  )}
                  style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                >
                  {t("agentMode.bar.finishSetup")}
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label={t("agentMode.titleBar.close")}
                  className="flex size-7 shrink-0 items-center justify-center rounded-control text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                >
                  <X className="size-3.5" strokeWidth={1.75} />
                </button>
              </>
            ) : (
              <>
                {setupWarning}
                <input
                  ref={barInputRef}
                  type="text"
                  value={barText}
                  onChange={(e) => setBarText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleBarSubmit();
                    }
                  }}
                  placeholder={
                    isRecordingVoice
                      ? partialTranscript.trim() || t("agentMode.input.listening")
                      : t("agentMode.bar.placeholder")
                  }
                  className={cn(
                    "min-w-0 flex-1 bg-transparent px-1.5 text-[13px] text-foreground",
                    "placeholder:text-muted-foreground focus:outline-none"
                  )}
                  style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                />
                {/* The dictation mic was deliberately dropped from the bar —
                    typing and Listen are its two verbs; the hotkey still
                    reaches voice input for those who use it. */}
                {barText.trim() && (
                  <button
                    type="button"
                    onClick={handleBarSubmit}
                    aria-label={t("agentMode.bar.send")}
                    className="flex size-8 shrink-0 items-center justify-center rounded-control text-primary hover:bg-surface-2"
                    style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                  >
                    <Send className="size-4" strokeWidth={1.75} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleListen}
                  disabled={speechDownload.blocksMeetingStart}
                  title={
                    speechDownload.blocksMeetingStart
                      ? t("shell.modelDownload.startBlocked")
                      : undefined
                  }
                  className={cn(
                    "flex h-8 shrink-0 items-center gap-1.5 rounded-control px-2.5",
                    "border border-primary/35 bg-primary/10 text-[12px] font-semibold text-primary",
                    "hover:bg-primary/15",
                    "disabled:cursor-default disabled:border-border disabled:bg-surface-1 disabled:text-muted-foreground"
                  )}
                  style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                >
                  {speechDownload.blocksMeetingStart ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
                      {t("agentMode.bar.preparing")}
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
                  className="flex size-7 shrink-0 items-center justify-center rounded-control text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                >
                  <AppWindow className="size-4" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label={t("agentMode.titleBar.close")}
                  className="flex size-7 shrink-0 items-center justify-center rounded-control text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                >
                  <X className="size-3.5" strokeWidth={1.75} />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {expanded && (
        <>
          {/* Resize handles -- edges */}
          <div
            className="absolute top-0 left-2 right-2 h-[5px] cursor-n-resize"
            onMouseDown={(e) => handleResizeStart(e, "n")}
          />
          <div
            className="absolute bottom-0 left-2 right-2 h-[5px] cursor-s-resize"
            onMouseDown={(e) => handleResizeStart(e, "s")}
          />
          <div
            className="absolute left-0 top-2 bottom-2 w-[5px] cursor-w-resize"
            onMouseDown={(e) => handleResizeStart(e, "w")}
          />
          <div
            className="absolute right-0 top-2 bottom-2 w-[5px] cursor-e-resize"
            onMouseDown={(e) => handleResizeStart(e, "e")}
          />

          {/* Resize handles -- corners */}
          <div
            className="absolute top-0 left-0 w-[10px] h-[10px] cursor-nw-resize"
            onMouseDown={(e) => handleResizeStart(e, "nw")}
          />
          <div
            className="absolute top-0 right-0 w-[10px] h-[10px] cursor-ne-resize"
            onMouseDown={(e) => handleResizeStart(e, "ne")}
          />
          <div
            className="absolute bottom-0 left-0 w-[10px] h-[10px] cursor-sw-resize"
            onMouseDown={(e) => handleResizeStart(e, "sw")}
          />
          <div
            className="absolute bottom-0 right-0 w-[10px] h-[10px] cursor-se-resize"
            onMouseDown={(e) => handleResizeStart(e, "se")}
          />
        </>
      )}
    </div>
  );
}
