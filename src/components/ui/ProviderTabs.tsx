import { ReactNode, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ProviderIcon } from "./ProviderIcon";
import type { ColorScheme as BaseColorScheme } from "../../utils/modelPickerStyles";
import { cn } from "../lib/utils";

export interface ProviderTabItem {
  id: string;
  name: string;
  recommended?: boolean;
  disabled?: boolean;
  disabledLabel?: string;
}

type ColorScheme = Exclude<BaseColorScheme, "blue"> | "dynamic";

interface ProviderTabsProps {
  providers: ProviderTabItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  renderIcon?: (providerId: string) => ReactNode;
  colorScheme?: ColorScheme;
  /** Wrap segments onto multiple lines when there are many providers */
  wrap?: boolean;
}

export function ProviderTabs({
  providers,
  selectedId,
  onSelect,
  renderIcon,
  colorScheme = "purple",
  wrap = false,
}: ProviderTabsProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);

  const updateIndicator = useCallback(() => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    if (!container || !indicator) return;

    const selectedIndex = providers.findIndex((p) => p.id === selectedId);
    if (selectedIndex === -1) {
      indicator.style.opacity = "0";
      return;
    }

    const buttons = container.querySelectorAll<HTMLButtonElement>("[data-tab-button]");
    const selectedButton = buttons[selectedIndex];
    if (!selectedButton) return;

    const buttonRect = selectedButton.getBoundingClientRect();

    indicator.style.width = `${buttonRect.width}px`;
    indicator.style.height = `${buttonRect.height}px`;
    indicator.style.transform = `translate(${selectedButton.offsetLeft}px, ${selectedButton.offsetTop}px)`;
    indicator.style.opacity = "1";
  }, [providers, selectedId]);

  useLayoutEffect(() => {
    updateIndicator();
  }, [updateIndicator]);

  useEffect(() => {
    const observer = new ResizeObserver(() => updateIndicator());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updateIndicator]);

  return (
    <div
      ref={containerRef}
      className={cn("relative items-center gap-1 p-0.5", wrap ? "flex flex-wrap" : "inline-flex")}
    >
      {/* The travelling plate. Rule 2 raises the live provider out of the
          strip instead of washing it in accent, and Rule 3 puts the rail under
          it so the selection also survives greyscale. */}
      <div
        ref={indicatorRef}
        className="pointer-events-none absolute left-0 top-0 rounded-control border border-border-subtle bg-surface-2 shadow-(--shadow-control) transition-[width,height,transform,opacity] duration-150 ease-snap after:absolute after:inset-x-1.5 after:bottom-0 after:h-0.5 after:bg-primary after:content-['']"
        style={{ opacity: 0 }}
      />

      {providers.map((provider) => {
        const isSelected = selectedId === provider.id;
        const isDisabled = !!provider.disabled;

        return (
          <button
            key={provider.id}
            data-tab-button
            type="button"
            disabled={isDisabled}
            aria-disabled={isDisabled}
            title={isDisabled ? provider.disabledLabel : undefined}
            onClick={() => {
              if (isDisabled) return;
              onSelect(provider.id);
            }}
            className={cn(
              // 28px tall: the target floor, and the same height as a small
              // button, so a provider strip lines up with the controls beside it.
              "focus-ring-tight relative z-10 flex h-7 items-center gap-1.5 whitespace-nowrap rounded-control px-2.5",
              "text-xs font-medium transition-colors duration-100 ease-snap",
              "[&_img]:size-3.5 [&_svg]:size-3.5",
              isDisabled
                ? "cursor-not-allowed border border-border-subtle text-muted-foreground opacity-55 grayscale"
                : isSelected
                  ? "text-foreground [&_svg]:text-primary"
                  : "cursor-pointer border border-border-subtle text-muted-foreground hover:border-border-hover hover:bg-surface-2 hover:text-foreground"
            )}
          >
            {renderIcon ? renderIcon(provider.id) : <ProviderIcon provider={provider.id} />}
            <span>{provider.name}</span>
            {provider.recommended && (
              <span className="micro-caps text-primary">{t("common.recommended")}</span>
            )}
            {isDisabled && provider.disabledLabel && (
              <span className="micro-caps text-muted-foreground">{provider.disabledLabel}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
