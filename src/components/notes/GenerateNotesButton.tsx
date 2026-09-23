import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { cn } from "../lib/utils";

interface GenerateNotesButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

/**
 * The one thing a note can ask the model for: its write-up. Lives in the
 * note's header beside the view switch (client direction, 2026-09-23 — at
 * the end of the chat bar it vanished whenever the chat panel was open),
 * and runs on the model the chat bar's chip shows — the same pick chat and
 * the cue card use. The dropdown of custom actions that used to stand here
 * made one feature look like a menu of them (client, 2026-09-22).
 */
export default function GenerateNotesButton({ onClick, disabled }: GenerateNotesButtonProps) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5",
        "border border-primary/30 bg-primary-subtle text-[11px] font-medium text-primary",
        "transition-colors duration-150 hover:border-primary/50",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-default disabled:opacity-40"
      )}
    >
      <Sparkles size={11} />
      {t("notes.actions.builtin.generateNotes.name")}
    </button>
  );
}
