import React from "react";
import { useTranslation } from "react-i18next";
import { Archive, CalendarClock, Layers, Mic, NotebookPen } from "lucide-react";
import { cn } from "../lib/utils";
import { ACTIVITY_FILTERS, type ActivityFilter, type ActivityGroup } from "./useActivityFeed";
import { DICTATION_ENABLED } from "../../config/features";

const paneLabelClass =
  "px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";

const rowClass = [
  "group flex h-8 w-full items-center gap-2 rounded-md px-2 text-left",
  "outline-none transition-colors duration-150 ease-snap",
  "focus-visible:ring-2 focus-visible:ring-ring",
].join(" ");

const rowIdleClass = "text-muted-foreground hover:bg-surface-3 hover:text-foreground";

const ALL_FACETS: {
  id: ActivityFilter;
  labelKey: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { id: "all", labelKey: "activity.filters.all", icon: Layers },
  { id: "dictation", labelKey: "activity.filters.dictations", icon: Mic },
  { id: "meeting", labelKey: "activity.filters.meetings", icon: CalendarClock },
  { id: "note", labelKey: "activity.filters.notes", icon: NotebookPen },
];

// Ordered by ACTIVITY_FILTERS rather than filtered against it, so the feed and
// the chips cannot disagree about which facets exist.
const facets = ALL_FACETS.filter((facet) => ACTIVITY_FILTERS.includes(facet.id));

interface ActivityFiltersProps {
  filter: ActivityFilter;
  onFilterChange: (filter: ActivityFilter) => void;
  counts: Record<ActivityFilter, number>;
  groups: ActivityGroup[];
  showDiscarded: boolean;
  onToggleDiscarded: () => void;
  onJumpToGroup: (groupId: string) => void;
}

/** Home's context pane: the facets and day jumps that scope the feed. */
export default function ActivityFilters({
  filter,
  onFilterChange,
  counts,
  groups,
  showDiscarded,
  onToggleDiscarded,
  onJumpToGroup,
}: ActivityFiltersProps) {
  const { t } = useTranslation();
  // "Show discarded" reloads the transcription store, so it only ever affected
  // dictations. With them hidden it is a toggle that changes nothing.
  const dictationsIncluded = DICTATION_ENABLED && (filter === "all" || filter === "dictation");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-3">
      <p className={cn(paneLabelClass, "pb-1.5 pt-1")}>{t("activity.filters.label")}</p>
      <div role="group" aria-label={t("activity.filters.label")} className="flex flex-col gap-0.5">
        {facets.map((facet) => {
          const Icon = facet.icon;
          const isActive = filter === facet.id;
          return (
            <button
              key={facet.id}
              type="button"
              onClick={() => onFilterChange(facet.id)}
              aria-pressed={isActive}
              className={cn(
                rowClass,
                isActive ? "bg-primary/10 dark:bg-primary/15 text-foreground" : rowIdleClass
              )}
            >
              <Icon
                size={14}
                className={cn(
                  "shrink-0 transition-colors duration-150",
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )}
              />
              <span className={cn("flex-1 truncate text-[13px]", isActive && "font-medium")}>
                {t(facet.labelKey)}
              </span>
              <span className="tabular-figures shrink-0 text-[11px] text-muted-foreground">
                {counts[facet.id]}
              </span>
            </button>
          );
        })}
      </div>

      {dictationsIncluded && (
        <button
          type="button"
          onClick={onToggleDiscarded}
          aria-pressed={showDiscarded}
          className={cn(
            rowClass,
            "mt-1",
            showDiscarded ? "bg-surface-3 text-foreground" : rowIdleClass
          )}
        >
          <Archive size={14} className="shrink-0" />
          <span className="flex-1 truncate text-[13px]">
            {showDiscarded
              ? t("controlPanel.history.discarded.hide")
              : t("controlPanel.history.discarded.show")}
          </span>
        </button>
      )}

      {groups.length > 0 && (
        <>
          <div aria-hidden="true" className="my-2.5 h-px shrink-0 bg-border-subtle" />
          <p className={cn(paneLabelClass, "pb-1.5")}>{t("commandSearch.sections.jumpTo")}</p>
          <div className="flex flex-col gap-0.5">
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => onJumpToGroup(group.id)}
                className={cn(rowClass, "h-7", rowIdleClass)}
              >
                <span className="flex-1 truncate text-xs">{group.label}</span>
                <span className="tabular-figures shrink-0 text-[11px] text-muted-foreground/70">
                  {group.entries.length}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
