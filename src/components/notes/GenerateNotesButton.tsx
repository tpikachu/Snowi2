import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { cn } from "../lib/utils";

interface GenerateNotesButtonProps {
  onClick: () => void;
  disabled?: boolean;
  /** A summary exists: the button re-runs the write-up, and says so. */
  regenerate?: boolean;
}

/**
 * The one thing a note can ask the model for: its write-up. Lives at the
 * RIGHT END of the note's header row (client direction, 2026-09-23 — at the
 * end of the chat bar it vanished whenever the chat panel was open; beside
 * the view switch it crowded Resume meeting), and runs on the model the chat
 * bar's chip shows — the same pick chat and the cue card use. Before a
 * summary exists it is the accent call to action; once one does it reads
 * "Regenerate Notes" as a quiet ghost, since re-running is the rarer act.
 * The dropdown of custom actions that used to stand here made one feature
 * look like a menu of them (client, 2026-09-22).
 */
export default function GenerateNotesButton({
  onClick,
  disabled,
  regenerate = false,
}: GenerateNotesButtonProps) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[11px] font-medium",
        "transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-default disabled:opacity-40",
        regenerate
          ? "border-border-subtle bg-input text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
          : "border-primary/30 bg-primary-subtle text-primary hover:border-primary/50"
      )}
    >
      <Sparkles size={11} />
      {regenerate
        ? t("notes.editor.regenerateNotes")
        : t("notes.actions.builtin.generateNotes.name")}
    </button>
  );
}
