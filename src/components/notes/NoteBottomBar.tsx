import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp } from "lucide-react";
import { cn } from "../lib/utils";

interface NoteBottomBarProps {
  onAskSubmit: (text: string) => void;
  onInputFocus?: () => void;
  askDisabled?: boolean;
  /** The model chip, at the field's left edge — the global chat's shape. */
  accessory?: React.ReactNode;
}

/**
 * The note's ask bar: one field with the model chip inside it, exactly the
 * global chat composer's shape (client direction, 2026-09-23). Asking opens
 * the note's chat, which then carries its own composer — so this renders
 * only while that chat is hidden. Recording and Generate Notes live in the
 * note's header; nothing else shares this row.
 */
export default function NoteBottomBar({
  onAskSubmit,
  onInputFocus,
  askDisabled,
  accessory,
}: NoteBottomBarProps) {
  const { t } = useTranslation();
  const [inputText, setInputText] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
        className={cn(
          "pointer-events-auto flex h-11 items-center gap-2 px-3",
          "rounded-xl bg-input border",
          "transition-[border-color,box-shadow] duration-150 ease-out",
          isExpanded ? "border-border-active ring-2 ring-ring/25" : "border-border-subtle"
        )}
      >
        {accessory}
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
        <button
          onClick={handleSubmit}
          disabled={askDisabled || !hasText}
          className={cn(
            "flex items-center justify-center w-6 h-6 rounded-md shrink-0",
            "transition-colors duration-150",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring",
            hasText
              ? "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active"
              : "text-muted-foreground/25 cursor-default"
          )}
          aria-label={t("embeddedChat.send")}
        >
          <ArrowUp size={13} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
