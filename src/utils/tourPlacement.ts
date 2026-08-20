/**
 * Where a tour popover goes relative to the element it is describing.
 *
 * Pure, and separate from the overlay, because this is the part that breaks:
 * an anchor near the window edge, a popover taller than the viewport, a rail
 * button at the very bottom of a short window. Getting it wrong puts the
 * explanation off-screen, which is worse than not having a tour.
 */

export type Placement = "top" | "bottom" | "left" | "right";

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface PlacementResult {
  top: number;
  left: number;
  /** What was actually used, which may not be what was asked for. */
  placement: Placement;
}

/** Breathing room between the popover and its anchor. */
const GAP = 12;
/** Never let the popover touch the window edge. */
const MARGIN = 12;

const OPPOSITE: Record<Placement, Placement> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

function fits(placement: Placement, anchor: Rect, popover: Rect, viewport: Viewport): boolean {
  switch (placement) {
    case "top":
      return anchor.top - GAP - popover.height >= MARGIN;
    case "bottom":
      return anchor.top + anchor.height + GAP + popover.height <= viewport.height - MARGIN;
    case "left":
      return anchor.left - GAP - popover.width >= MARGIN;
    case "right":
      return anchor.left + anchor.width + GAP + popover.width <= viewport.width - MARGIN;
  }
}

function clamp(value: number, min: number, max: number): number {
  // max < min happens when the popover is larger than the axis it sits on.
  // Pinning to `min` keeps its top-left visible, which is where the text starts.
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function position(placement: Placement, anchor: Rect, popover: Rect, viewport: Viewport) {
  switch (placement) {
    case "top":
      return {
        top: anchor.top - GAP - popover.height,
        left: anchor.left + anchor.width / 2 - popover.width / 2,
      };
    case "bottom":
      return {
        top: anchor.top + anchor.height + GAP,
        left: anchor.left + anchor.width / 2 - popover.width / 2,
      };
    case "left":
      return {
        top: anchor.top + anchor.height / 2 - popover.height / 2,
        left: anchor.left - GAP - popover.width,
      };
    case "right":
      return {
        top: anchor.top + anchor.height / 2 - popover.height / 2,
        left: anchor.left + anchor.width + GAP,
      };
  }
}

/**
 * Resolves a placement, falling back through the opposite side and then the
 * remaining two before giving up and using the preferred one clamped. The
 * result is always inside the viewport on both axes.
 */
export function placePopover(
  preferred: Placement,
  anchor: Rect,
  popover: Rect,
  viewport: Viewport
): PlacementResult {
  const candidates: Placement[] = [
    preferred,
    OPPOSITE[preferred],
    ...(["right", "left", "bottom", "top"] as Placement[]).filter(
      (p) => p !== preferred && p !== OPPOSITE[preferred]
    ),
  ];

  const chosen = candidates.find((p) => fits(p, anchor, popover, viewport)) ?? preferred;
  const { top, left } = position(chosen, anchor, popover, viewport);

  return {
    top: clamp(top, MARGIN, viewport.height - popover.height - MARGIN),
    left: clamp(left, MARGIN, viewport.width - popover.width - MARGIN),
    placement: chosen,
  };
}

/**
 * The highlight ring around the anchor, padded outwards and clipped to the
 * viewport so an element scrolled half off-screen does not draw a ring into
 * nowhere.
 */
export function highlightRect(anchor: Rect, viewport: Viewport, padding = 6): Rect {
  const top = Math.max(0, anchor.top - padding);
  const left = Math.max(0, anchor.left - padding);
  return {
    top,
    left,
    width: Math.max(0, Math.min(anchor.width + padding * 2, viewport.width - left)),
    height: Math.max(0, Math.min(anchor.height + padding * 2, viewport.height - top)),
  };
}

/** True when the anchor is at least partly on screen and worth pointing at. */
export function isAnchorVisible(anchor: Rect, viewport: Viewport): boolean {
  if (anchor.width <= 0 || anchor.height <= 0) return false;
  return (
    anchor.top < viewport.height &&
    anchor.top + anchor.height > 0 &&
    anchor.left < viewport.width &&
    anchor.left + anchor.width > 0
  );
}
