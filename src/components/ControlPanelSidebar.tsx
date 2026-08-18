import React from "react";
import { Home, MessageSquare, NotebookPen, BookOpen, Upload, Settings, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "./lib/utils";
import { getCachedPlatform } from "../utils/platform";

const platform = getCachedPlatform();
const isMac = platform === "darwin";

/**
 * macOS renders its traffic lights over the top-left of the frameless window
 * (trafficLightPosition x:20 in windowConfig.js), so the brand row starts
 * clear of them instead of underneath.
 */
const TITLEBAR_LEFT_INSET = isMac ? 84 : 12;

export type ControlPanelView = "home" | "chat" | "personal-notes" | "dictionary" | "upload";

/** One shared geometry for every rail row: nav items and the settings footer. */
const railRowClass = [
  "group relative flex w-full items-center gap-2.5 h-8 px-2.5 rounded-md text-left",
  "outline-none transition-colors duration-150 ease-snap",
  "focus-visible:ring-2 focus-visible:ring-ring",
].join(" ");

const railRowIdleClass =
  "text-muted-foreground hover:bg-surface-3 hover:text-foreground active:bg-surface-raised";

const railLabelClass = "flex-1 truncate text-[13px] leading-none";

const kbdClass = [
  "inline-flex h-4 min-w-4 items-center justify-center rounded-[3px] px-1",
  "border border-border-subtle bg-surface-3 font-mono text-[10px] leading-none text-muted-foreground",
].join(" ");

function BrandMark() {
  // Mirrors src/assets/logo.svg, inlined so it can take the accent colour.
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="shrink-0 text-primary"
    >
      <path
        d="M8 1.5v13M2.4 4.75l11.2 6.5M2.4 11.25l11.2-6.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface ControlPanelSidebarProps {
  activeView: ControlPanelView;
  onViewChange: (view: ControlPanelView) => void;
  onOpenSettings: () => void;
  onOpenSearch?: () => void;
  updateAction?: React.ReactNode;
}

export default function ControlPanelSidebar({
  activeView,
  onViewChange,
  onOpenSettings,
  onOpenSearch,
  updateAction,
}: ControlPanelSidebarProps) {
  const { t } = useTranslation();

  const navItems: {
    id: ControlPanelView;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
  }[] = [
    { id: "home", label: t("sidebar.home"), icon: Home },
    { id: "chat", label: t("sidebar.chat"), icon: MessageSquare },
    { id: "personal-notes", label: t("sidebar.notes"), icon: NotebookPen },
    { id: "upload", label: t("sidebar.upload"), icon: Upload },
    { id: "dictionary", label: t("sidebar.dictionary"), icon: BookOpen },
  ];

  return (
    <aside className="flex h-full w-48 shrink-0 flex-col border-r border-border-subtle bg-surface-1">
      {/* Title bar strip — the sidebar's half of the window drag region. */}
      <div
        className="flex h-11 shrink-0 items-center gap-2 pr-3"
        style={{ WebkitAppRegion: "drag", paddingLeft: TITLEBAR_LEFT_INSET } as React.CSSProperties}
      >
        <BrandMark />
        <span className="truncate text-[13px] font-semibold tracking-tight text-foreground">
          Snowi
        </span>
      </div>

      {onOpenSearch && (
        <div className="px-2 pb-2">
          <button
            onClick={onOpenSearch}
            className={[
              "group flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left",
              "border border-border bg-input outline-none transition-colors duration-150 ease-snap",
              "hover:border-border-hover hover:bg-surface-2",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-border-active",
            ].join(" ")}
          >
            <Search
              size={13}
              className="shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
            />
            <span className="flex-1 truncate text-xs text-muted-foreground">
              {t("commandSearch.shortPlaceholder")}
            </span>
            <span className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
              <kbd className={kbdClass}>{isMac ? "⌘" : "Ctrl"}</kbd>
              <kbd className={kbdClass}>K</kbd>
            </span>
          </button>
        </div>
      )}

      <nav
        aria-label={t("sidebar.navigationLabel")}
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                railRowClass,
                isActive ? "bg-primary/10 dark:bg-primary/15 text-foreground" : railRowIdleClass
              )}
            >
              {/* Active rail sits flush against the sidebar edge, in the nav's own padding. */}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute -left-2 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-primary"
                />
              )}
              <Icon
                size={15}
                className={cn(
                  "shrink-0 transition-colors duration-150",
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )}
              />
              <span className={cn(railLabelClass, isActive && "font-medium")}>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-border-subtle px-2 py-2">
        {updateAction && (
          <div className="pb-1.5" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            {updateAction}
          </div>
        )}

        <button
          onClick={onOpenSettings}
          aria-label={t("sidebar.settings")}
          className={cn(railRowClass, railRowIdleClass)}
        >
          <Settings
            size={15}
            className="shrink-0 text-muted-foreground transition-colors duration-150 group-hover:text-foreground"
          />
          <span className={railLabelClass}>{t("sidebar.settings")}</span>
        </button>
      </div>
    </aside>
  );
}
