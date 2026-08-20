import React from "react";
import { Home, MessageSquare, NotebookPen, BookOpen, Settings, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import { Tooltip } from "../ui/tooltip";
import { getCachedPlatform } from "../../utils/platform";
import { SnowyGlyph } from "../ui/BrandMark";

const platform = getCachedPlatform();
const isMac = platform === "darwin";

/** The rail is 48px wide — narrower than the macOS traffic lights, which the
 *  frameless window draws at x:20,y:20 (trafficLightPosition in
 *  windowConfig.js). So the rail can't inset from the left the way a wide
 *  sidebar did: it starts *below* them instead. */
export const ICON_RAIL_WIDTH_PX = 48;
const RAIL_TOP_INSET = isMac ? 38 : 4;

export type ControlPanelView = "home" | "chat" | "personal-notes" | "dictionary" | "upload";

const railButtonClass = [
  "relative flex size-9 items-center justify-center rounded-md",
  "outline-none transition-colors duration-150 ease-snap",
  "focus-visible:ring-2 focus-visible:ring-ring",
].join(" ");

const railButtonIdleClass =
  "text-muted-foreground hover:bg-surface-3 hover:text-foreground active:bg-surface-raised";

function RailButton({
  icon: Icon,
  label,
  onClick,
  isActive,
  children,
  tourAnchor,
}: {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  onClick?: () => void;
  isActive?: boolean;
  children?: React.ReactNode;
  /** Names this button as a guided-tour anchor (config/tourSteps.ts). */
  tourAnchor?: string;
}) {
  return (
    <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
      <Tooltip content={label} side="right" showOnFocus>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-current={isActive ? "page" : undefined}
          data-tour={tourAnchor}
          className={cn(
            railButtonClass,
            isActive ? "bg-primary/10 dark:bg-primary/15 text-primary" : railButtonIdleClass
          )}
        >
          {/* Active marker sits flush against the window edge, in the rail's padding. */}
          {isActive && (
            <span
              aria-hidden="true"
              className="absolute -left-1.5 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-primary"
            />
          )}
          {children ?? (Icon ? <Icon size={16} /> : null)}
        </button>
      </Tooltip>
    </div>
  );
}

interface IconRailProps {
  activeView: ControlPanelView;
  onViewChange: (view: ControlPanelView) => void;
  onOpenSettings: () => void;
  onOpenSearch?: () => void;
  /** Rendered as an extra rail button above Settings while an update is pending. */
  updateAction?: React.ReactNode;
}

/**
 * The permanent 48px navigation rail. It never collapses, so the window's left
 * edge is always the same thing and the section switcher can never be hidden
 * behind a peeking panel.
 */
export default function IconRail({
  activeView,
  onViewChange,
  onOpenSettings,
  onOpenSearch,
  updateAction,
}: IconRailProps) {
  const { t } = useTranslation();

  const navItems: {
    id: ControlPanelView;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    tourAnchor?: string;
  }[] = [
    { id: "home", label: t("sidebar.home"), icon: Home, tourAnchor: "nav-home" },
    { id: "chat", label: t("sidebar.chat"), icon: MessageSquare, tourAnchor: "nav-chat" },
    {
      id: "personal-notes",
      label: t("sidebar.notes"),
      icon: NotebookPen,
      tourAnchor: "nav-notes",
    },
    // Upload is hidden for now (product decision). The view, its route and
    // UploadAudioView stay wired up so re-enabling is a one-line change.
    // { id: "upload", label: t("sidebar.upload"), icon: Upload },
    { id: "dictionary", label: t("sidebar.dictionary"), icon: BookOpen },
  ];

  return (
    <aside
      className="flex h-full shrink-0 flex-col items-center gap-1 border-r border-border-subtle bg-surface-1 pb-2"
      style={
        {
          WebkitAppRegion: "drag",
          width: ICON_RAIL_WIDTH_PX,
          paddingTop: RAIL_TOP_INSET,
        } as React.CSSProperties
      }
    >
      <div className="flex size-9 shrink-0 items-center justify-center" title="Snowy">
        <SnowyGlyph className="shrink-0 text-primary" />
      </div>

      {onOpenSearch && (
        <RailButton icon={Search} label={t("commandSearch.title")} onClick={onOpenSearch} />
      )}

      <div aria-hidden="true" className="my-1 h-px w-6 shrink-0 bg-border-subtle" />

      <nav
        aria-label={t("sidebar.navigationLabel")}
        className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto"
      >
        {navItems.map((item) => (
          <RailButton
            key={item.id}
            icon={item.icon}
            label={item.label}
            isActive={activeView === item.id}
            onClick={() => onViewChange(item.id)}
            tourAnchor={item.tourAnchor}
          />
        ))}
      </nav>

      <div className="flex shrink-0 flex-col items-center gap-1 border-t border-border-subtle pt-2">
        {updateAction}
        <RailButton
          icon={Settings}
          label={t("sidebar.settings")}
          onClick={onOpenSettings}
          tourAnchor="nav-settings"
        />
      </div>
    </aside>
  );
}
