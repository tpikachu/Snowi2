import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../ui/dropdown-menu";
import { cn } from "../lib/utils";
import {
  useActions,
  initializeActions,
  getActionName,
  getActionDescription,
} from "../../stores/actionStore";
import { selectResolvedActions, useSettingsStore } from "../../stores/settingsStore";
import type { ActionItem } from "../../types/electron";

interface ActionPickerProps {
  onRunAction: (action: ActionItem) => void;
  disabled?: boolean;
}

/**
 * Run an action on the open note.
 *
 * Runs them; does not manage them. Creating and editing actions used to hang
 * off this dropdown, which put a configuration screen one click from a note
 * and made "which of these am I about to run" and "what is this app set up
 * with" the same menu. That lives in Settings now, next to the model the
 * actions actually run on.
 *
 * Hidden outright when note formatting has no model. There is nothing to run,
 * so an enabled button that can only produce "you have not set this up" is a
 * trap — and offering it beside a note the user is reading suggests the note
 * is what needs configuring, which it is not.
 */
export default function ActionPicker({ onRunAction, disabled }: ActionPickerProps) {
  const { t } = useTranslation();
  const actions = useActions();
  const hasModel = useSettingsStore((state) => Boolean(selectResolvedActions(state).model));
  const [lastUsedId, setLastUsedId] = useState<number | null>(() => {
    const stored = localStorage.getItem("lastUsedActionId");
    return stored ? Number(stored) : null;
  });

  useEffect(() => {
    initializeActions();
  }, []);

  const activeAction = actions.find((a) => a.id === lastUsedId) ?? actions[0] ?? null;

  const handleRun = (action: ActionItem) => {
    setLastUsedId(action.id);
    localStorage.setItem("lastUsedActionId", String(action.id));
    onRunAction(action);
  };

  if (!activeAction || !hasModel) return null;

  return (
    <div className="flex items-center shrink-0">
      <button
        onClick={() => handleRun(activeAction)}
        disabled={disabled}
        aria-label={t("notes.actions.runAction", { name: getActionName(activeAction, t) })}
        className={cn(
          "flex items-center gap-1.5 h-7 pl-2.5 pr-1.5 rounded-l-lg",
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
          {getActionName(activeAction, t)}
        </span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            disabled={disabled}
            aria-label={t("notes.actions.selectAction")}
            className={cn(
              "flex items-center justify-center h-7 w-5 rounded-r-lg",
              "bg-accent/6 dark:bg-accent/10",
              "text-accent/35 dark:text-accent/25",
              "transition-colors duration-150",
              "hover:bg-accent/10 dark:hover:bg-accent/15",
              "hover:text-accent/60",
              "disabled:opacity-30 disabled:pointer-events-none"
            )}
          >
            <ChevronDown size={10} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" sideOffset={8} className="min-w-48">
          {actions.map((action) => (
            <DropdownMenuItem
              key={action.id}
              onClick={() => handleRun(action)}
              className={cn(
                "text-xs gap-2.5 rounded-md px-2.5 py-1.5",
                action.id === activeAction.id && "bg-accent/5"
              )}
            >
              <Sparkles size={12} className="text-accent/50 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{getActionName(action, t)}</div>
                {action.description && (
                  <div className="text-xs text-muted-foreground/50 truncate">
                    {getActionDescription(action, t)}
                  </div>
                )}
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
