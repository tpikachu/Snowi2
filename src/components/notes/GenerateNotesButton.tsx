import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { cn } from "../lib/utils";

interface GenerateNotesButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

/**
 * The one thing a note can ask the model for: its write-up. Sits at the end
 * of the note's chat bar, and runs on the model the chip at the bar's other
 * end shows — the same pick chat and the cue card use. The dropdown of
 * custom actions that used to live here (with its own model per action)
 * made one feature look like a menu of them (client direction, 2026-09-22).
 */
export default function GenerateNotesButton({ onClick, disabled }: GenerateNotesButtonProps) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 h-7 px-2.5 rounded-lg",
        "bg-accent/6 dark:bg-accent/10",
        "text-accent/60 dark:text-accent/50",
        "transition-colors duration-150",
        "hover:bg-accent/10 dark:hover:bg-accent/15",
        "hover:text-accent/80 dark:hover:text-accent/70",
        "active:scale-[0.98]",
        "disabled:opacity-30 disabled:pointer-events-none"
      )}
    >
      <Sparkles size={11} />
      <span className="text-[11px] font-semibold tracking-tight">
        {t("notes.actions.builtin.generateNotes.name")}
      </span>
    </button>
  );
}
