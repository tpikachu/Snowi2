import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import "./index.css";
import { MicOff, X } from "lucide-react";
import { useToast } from "./components/ui/useToast";
import { useHotkey } from "./hooks/useHotkey";
import { formatHotkeyListLabel } from "./utils/hotkeys";
import { formatMmSs } from "./utils/formatDuration";
import { useWindowDrag } from "./hooks/useWindowDrag";
import { useAudioRecording } from "./hooks/useAudioRecording";
import { useSettingsStore } from "./stores/settingsStore";

/* ---------------------------------------------------------------------------
 * The dictation HUD.
 *
 * This window is 96x96, frameless, transparent and always on top, so every
 * pixel here floats over whatever the user is actually working in. Two
 * consequences drive the whole design:
 *
 *   1. It is ALWAYS dark. It cannot follow the app theme, because the theme
 *      says nothing about the desktop underneath it. Everything uses the
 *      pinned `hud-*` tokens plus a light outer hairline and a deep shadow, so
 *      the object reads as an object over a white document and a black editor
 *      alike.
 *   2. It has ~92px of usable width. States are told apart by shape and one
 *      accent, not by copy: a square tile when idle or thinking, a capsule
 *      with a live meter and a tabular clock while capturing.
 * ------------------------------------------------------------------------- */

const METER_BARS = 5;
// Centre bars lead, outer bars trail — a flat meter reads as a progress bar.
const BAR_WEIGHTS = [0.58, 0.84, 1, 0.84, 0.58];
const METER_HEIGHT_PX = 14;
const BAR_FLOOR = 0.2;

// Snowi's mark: the ring plus three strokes. Inherits currentColor so a single
// class recolours it across every HUD state.
const SnowiMark = ({ size = 17, className = "" }) => (
  <svg viewBox="0 0 1024 1024" width={size} height={size} className={className} aria-hidden="true">
    <circle
      cx="512"
      cy="512"
      r="300"
      fill="none"
      stroke="currentColor"
      strokeWidth="76"
      opacity="0.55"
    />
    <path d="M512 379V645" stroke="currentColor" strokeWidth="86" strokeLinecap="round" />
    <path d="M632 452V572" stroke="currentColor" strokeWidth="86" strokeLinecap="round" />
    <path d="M392 452V572" stroke="currentColor" strokeWidth="86" strokeLinecap="round" />
  </svg>
);

/**
 * Live mic-level meter.
 *
 * Reads the recorder's existing speech-gate analyser — no second capture
 * stream — and writes bar heights straight to the DOM inside one rAF loop, so
 * a 60fps meter never re-renders React. Capture paths that expose no analyser
 * (cloud streaming) fall back to a synthesised breath so the HUD still reads
 * as live rather than freezing at the floor.
 */
const LevelMeter = ({ active, getAnalyser }) => {
  const barsRef = useRef([]);

  useEffect(() => {
    const bars = barsRef.current;
    if (!active) {
      bars.forEach((bar) => {
        if (bar) bar.style.height = `${METER_HEIGHT_PX * BAR_FLOOR}px`;
      });
      return undefined;
    }

    let frameId = 0;
    let smoothed = 0;
    let buffer = new Float32Array(2048);
    const startedAt = performance.now();

    const tick = () => {
      const elapsedSec = (performance.now() - startedAt) / 1000;
      const analyser = getAnalyser?.();
      let level;

      if (analyser) {
        if (buffer.length !== analyser.fftSize) buffer = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buffer);
        let sumSquares = 0;
        for (let i = 0; i < buffer.length; i += 1) sumSquares += buffer[i] * buffer[i];
        const rms = Math.sqrt(sumSquares / buffer.length);
        // Asymmetric smoothing: jump to peaks, fall back slowly, so consonants
        // register without the meter flickering between syllables.
        smoothed = rms > smoothed ? rms * 0.6 + smoothed * 0.4 : smoothed * 0.86 + rms * 0.14;
        // Speech RMS sits around 0.05-0.15; sqrt lifts it into a visible range.
        level = Math.min(1, Math.sqrt(smoothed) * 2.4);
      } else {
        level = 0.42 + 0.3 * Math.abs(Math.sin(elapsedSec * 2.1));
      }

      for (let i = 0; i < bars.length; i += 1) {
        const bar = bars[i];
        if (!bar) continue;
        // A small per-bar phase keeps the stack from moving in lockstep.
        const jitter = 0.88 + 0.12 * Math.sin(elapsedSec * 7 + i * 1.9);
        const scale = Math.max(BAR_FLOOR, Math.min(1, level * BAR_WEIGHTS[i] * jitter));
        bar.style.height = `${(METER_HEIGHT_PX * scale).toFixed(2)}px`;
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [active, getAnalyser]);

  return (
    <div
      className="flex shrink-0 items-end gap-[2px]"
      style={{ height: METER_HEIGHT_PX }}
      aria-hidden="true"
    >
      {Array.from({ length: METER_BARS }, (_, i) => (
        <span
          key={i}
          ref={(node) => {
            barsRef.current[i] = node;
          }}
          className="w-[2px] rounded-full bg-hud-accent"
          style={{ height: METER_HEIGHT_PX * BAR_FLOOR }}
        />
      ))}
    </div>
  );
};

// A ring that fills and empties as it turns: "working", with no copy to fit.
const ProcessingRing = () => (
  <svg
    viewBox="0 0 36 36"
    className="absolute inset-0 h-full w-full motion-reduce:animate-none"
    style={{ animation: "spinner-rotate 1.15s linear infinite" }}
    aria-hidden="true"
  >
    <circle
      cx="18"
      cy="18"
      r="15"
      fill="none"
      stroke="var(--color-hud-accent)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeDasharray="26 68"
      opacity="0.9"
    />
  </svg>
);

// HUD tooltip. Same always-dark ground as the pill it labels.
const Tooltip = ({ children, content, align = "center" }) => {
  const [isVisible, setIsVisible] = useState(false);

  const alignClass =
    align === "right" ? "right-0" : align === "left" ? "left-0" : "left-1/2 -translate-x-1/2";

  return (
    <div className="relative inline-block">
      <div onMouseEnter={() => setIsVisible(true)} onMouseLeave={() => setIsVisible(false)}>
        {children}
      </div>
      {isVisible && content && (
        <div
          className={`hud-surface absolute bottom-full ${alignClass} mb-2 max-w-[92px] truncate rounded-md px-1.5 py-[3px] text-[10px] font-medium leading-none text-hud-muted z-10`}
        >
          {content}
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [isHovered, setIsHovered] = useState(false);
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const commandMenuRef = useRef(null);
  const buttonRef = useRef(null);
  const { toast, dismiss, toastCount } = useToast();
  const { t } = useTranslation();
  const { hotkey } = useHotkey();
  const { isDragging, handleMouseDown, handleMouseUp } = useWindowDrag();

  const [dragStartPos, setDragStartPos] = useState(null);
  const [hasDragged, setHasDragged] = useState(false);

  // Floating icon auto-hide setting (read from store, synced via IPC)
  const floatingIconAutoHide = useSettingsStore((s) => s.floatingIconAutoHide);
  const panelStartPosition = useSettingsStore((s) => s.panelStartPosition);
  const prevAutoHideRef = useRef(floatingIconAutoHide);

  const setWindowInteractivity = React.useCallback((shouldCapture) => {
    window.electronAPI?.setMainWindowInteractivity?.(shouldCapture);
  }, []);

  useEffect(() => {
    setWindowInteractivity(false);
    return () => setWindowInteractivity(false);
  }, [setWindowInteractivity]);

  useEffect(() => {
    const unsubscribeFallback = window.electronAPI?.onHotkeyFallbackUsed?.((data) => {
      toast({
        title: t("app.toasts.hotkeyChanged.title"),
        description: t("app.toasts.hotkeyChanged.description", {
          original: data.original,
          fallback: data.fallback,
        }),
        duration: 8000,
      });
    });

    const unsubscribeFailed = window.electronAPI?.onHotkeyRegistrationFailed?.((_data) => {
      toast({
        title: t("app.toasts.hotkeyUnavailable.title"),
        description: t("app.toasts.hotkeyUnavailable.description"),
        duration: 10000,
      });
    });

    const showGpuFallbackToast = () => {
      toast({
        title: t("app.toasts.gpuFallback.title"),
        description: t("app.toasts.gpuFallback.description"),
        duration: 10000,
      });
    };
    const unsubscribeCudaFallback =
      window.electronAPI?.onCudaFallbackNotification?.(showGpuFallbackToast);
    const unsubscribeGpuFallback =
      window.electronAPI?.onGpuFallbackNotification?.(showGpuFallbackToast);

    const unsubscribeCorrections = window.electronAPI?.onCorrectionsLearned?.((words) => {
      if (words && words.length > 0) {
        const wordList = words.map((w) => `“${w}”`).join(", ");
        let toastId;
        toastId = toast({
          title: t("app.toasts.addedToDict", { words: wordList }),
          variant: "success",
          duration: 6000,
          action: (
            <button
              onClick={async () => {
                try {
                  const result = await window.electronAPI?.undoLearnedCorrections?.(words);
                  if (result?.success) {
                    dismiss(toastId);
                  }
                } catch {
                  // silently fail — word stays in dictionary
                }
              }}
              className="text-[10px] font-medium px-2.5 py-1 rounded-sm whitespace-nowrap
                text-white/90 hover:text-white
                bg-hud-success/15 hover:bg-hud-success/25
                border border-hud-success/25 hover:border-hud-success/40
                transition-all duration-150"
            >
              {t("app.toasts.undo")}
            </button>
          ),
        });
      }
    });

    return () => {
      unsubscribeFallback?.();
      unsubscribeFailed?.();
      unsubscribeCudaFallback?.();
      unsubscribeGpuFallback?.();
      unsubscribeCorrections?.();
    };
  }, [toast, dismiss, t]);

  useEffect(() => {
    if (isCommandMenuOpen || toastCount > 0) {
      setWindowInteractivity(true);
    } else if (!isHovered) {
      setWindowInteractivity(false);
    }
  }, [isCommandMenuOpen, isHovered, toastCount, setWindowInteractivity]);

  useEffect(() => {
    const resizeWindow = () => {
      if (isCommandMenuOpen && toastCount > 0) {
        window.electronAPI?.resizeMainWindow?.("EXPANDED");
      } else if (isCommandMenuOpen) {
        window.electronAPI?.resizeMainWindow?.("WITH_MENU");
      } else if (toastCount > 0) {
        window.electronAPI?.resizeMainWindow?.("WITH_TOAST");
      } else {
        window.electronAPI?.resizeMainWindow?.("BASE");
      }
    };
    resizeWindow();
  }, [isCommandMenuOpen, toastCount]);

  const handleDictationToggle = React.useCallback(() => {
    setIsCommandMenuOpen(false);
    setWindowInteractivity(false);
  }, [setWindowInteractivity]);

  const {
    isRecording,
    isProcessing,
    micCaptureStatus,
    getLevelAnalyser,
    toggleListening,
    cancelRecording,
    cancelProcessing,
  } = useAudioRecording(toast, {
    onToggle: handleDictationToggle,
  });

  // Sync auto-hide from main process — setState directly to avoid IPC echo
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onFloatingIconAutoHideChanged?.((enabled) => {
      localStorage.setItem("floatingIconAutoHide", String(enabled));
      useSettingsStore.setState({ floatingIconAutoHide: enabled });
    });
    return () => unsubscribe?.();
  }, []);

  const isRecordingRef = useRef(isRecording);

  useLayoutEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onCancelHotkeyPressed?.(() => {
      if (isRecordingRef.current) cancelRecording();
    });
    return () => unsubscribe?.();
  }, [cancelRecording]);

  // Elapsed capture time. Derived from a wall-clock anchor rather than an
  // incrementing counter so a throttled interval can't drift.
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (!isRecording) {
      setElapsedSeconds(0);
      return undefined;
    }
    const startedAt = Date.now();
    setElapsedSeconds(0);
    const intervalId = setInterval(
      () => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      250
    );
    return () => clearInterval(intervalId);
  }, [isRecording]);

  // Auto-hide the floating icon when idle (setting enabled or dictation cycle completed)
  useEffect(() => {
    let hideTimeout;

    if (floatingIconAutoHide && !isRecording && !isProcessing && toastCount === 0) {
      // Delay briefly so processing can start after recording stops without a flash
      hideTimeout = setTimeout(() => {
        window.electronAPI?.hideWindow?.();
      }, 500);
    } else if (!floatingIconAutoHide && prevAutoHideRef.current) {
      window.electronAPI?.showDictationPanel?.();
    }

    prevAutoHideRef.current = floatingIconAutoHide;
    return () => clearTimeout(hideTimeout);
  }, [isRecording, isProcessing, floatingIconAutoHide, toastCount]);

  const handleClose = () => {
    window.electronAPI.hideWindow();
  };

  useEffect(() => {
    if (!isCommandMenuOpen) {
      return;
    }

    const handleClickOutside = (event) => {
      if (
        commandMenuRef.current &&
        !commandMenuRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsCommandMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isCommandMenuOpen]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === "Escape") {
        if (isCommandMenuOpen) {
          setIsCommandMenuOpen(false);
        } else {
          handleClose();
        }
      }
    };

    document.addEventListener("keydown", handleKeyPress);
    return () => document.removeEventListener("keydown", handleKeyPress);
  }, [isCommandMenuOpen]);

  // Determine current mic state
  const getMicState = () => {
    if (isRecording && (micCaptureStatus === "reconnecting" || micCaptureStatus === "unavailable"))
      return "unavailable";
    if (isRecording) return "recording";
    if (isProcessing) return "processing";
    if (isHovered && !isRecording && !isProcessing) return "hover";
    return "idle";
  };

  const micState = getMicState();
  const isCapturing = micState === "recording" || micState === "unavailable";
  const showCancel = (isRecording || isProcessing) && isHovered;
  const elapsedLabel = formatMmSs(elapsedSeconds);

  const hotkeyLabel = formatHotkeyListLabel(hotkey);
  const stateLabel =
    micState === "recording"
      ? t("app.mic.recording")
      : micState === "unavailable"
        ? t("app.mic.waitingForMicrophone")
        : micState === "processing"
          ? t("app.mic.processing")
          : hotkeyLabel
            ? t("app.mic.hotkeyToSpeak", { hotkey: hotkeyLabel })
            : t("app.mic.clickToSpeak");
  // The window is only 96px wide, so the tooltip shows the hotkey alone; the
  // full sentence stays on the button's accessible name.
  const tooltipContent = micState === "idle" || micState === "hover" ? hotkeyLabel : stateLabel;

  // Capturing turns the tile into a capsule. Budget: the cancel affordance
  // (18px + gap) plus this capsule has to stay inside the window's ~92px of
  // usable width, so the padding is deliberately mean.
  const shellClass = [
    "relative flex h-9 items-center rounded-[11px] overflow-hidden",
    "text-hud-foreground select-none",
    isCapturing ? "gap-1 pl-1.5 pr-2" : "w-9 justify-center",
    micState === "unavailable" ? "hud-surface hud-surface-warn" : "hud-surface",
    micState === "recording" ? "hud-surface-live" : "",
    micState === "processing" ? "cursor-not-allowed" : "cursor-pointer",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="dictation-window">
      {/* HUD — position determined by panelStartPosition setting */}
      <div
        className={`fixed bottom-1 z-50 ${
          panelStartPosition === "bottom-left"
            ? "left-1"
            : panelStartPosition === "center"
              ? "left-1/2 -translate-x-1/2"
              : "right-1"
        }`}
      >
        <div
          className="relative flex items-center gap-1.5"
          onMouseEnter={() => {
            setIsHovered(true);
            setWindowInteractivity(true);
          }}
          onMouseLeave={() => {
            setIsHovered(false);
            if (!isCommandMenuOpen) {
              setWindowInteractivity(false);
            }
          }}
        >
          {/* Sits beside the capsule rather than inside it: a nested button is
              invalid, and the tile states are too small to give up width. Its
              fill uses explicit utilities rather than .hud-surface, which is
              unlayered and would outrank the hover colour. */}
          {showCancel && (
            <button
              aria-label={
                isRecording ? t("app.buttons.cancelRecording") : t("app.buttons.cancelProcessing")
              }
              title={
                isRecording ? t("app.buttons.cancelRecording") : t("app.buttons.cancelProcessing")
              }
              onClick={(e) => {
                e.stopPropagation();
                if (isRecording) {
                  cancelRecording();
                } else {
                  cancelProcessing();
                }
              }}
              className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border border-hud-border bg-hud-surface-2 text-hud-muted transition-colors duration-150 hover:border-hud-danger hover:bg-hud-danger hover:text-white"
              style={{ animation: "hud-pop-in 120ms var(--ease-snap) both" }}
            >
              <X size={10} strokeWidth={2.75} />
            </button>
          )}
          <Tooltip
            content={tooltipContent}
            align={
              panelStartPosition === "bottom-left"
                ? "left"
                : panelStartPosition === "center"
                  ? "center"
                  : "right"
            }
          >
            <button
              ref={buttonRef}
              aria-label={stateLabel}
              onMouseDown={(e) => {
                setIsCommandMenuOpen(false);
                setDragStartPos({ x: e.clientX, y: e.clientY });
                setHasDragged(false);
                handleMouseDown(e);
              }}
              onMouseMove={(e) => {
                if (dragStartPos && !hasDragged) {
                  const distance = Math.sqrt(
                    Math.pow(e.clientX - dragStartPos.x, 2) +
                      Math.pow(e.clientY - dragStartPos.y, 2)
                  );
                  if (distance > 5) {
                    // 5px threshold for drag
                    setHasDragged(true);
                  }
                }
              }}
              onMouseUp={(e) => {
                handleMouseUp(e);
                setDragStartPos(null);
              }}
              onClick={(e) => {
                if (!hasDragged) {
                  setIsCommandMenuOpen(false);
                  toggleListening();
                }
                e.preventDefault();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!hasDragged) {
                  setWindowInteractivity(true);
                  setIsCommandMenuOpen((prev) => !prev);
                }
              }}
              onFocus={() => setIsHovered(true)}
              onBlur={() => setIsHovered(false)}
              className={shellClass}
              style={{
                cursor:
                  micState === "processing"
                    ? "not-allowed !important"
                    : isDragging
                      ? "grabbing !important"
                      : "pointer !important",
                transition: "width 0.2s var(--ease-snap), padding 0.2s var(--ease-snap)",
              }}
            >
              {isCapturing ? (
                <>
                  {micState === "unavailable" ? (
                    <MicOff size={13} className="shrink-0 text-hud-warning" strokeWidth={2.2} />
                  ) : (
                    <LevelMeter active getAnalyser={getLevelAnalyser} />
                  )}
                  <span
                    data-numeric
                    className={`text-[10px] font-semibold leading-none tracking-[0.01em] ${
                      micState === "unavailable" ? "text-hud-warning" : "text-hud-foreground"
                    }`}
                  >
                    {elapsedLabel}
                  </span>
                </>
              ) : micState === "processing" ? (
                <>
                  <ProcessingRing />
                  <SnowiMark size={15} className="text-hud-accent/80" />
                </>
              ) : (
                <SnowiMark
                  size={17}
                  className={
                    micState === "hover"
                      ? "text-hud-accent transition-colors duration-150"
                      : "text-hud-muted transition-colors duration-150"
                  }
                />
              )}
            </button>
          </Tooltip>

          {isCommandMenuOpen && (
            <div
              ref={commandMenuRef}
              className={`hud-surface absolute bottom-full ${
                panelStartPosition === "bottom-left" ? "left-0" : "right-0"
              } mb-2 w-44 overflow-hidden rounded-lg p-1 text-hud-foreground`}
              onMouseEnter={() => {
                setWindowInteractivity(true);
              }}
              onMouseLeave={() => {
                if (!isHovered) {
                  setWindowInteractivity(false);
                }
              }}
            >
              <button
                className="w-full rounded-md px-2 py-1.5 text-left text-[12px] font-medium text-hud-foreground transition-colors duration-150 hover:bg-white/8 focus:bg-white/8 focus:outline-none"
                onClick={() => {
                  toggleListening();
                }}
              >
                {isRecording
                  ? t("app.commandMenu.stopListening")
                  : t("app.commandMenu.startListening")}
              </button>
              <div className="my-1 h-px bg-hud-border" />
              <button
                className="w-full rounded-md px-2 py-1.5 text-left text-[12px] text-hud-muted transition-colors duration-150 hover:bg-white/8 hover:text-hud-foreground focus:bg-white/8 focus:outline-none"
                onClick={() => {
                  setIsCommandMenuOpen(false);
                  setWindowInteractivity(false);
                  handleClose();
                }}
              >
                {t("app.commandMenu.hideForNow")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
