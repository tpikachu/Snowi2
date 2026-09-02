import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Mic, ArrowUp, Square, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { formatMmSs } from "../../utils/formatDuration";

const BAR_COUNT = 5;

interface NoteBottomBarProps {
  isRecording: boolean;
  isProcessing: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onAskSubmit: (text: string) => void;
  onInputFocus?: () => void;
  askDisabled?: boolean;
  actionPicker?: React.ReactNode;
  hideInput?: boolean;
  /** False hides the record control. */
  canRecord?: boolean;
  /**
   * Labels the idle record control as a resume ("Resume meeting") instead of
   * a bare mic. On click the same slot morphs into the elapsed/stop control,
   * so resuming and stopping live in one place.
   */
  resumeLabel?: string;
  /** Tooltip for the resume control. */
  resumeHint?: string;
}

export default function NoteBottomBar({
  isRecording,
  isProcessing,
  onStartRecording,
  onStopRecording,
  onAskSubmit,
  onInputFocus,
  askDisabled,
  actionPicker,
  hideInput,
  canRecord = true,
  resumeLabel,
  resumeHint,
}: NoteBottomBarProps) {
  const { t } = useTranslation();
  const [inputText, setInputText] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const [wasRecording, setWasRecording] = useState(isRecording);

  if (isRecording !== wasRecording) {
    setWasRecording(isRecording);
    if (!isRecording) setElapsed(0);
  }

  useEffect(() => {
    if (!isRecording) return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isRecording]);

  const elapsedLabel = formatMmSs(elapsed);

  const hasText = inputText.trim().length > 0;

  const handleSubmit = useCallback(() => {
    const text = inputText.trim();
    if (!text || askDisabled) return;
    onAskSubmit(text);
    setInputText("");
    setIsExpanded(false);
  }, [inputText, askDisabled, onAskSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === "Escape") {
        setIsExpanded(false);
        inputRef.current?.blur();
      }
    },
    [handleSubmit]
  );

  const handleInputFocus = useCallback(() => {
    setIsExpanded(true);
    onInputFocus?.();
  }, [onInputFocus]);

  useEffect(() => {
    if (!isExpanded) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!hasText && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isExpanded, hasText]);

  return (
    <div
      ref={containerRef}
      className="absolute bottom-0 left-0 right-0 z-10 px-5 pb-4 pt-3 pointer-events-none bg-background"
    >
      <div
        className={cn("flex items-end gap-2 pointer-events-auto", hideInput && "justify-center")}
      >
        {canRecord && (
          <div
            className={cn(
              "shrink-0 transition-all duration-300 ease-out overflow-hidden",
              !hideInput && isExpanded && !isRecording ? "w-0 opacity-0" : "w-auto opacity-100"
            )}
          >
            {isRecording ? (
              <button
                onClick={onStopRecording}
                aria-label={t("notes.editor.stop")}
                className={cn(
                  "flex items-center gap-2 h-10 pl-3 pr-2.5 rounded-xl",
                  "bg-primary-subtle border border-primary/30 text-primary",
                  "transition-colors duration-150",
                  "hover:border-primary/50",
                  "outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
              >
                <span className="flex items-end gap-[2px] h-3.5" aria-hidden="true">
                  {Array.from({ length: BAR_COUNT }, (_, i) => (
                    <span
                      key={i}
                      className="w-[2px] h-full rounded-full bg-primary origin-bottom"
                      style={{
                        animation: `waveform-bar ${0.5 + i * 0.07}s ease-in-out infinite`,
                        animationDelay: `${i * 0.04}s`,
                      }}
                    />
                  ))}
                </span>
                <span data-numeric className="text-[11px] font-semibold tracking-[0.01em]">
                  {elapsedLabel}
                </span>
                <span className="h-4 w-px bg-primary/25" aria-hidden="true" />
                <Square size={10} fill="currentColor" />
              </button>
            ) : isProcessing ? (
              <div
                className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-xl",
                  "bg-input border border-border-subtle text-muted-foreground"
                )}
                aria-label={t("notes.editor.processing")}
              >
                <Loader2 size={14} className="animate-spin" />
              </div>
            ) : resumeLabel ? (
              <button
                onClick={onStartRecording}
                title={resumeHint}
                className={cn(
                  "flex items-center gap-2 h-10 px-3.5 rounded-xl whitespace-nowrap",
                  "bg-input border border-border-subtle text-muted-foreground",
                  "text-[12px] font-medium",
                  "transition-colors duration-150",
                  "hover:bg-muted hover:text-foreground hover:border-border",
                  "outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
              >
                <Mic size={13} />
                {resumeLabel}
              </button>
            ) : (
              <button
                onClick={onStartRecording}
                className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-xl",
                  "bg-input border border-border-subtle text-muted-foreground",
                  "transition-colors duration-150",
                  "hover:bg-muted hover:text-foreground hover:border-border",
                  "outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
                aria-label={t("notes.editor.transcribe")}
              >
                <Mic size={15} />
              </button>
            )}
          </div>
        )}

        {!hideInput && (
          <div
            className={cn(
              "flex-1 min-w-0 flex items-center h-10 px-3 gap-2",
              "rounded-xl bg-input border",
              "transition-[border-color,box-shadow] duration-150 ease-out",
              isExpanded ? "border-border-active ring-2 ring-ring/25" : "border-border-subtle"
            )}
          >
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={handleInputFocus}
              disabled={askDisabled}
              placeholder={t("embeddedChat.askPlaceholder")}
              className={cn(
                "input-inline flex-1 bg-transparent outline-none min-w-0 p-0",
                "text-[13px] text-foreground",
                "placeholder:text-muted-foreground/70"
              )}
            />

            {hasText ? (
              <button
                onClick={handleSubmit}
                disabled={askDisabled}
                className={cn(
                  "flex items-center justify-center w-6 h-6 rounded-md shrink-0",
                  "bg-primary text-primary-foreground",
                  "transition-colors duration-150",
                  "hover:bg-primary-hover active:bg-primary-active",
                  "outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:opacity-40 disabled:pointer-events-none"
                )}
                aria-label={t("embeddedChat.send")}
              >
                <ArrowUp size={13} strokeWidth={2.5} />
              </button>
            ) : !isExpanded ? (
              <div className="shrink-0">{actionPicker}</div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
