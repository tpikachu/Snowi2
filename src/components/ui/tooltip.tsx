import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  children: React.ReactNode;
  content: string;
  /** Which edge of the trigger the bubble hangs off. Defaults to "top". */
  side?: "top" | "right";
  /**
   * Also reveal on keyboard focus. Opt-in, so mouse-driven surfaces don't grow
   * a tooltip that lingers after a click leaves the button focused.
   */
  showOnFocus?: boolean;
}

export const Tooltip = ({ children, content, side = "top", showOnFocus }: TooltipProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition(
      side === "right"
        ? { top: rect.top + rect.height / 2, left: rect.right }
        : { top: rect.top, left: rect.left + rect.width / 2 }
    );
  }, [side]);

  useEffect(() => {
    if (!isVisible) return;
    updatePosition();
  }, [isVisible, updatePosition]);

  // Adjust if tooltip overflows viewport edges
  useEffect(() => {
    if (side !== "top" || !isVisible || !position || !tooltipRef.current) return;
    const tooltip = tooltipRef.current;
    const tooltipRect = tooltip.getBoundingClientRect();

    let adjustedLeft = position.left;
    if (tooltipRect.left < 4) {
      adjustedLeft = tooltipRect.width / 2 + 4;
    } else if (tooltipRect.right > window.innerWidth - 4) {
      adjustedLeft = window.innerWidth - tooltipRect.width / 2 - 4;
    }

    if (adjustedLeft !== position.left) {
      setPosition((prev) => (prev ? { ...prev, left: adjustedLeft } : prev));
    }
  }, [isVisible, position, side]);

  const focusProps = showOnFocus
    ? { onFocus: () => setIsVisible(true), onBlur: () => setIsVisible(false) }
    : undefined;

  return (
    <>
      <div
        ref={triggerRef}
        className="relative inline-flex"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        {...focusProps}
      >
        {children}
      </div>
      {isVisible &&
        position &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            className="fixed px-2 py-1 text-xs font-medium text-foreground bg-surface-raised border border-border rounded-md whitespace-nowrap z-[9999] shadow-(--shadow-elevated) animate-in fade-in-0 zoom-in-95 duration-100 pointer-events-none"
            style={{
              top: position.top,
              left: position.left,
              transform:
                side === "right" ? "translate(8px, -50%)" : "translate(-50%, calc(-100% - 8px))",
            }}
          >
            {content}
            {side === "right" ? (
              <div className="absolute right-full top-1/2 -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-r-4 border-transparent border-r-surface-raised" />
            ) : (
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-surface-raised" />
            )}
          </div>,
          document.body
        )}
    </>
  );
};
