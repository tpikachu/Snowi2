import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

/**
 * A label plate, not a speech bubble.
 *
 * The arrow is gone on purpose: a tail is the cartoon convention, and at
 * 11px it costs more pixels of chrome than the label it points at. What
 * identifies the tooltip instead is Rule 1 + Rule 2 geometry — a 3px corner,
 * the functional edge, and `--shadow-overlay` (a top highlight over real
 * depth), which is the same construction every floating layer in the system
 * uses. Text: 14.82:1 dark, 17.88:1 light.
 */
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
            className="fixed z-[9999] whitespace-nowrap rounded-control border border-border-control bg-popover px-2 py-1 text-[11px] font-medium leading-tight tracking-[0.004em] text-foreground shadow-(--shadow-overlay) pointer-events-none animate-in fade-in-0 duration-100"
            style={{
              top: position.top,
              left: position.left,
              transform:
                side === "right" ? "translate(8px, -50%)" : "translate(-50%, calc(-100% - 8px))",
            }}
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
};
