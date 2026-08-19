import React, { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { ChevronDown, Search, X, Check } from "lucide-react";
import registry from "../../config/languageRegistry.json";
import { LIST_SEARCH_THRESHOLD } from "../../config/constants";

export interface LanguageOption {
  value: string;
  label: string;
  flag: string;
}

const REGISTRY_OPTIONS: LanguageOption[] = registry.languages.map(({ code, label, flag }) => ({
  value: code,
  label,
  flag,
}));

interface LanguageSelectorProps {
  value: string;
  onChange: (value: string) => void;
  options?: LanguageOption[];
  className?: string;
  placeholder?: string;
}

export default function LanguageSelector({
  value,
  onChange,
  options,
  className = "",
  placeholder,
}: LanguageSelectorProps) {
  const { t } = useTranslation();
  const items = options ?? REGISTRY_OPTIONS;
  const showSearch = items.length > LIST_SEARCH_THRESHOLD;
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(
    typeof document === "undefined" ? null : document.body
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredLanguages = showSearch
    ? items.filter(
        (lang) =>
          lang.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          lang.value.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : items;

  const handleSearchQueryChange = useCallback((value: string) => {
    setSearchQuery(value);
    setHighlightedIndex(0);
  }, []);

  // Determine the portal container: use the closest dialog if inside one (to stay
  // within Radix's focus trap), otherwise fall back to document.body.
  const setContainerNode = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    if (!node) return;
    const dialog = node.closest('[role="dialog"]');
    setPortalTarget((dialog as HTMLElement) ?? document.body);
  }, []);

  useEffect(() => {
    if (isOpen && triggerRef.current && portalTarget) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const target = portalTarget;
      // When portaled into a transformed ancestor (e.g. Radix Dialog),
      // fixed positioning is relative to that ancestor, not the viewport.
      const offsetX = target === document.body ? 0 : target.getBoundingClientRect().left;
      const offsetY = target === document.body ? 0 : target.getBoundingClientRect().top;
      const menuWidth = Math.max(triggerRect.width, 240);
      const containerRight =
        (target === document.body ? window.innerWidth : target.getBoundingClientRect().right) -
        offsetX;
      let left = triggerRect.left - offsetX;
      if (left + menuWidth > containerRight - 8) {
        left = Math.max(8, triggerRect.right - offsetX - menuWidth);
      }
      setDropdownPosition({
        top: triggerRect.bottom + 4 - offsetY,
        left,
        width: menuWidth,
      });
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [isOpen, portalTarget]);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!dropdownRef.current || !dropdownRef.current.contains(target))
      ) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < filteredLanguages.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredLanguages.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (filteredLanguages[highlightedIndex]) {
          handleSelect(filteredLanguages[highlightedIndex].value);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        handleSearchQueryChange("");
        break;
    }
  };

  const handleSelect = (languageValue: string) => {
    onChange(languageValue);
    setIsOpen(false);
    handleSearchQueryChange("");
  };

  const clearSearch = () => {
    handleSearchQueryChange("");
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  const selected = items.find((l) => l.value === value);

  return (
    <div className={`relative ${className}`} ref={setContainerNode}>
      {/* Trigger — the same recessed well as `select.tsx`. It used to be a
          bespoke glass control with a blur, a spring-scale press and its own
          ring; none of that existed anywhere else in the app. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className={`
          group relative flex w-full items-center justify-between gap-2
          h-7 px-2.5 text-left text-xs font-medium
          rounded-control border bg-input text-foreground shadow-(--shadow-well)
          transition-[background-color,border-color] duration-100 ease-snap
          focus-ring
          ${
            isOpen
              ? "border-border-active"
              : "border-border-control hover:border-border-hover hover:bg-surface-1"
          }
        `}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={`truncate ${selected ? "text-foreground" : "text-muted-foreground"}`}>
          <span className="mr-1.5">{selected?.flag ?? "\uD83C\uDF10"}</span>
          {selected?.label ?? (value || placeholder || "")}
        </span>
        <ChevronDown
          strokeWidth={1.75}
          className={`size-3.5 shrink-0 text-muted-foreground transition-[color,transform] duration-100 ease-snap ${
            isOpen ? "rotate-180 text-primary" : "group-hover:text-foreground"
          }`}
        />
      </button>

      {/* Panel — the same overlay construction as every menu in the app:
          6px corner, structural border, `--shadow-overlay`. No backdrop blur. */}
      {isOpen &&
        portalTarget &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "fixed",
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              width: `${dropdownPosition.width}px`,
            }}
            className="z-9999 overflow-hidden rounded-surface border border-border bg-popover shadow-(--shadow-overlay)"
          >
            {showSearch && (
              <div className="border-b border-border-subtle px-2 pb-1.5 pt-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchQueryChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t("languageSelector.searchPlaceholder")}
                    className="input-inline h-7 w-full border-0 bg-transparent pl-7 pr-6 text-xs text-foreground placeholder:text-muted-foreground/90 focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={clearSearch}
                      className="focus-ring-tight absolute right-1.5 top-1/2 -translate-y-1/2 rounded-control p-0.5 text-muted-foreground transition-colors duration-100 ease-snap hover:bg-surface-3 hover:text-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Language list - tight, premium with smart scrollbar */}
            <div className="max-h-48 overflow-y-auto p-1">
              {filteredLanguages.length === 0 ? (
                <div className="px-2.5 py-2 text-xs text-muted-foreground">
                  {t("languageSelector.noLanguagesFound")}
                </div>
              ) : (
                <div role="listbox" className="space-y-px">
                  {filteredLanguages.map((language, index) => {
                    const isSelected = language.value === value;
                    const isHighlighted = index === highlightedIndex;

                    return (
                      <button
                        key={language.value}
                        type="button"
                        onClick={() => handleSelect(language.value)}
                        className={`
                          group flex h-7 w-full items-center justify-between gap-2
                          rounded-[2px] px-2.5 text-left text-xs font-medium
                          transition-[background-color,box-shadow,color] duration-75 ease-snap
                          ${
                            isSelected
                              ? "bg-surface-3 font-semibold text-primary shadow-[inset_2px_0_0_var(--color-primary)]"
                              : isHighlighted
                                ? "bg-surface-3 text-foreground shadow-[inset_2px_0_0_var(--color-primary)]"
                                : "text-foreground hover:bg-surface-3"
                          }
                        `}
                        role="option"
                        aria-selected={isSelected}
                      >
                        <span className="truncate">
                          <span className="mr-1.5">{language.flag}</span>
                          {language.label}
                        </span>
                        {isSelected && <Check className="size-3 shrink-0" strokeWidth={2} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>,
          portalTarget
        )}
    </div>
  );
}
