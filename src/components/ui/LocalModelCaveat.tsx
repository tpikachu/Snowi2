import { GlobeLock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "./tooltip";
import { cn } from "../lib/utils";

/**
 * What a model on this computer gives up, as a badge the eye lands on at the
 * moment of choice: "No web search" — or "No web or notes search" for a
 * model too small to use tools at all — in the warning colour, one notch
 * softer than the memory warning (a limitation, maybe chosen on purpose for
 * privacy; not a blocker). The tooltip explains the feature, not the badge:
 * what web search does during a meeting and where such a model answers
 * from instead (client direction, 2026-09-22). Before this the caveat was a
 * muted phrase glued to the memory figure, and read as a spec line.
 */
export function LocalModelCaveat({ toolsOff, hud }: { toolsOff: boolean; hud?: boolean }) {
  const { t } = useTranslation();
  const label = t(toolsOff ? "models.local.noWebOrNotesSearch" : "models.local.noWebSearch");
  const hint = t(toolsOff ? "models.local.webAndNotesSearchHint" : "models.local.webSearchHint");
  return (
    <Tooltip content={hint} wrap>
      <span
        data-local-caveat={toolsOff ? "tools" : "web"}
        className={cn(
          "inline-flex shrink-0 items-center gap-0.5 border text-warning",
          // The chip's rows wear 9px pills; the Settings cards wear micro-caps.
          hud
            ? "rounded-[4px] border-warning/35 px-1 py-px text-[9px] font-semibold uppercase tracking-[0.06em]"
            : "micro-caps rounded-control border-warning/40 bg-warning-subtle/60 px-1.5 py-0.5"
        )}
      >
        <GlobeLock size={9} aria-hidden="true" />
        {label}
      </span>
    </Tooltip>
  );
}
