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
        // A translucent strip, not an opaque surface: the overlay card is the
        // cue card's glass, and any opaque fill here would sit on it as a
        // solid patch.
        "bg-white/[0.06]",
        "border-b border-white/10",
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
