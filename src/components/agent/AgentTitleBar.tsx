import { ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import { getAgentName } from "../../utils/agentName";

interface AgentTitleBarProps {
  /** Collapse the chat column back into the bar (the conversation is already
   *  persisted to history; the bar's X and Escape still hide the window). */
  onCollapse: () => void;
}

export function AgentTitleBar({ onCollapse }: AgentTitleBarProps) {
  const { t } = useTranslation();
  const agentName = getAgentName();

  return (
    <div
      className={cn(
        "flex items-center justify-between h-8 px-3",
        "bg-surface-1",
        "border-b border-border/20",
        "shadow-[0_1px_2px_0_oklch(0_0_0/0.04)]",
        "select-none"
      )}
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <span className="text-[11px] text-muted-foreground font-medium tracking-wide uppercase">
        {agentName}
      </span>

      <div
        className="flex items-center gap-0.5"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          onClick={onCollapse}
          className={cn(
            "p-1 rounded-sm",
            "text-muted-foreground hover:text-foreground hover:bg-foreground/10",
            "transition-colors duration-150",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
          aria-label={t("agentMode.titleBar.collapse")}
          title={t("agentMode.titleBar.collapse")}
        >
          <ChevronUp size={14} />
        </button>
      </div>
    </div>
  );
}
