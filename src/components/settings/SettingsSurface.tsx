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
  "group relative flex w-full items-center gap-2.5 rounded-md py-1.5 pl-2 pr-2 text-left",
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
  const [presentAnchors, setPresentAnchors] = useState<string[]>([]);
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null);

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
  const definedAnchors = section?.anchors;

  // Which anchors actually rendered. Platform-conditional groups (Wayland
  // paste, say) must never leave a link pointing at nothing.
  useEffect(() => {
    const node = contentNode;
    if (!node || !definedAnchors) {
      setPresentAnchors([]);
      return;
    }

    let frame = 0;
    const read = () => {
      frame = 0;
      const found = new Set<string>();
      node.querySelectorAll<HTMLElement>("[data-settings-group]").forEach((el) => {
        // offsetParent is null for the keep-alive panels parked behind `hidden`.
        if (el.offsetParent === null) return;
        const id = el.dataset.settingsGroup;
        if (id) found.add(id);
      });
      setPresentAnchors(definedAnchors.filter((anchor) => found.has(anchor.id)).map((a) => a.id));
    };

    read();
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(read);
    });
    observer.observe(node, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [contentNode, definedAnchors, activeSection, activePanel]);

  // Highlight the group the reader is actually looking at.
  useEffect(() => {
    const node = contentNode;
    if (!node || presentAnchors.length === 0) {
      setActiveAnchor(null);
      return;
    }

    const targets = presentAnchors
      .map((id) => node.querySelector<HTMLElement>(`[data-settings-group="${id}"]`))
      .filter((el): el is HTMLElement => !!el);
    if (targets.length === 0) return;

    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.settingsGroup;
          if (!id) continue;
          if (entry.isIntersecting) visible.set(id, entry.boundingClientRect.top);
          else visible.delete(id);
        }
        const first = presentAnchors.find((id) => visible.has(id));
        if (first) setActiveAnchor(first);
      },
      { root: node, rootMargin: "0px 0px -65% 0px", threshold: 0 }
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [contentNode, presentAnchors]);

  const scrollToAnchor = useCallback((anchorId: string) => {
    const node = scrollRef.current;
    if (!node) return;
    const target = node.querySelector<HTMLElement>(`[data-settings-group="${anchorId}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveAnchor(anchorId);
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
    const panel = section?.panels?.find((p) => p.id === activePanel);
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
        <div className="flex h-11 shrink-0 items-center border-b border-border-subtle pl-3 pr-2">
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
                            size={15}
                            className={cn("shrink-0", isActive ? "text-primary" : undefined)}
                          />
                          <span className="min-w-0 flex-1 truncate text-xs">{t(def.labelKey)}</span>
                        </button>

                        {isActive && def.panels && (
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

                        {isActive && presentAnchors.length > 1 && (
                          <ul className="mb-1 ml-[1.4rem] mt-px space-y-px border-l border-border-subtle pl-1.5">
                            {presentAnchors.map((anchorId) => {
                              const anchor = def.anchors?.find((a) => a.id === anchorId);
                              if (!anchor) return null;
                              const isAnchorActive = activeAnchor === anchorId;
                              return (
                                <li key={anchorId}>
                                  <button
                                    type="button"
                                    onClick={() => scrollToAnchor(anchorId)}
                                    aria-current={isAnchorActive ? "true" : undefined}
                                    className={cn(
                                      navItemClass,
                                      "py-1",
                                      isAnchorActive
                                        ? "text-primary"
                                        : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                                    )}
                                  >
                                    <span className="min-w-0 flex-1 truncate text-xs">
                                      {t(anchor.labelKey)}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
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
        <header className="relative z-20 flex h-11 w-full shrink-0 items-center gap-2 border-b border-border-subtle bg-background pl-4 pr-2">
          <h2 className="min-w-0 truncate text-[13px] font-medium leading-none tracking-tight text-foreground">
            {section ? t(section.labelKey) : t("settingsModal.title")}
          </h2>
          {activePanelLabel && (
            <>
              <span aria-hidden="true" className="text-muted-foreground">
                ›
              </span>
              <span className="min-w-0 truncate text-[13px] leading-none text-muted-foreground">
                {activePanelLabel}
              </span>
            </>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            title={t("settingsModal.closeHint")}
            className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors duration-150 ease-snap hover:border-border-hover hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X size={13} />
            {t("common.close")}
          </button>
        </header>

        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[76rem] px-6 pb-24 pt-6">
            <SettingsSurfaceContext.Provider value={surfaceValue}>
              <SettingsLayoutProvider value={layoutValue}>{children}</SettingsLayoutProvider>
            </SettingsSurfaceContext.Provider>
          </div>
        </div>
      </main>
    </div>
  );
}
