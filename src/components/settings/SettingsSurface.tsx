import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import { cn } from "../lib/utils";
import { SettingsLayoutProvider } from "../ui/useSettingsLayout";
import {
  SETTINGS_SEARCH_INDEX,
  SETTINGS_SECTIONS,
  SECTION_BY_ID,
  type SettingsSearchEntry,
  type SettingsSectionType,
} from "./settingsNav";
import {
  SETTINGS_COMPACT_PX,
  SETTINGS_WIDE_PX,
  SettingsSurfaceContext,
} from "./settingsSurfaceContext";

const NAV_WIDTH_PX = 248;

const navItemClass = [
  "group relative flex w-full items-center gap-2.5 rounded-lg py-2 pl-2.5 pr-2 text-left",
  "outline-none transition-colors duration-150 ease-snap",
  "focus-visible:ring-2 focus-visible:ring-ring",
].join(" ");

function NavGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-3 first:pt-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
        {children}
      </span>
    </div>
  );
}

interface SettingsSurfaceProps {
  activeSection: SettingsSectionType;
  onSectionChange: (section: SettingsSectionType) => void;
  activePanel: string | undefined;
  onPanelChange: (section: SettingsSectionType, panel: string) => void;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * The settings surface: a section-scoped context pane plus a content pane,
 * echoing the shell's own two-column language rather than a centred dialog.
 * The container that mounts it (SettingsModal) owns dismissal.
 */
export default function SettingsSurface({
  activeSection,
  onSectionChange,
  activePanel,
  onPanelChange,
  onClose,
  children,
}: SettingsSurfaceProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [contentNode, setContentNode] = useState<HTMLDivElement | null>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const [query, setQuery] = useState("");

  const isCompact = contentWidth > 0 && contentWidth < SETTINGS_COMPACT_PX;
  const isWide = contentWidth >= SETTINGS_WIDE_PX;

  const contentRef = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    setContentNode(node);
    if (node) setContentWidth(node.clientWidth);
  }, []);

  // Track the content column's own width — the window is resizable and the
  // rhythm of every row depends on it.
  useEffect(() => {
    if (!contentNode || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) setContentWidth(width);
    });
    observer.observe(contentNode);
    return () => observer.disconnect();
  }, [contentNode]);

  const section = SECTION_BY_ID[activeSection];

  // Anchors no longer render in the nav (the tree is flat now); they survive
  // purely as scroll targets, resolved from the DOM at click time so search
  // never promises a group that isn't rendered.
  const scrollToAnchor = useCallback((anchorId: string) => {
    const node = scrollRef.current;
    if (!node) return;
    const target = node.querySelector<HTMLElement>(`[data-settings-group="${anchorId}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const results: SettingsSearchEntry[] = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const seen = new Set<string>();
    const matches: SettingsSearchEntry[] = [];

    for (const entry of SETTINGS_SEARCH_INDEX) {
      const label = t(entry.labelKey);
      if (!label.toLowerCase().includes(needle)) continue;
      const dedupeKey = `${entry.section}|${entry.panel ?? ""}|${label}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      matches.push(entry);
    }

    // Sections whose own name matches are worth offering too.
    for (const def of SETTINGS_SECTIONS) {
      const label = t(def.labelKey);
      if (!label.toLowerCase().includes(needle)) continue;
      const dedupeKey = `${def.id}||${label}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      matches.unshift({ section: def.id, labelKey: def.labelKey });
    }

    return matches.slice(0, 40);
  }, [query, t]);

  const goToResult = useCallback(
    (entry: SettingsSearchEntry) => {
      if (entry.panel) onPanelChange(entry.section, entry.panel);
      else onSectionChange(entry.section);
      if (entry.anchor) {
        // Let the section commit before hunting for the group.
        requestAnimationFrame(() => requestAnimationFrame(() => scrollToAnchor(entry.anchor!)));
      } else {
        requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0 }));
      }
    },
    [onPanelChange, onSectionChange, scrollToAnchor]
  );

  const handleSectionClick = useCallback(
    (id: SettingsSectionType) => {
      onSectionChange(id);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0 }));
    },
    [onSectionChange]
  );

  const activePanelLabel = useMemo(() => {
    // A lone panel IS its section; naming it again in the breadcrumb would
    // just restate the header with a different word.
    if (!section?.panels || section.panels.length <= 1) return null;
    const panel = section.panels.find((p) => p.id === activePanel);
    return panel ? t(panel.labelKey) : null;
  }, [section, activePanel, t]);

  const navGroups = useMemo(() => {
    const groups: { key: string; sections: typeof SETTINGS_SECTIONS }[] = [];
    for (const def of SETTINGS_SECTIONS) {
      const last = groups[groups.length - 1];
      if (last && last.key === def.groupKey) last.sections.push(def);
      else groups.push({ key: def.groupKey, sections: [def] });
    }
    return groups;
  }, []);

  const layoutValue = useMemo(() => ({ isCompact }), [isCompact]);
  const surfaceValue = useMemo(() => ({ isCompact, isWide }), [isCompact, isWide]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
      {/* ---- Context pane: sections, sub-surfaces and in-page anchors ------ */}
      <aside
        className="flex h-full shrink-0 flex-col border-r border-border-subtle bg-surface-1"
        style={{ width: NAV_WIDTH_PX }}
      >
        <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-border-subtle pl-2 pr-2">
          {/* Close lives at the head of the sidebar, where the eye starts —
              Escape and the backdrop still dismiss. */}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            title={t("settingsModal.closeHint")}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors duration-150 ease-snap hover:bg-surface-3 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X size={15} />
          </button>
          {/* The dialog's own accessible title already announces this, so the
              visible copy is decoration rather than another heading. */}
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-none tracking-tight text-foreground">
            {t("settingsModal.title")}
          </span>
        </div>

        <div className="shrink-0 border-b border-border-subtle px-2.5 py-2">
          <label htmlFor="settings-search" className="sr-only">
            {t("settingsModal.search.label")}
          </label>
          <div className="relative">
            <Search
              size={13}
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="settings-search"
              type="search"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query) {
                  event.stopPropagation();
                  setQuery("");
                  return;
                }
                if (event.key === "Enter" && results[0]) {
                  event.preventDefault();
                  goToResult(results[0]);
                }
              }}
              placeholder={t("settingsModal.search.placeholder")}
              className="h-8 w-full rounded-md pl-7 pr-7 text-xs [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("settingsModal.search.clear")}
                className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {query ? (
          <nav
            aria-label={t("settingsModal.search.resultsLabel")}
            className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
          >
            {results.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs leading-relaxed text-muted-foreground">
                {t("settingsModal.search.noResults", { query: query.trim() })}
              </p>
            ) : (
              <ul className="space-y-px">
                {results.map((entry, index) => {
                  const def = SECTION_BY_ID[entry.section];
                  const panelLabel = def.panels?.find((p) => p.id === entry.panel)?.labelKey;
                  const trail = [t(def.labelKey), panelLabel ? t(panelLabel) : null]
                    .filter(Boolean)
                    .join(" › ");
                  return (
                    <li key={`${entry.section}-${entry.panel ?? ""}-${entry.labelKey}-${index}`}>
                      <button
                        type="button"
                        onClick={() => goToResult(entry)}
                        className={cn(
                          navItemClass,
                          "flex-col items-start gap-0.5 py-1.5 text-muted-foreground hover:bg-surface-3 hover:text-foreground"
                        )}
                      >
                        <span className="w-full truncate text-xs font-medium text-foreground">
                          {t(entry.labelKey)}
                        </span>
                        <span className="w-full truncate text-[11px] text-muted-foreground">
                          {trail}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>
        ) : (
          <nav
            aria-label={t("settingsModal.navLabel")}
            className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"
          >
            {navGroups.map((group) => (
              <div key={group.key}>
                <NavGroupLabel>{t(group.key)}</NavGroupLabel>
                <ul className="space-y-px">
                  {group.sections.map((def) => {
                    const Icon = def.icon;
                    const isActive = activeSection === def.id;
                    return (
                      <li key={def.id}>
                        <button
                          type="button"
                          onClick={() => handleSectionClick(def.id)}
                          aria-current={isActive ? "page" : undefined}
                          title={t(def.descriptionKey)}
                          className={cn(
                            navItemClass,
                            isActive
                              ? "bg-surface-3 font-medium text-foreground"
                              : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                          )}
                        >
                          <Icon
                            size={16}
                            className={cn("shrink-0", isActive ? "text-primary" : undefined)}
                          />
                          <span className="min-w-0 flex-1 truncate text-[13px]">
                            {t(def.labelKey)}
                          </span>
                        </button>

                        {/* Sub-items only when there is a genuine choice: a
                            lone panel (or a page's own scroll anchors) as nav
                            children just made the tree look deeper than the
                            settings are (client direction, 2026-09). */}
                        {isActive && def.panels && def.panels.length > 1 && (
                          <ul className="mb-1 ml-[1.4rem] mt-px space-y-px border-l border-border-subtle pl-1.5">
                            {def.panels.map((panel) => {
                              const PanelIcon = panel.icon;
                              const isPanelActive = activePanel === panel.id;
                              return (
                                <li key={panel.id}>
                                  <button
                                    type="button"
                                    onClick={() => onPanelChange(def.id, panel.id)}
                                    aria-current={isPanelActive ? "true" : undefined}
                                    className={cn(
                                      navItemClass,
                                      "py-1",
                                      isPanelActive
                                        ? "bg-primary/10 font-medium text-primary dark:bg-primary/15"
                                        : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                                    )}
                                  >
                                    <PanelIcon size={13} className="shrink-0" />
                                    <span className="min-w-0 flex-1 truncate text-xs">
                                      {t(panel.labelKey)}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}

                        {/* The anchor sub-list is gone with the same stroke —
                            the anchors themselves survive as scroll targets
                            for settings search. */}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        )}
      </aside>

      {/* ---- Content pane ------------------------------------------------- */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[76rem] px-6 pb-24 pt-7">
            {/* The page header sits in the content, not a chrome bar: the
                section's name in full weight with its one-line purpose under
                it, so every section opens by saying what it is for. Width
                follows the content — centred at reading measure normally,
                full-width when the section flows into two columns. */}
            <div
              className={cn(
                "mb-6",
                !!section?.twoColumn && isWide ? "w-full" : "mx-auto w-full max-w-[46rem]"
              )}
            >
              <h2 className="flex min-w-0 items-baseline gap-2 text-[17px] font-semibold leading-tight tracking-tight text-foreground">
                <span className="truncate">
                  {section ? t(section.labelKey) : t("settingsModal.title")}
                </span>
                {activePanelLabel && (
                  <>
                    <span aria-hidden="true" className="shrink-0 text-sm text-muted-foreground">
                      ›
                    </span>
                    <span className="truncate text-sm font-medium text-muted-foreground">
                      {activePanelLabel}
                    </span>
                  </>
                )}
              </h2>
              {section && (
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {t(section.descriptionKey)}
                </p>
              )}
            </div>
            <SettingsSurfaceContext.Provider value={surfaceValue}>
              <SettingsLayoutProvider value={layoutValue}>{children}</SettingsLayoutProvider>
            </SettingsSurfaceContext.Provider>
          </div>
        </div>
      </main>
    </div>
  );
}
