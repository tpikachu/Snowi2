import { useTranslation } from "react-i18next";
import { Brain, Zap } from "lucide-react";
import { cn } from "../lib/utils";
import type { ChatLane } from "../../utils/assistFastLane";

/**
 * The two speeds of a chat answer, as a compact segment beside the input.
 *
 * The same pair the meeting panel offers, in the app's own visual language
 * rather than the HUD's. Both lanes are the full agent with the same tools —
 * Fast swaps in the fast-lane model with thinking off, Thinking keeps the
 * chat model and the user's thinking setting. The
 * default belongs to the surface — the bar defaults to Fast because it is the
 * glance-and-go surface, the app chat to Thinking because someone sitting in
 * the app has time for the better answer. Neither choice is persisted: each
 * surface re-defaults so its promise holds for the next question.
 *
 * `compact` drops the labels to icons for the 56px bar, where the tooltip
 * carries the words instead.
 */
export function LaneToggle({
  lane,
  onChange,
  disabled = false,
  compact = false,
}: {
  lane: ChatLane;
  onChange: (lane: ChatLane) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const options: Array<{ id: ChatLane; icon: typeof Zap; label: string; hint: string }> = [
    {
      id: "fast",
      icon: Zap,
      label: t("agentMode.lane.fast"),
      hint: t("agentMode.lane.fastHint"),
    },
    {
      id: "thinking",
      icon: Brain,
      label: t("agentMode.lane.thinking"),
      hint: t("agentMode.lane.thinkingHint"),
    },
  ];

  return (
    <div
      role="radiogroup"
      aria-label={t("agentMode.lane.label")}
      className="flex shrink-0 items-center gap-px rounded-full border border-border/40 bg-surface-2 p-0.5"
    >
      {options.map(({ id, icon: Icon, label, hint }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={lane === id}
          aria-label={label}
          disabled={disabled}
          onClick={() => onChange(id)}
          title={hint}
          className={cn(
            "flex h-[22px] items-center gap-1 rounded-full text-[10.5px] font-medium",
            compact ? "px-1.5" : "px-2",
            "transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-40",
            lane === id
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon size={11} />
          {!compact && label}
        </button>
      ))}
    </div>
  );
}
