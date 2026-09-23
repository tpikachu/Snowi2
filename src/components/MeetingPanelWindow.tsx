import { useCallback, useEffect, useState } from "react";
import MeetingPanelOverlay from "./MeetingPanelOverlay";
import { ResizeHandles, useOwnWindowResize } from "./ui/OverlayResizeHandles";

/**
 * The cue card in its own window (`?meeting-panel=true`, ASSISTANT_DOT).
 *
 * Main opens this window beside the assistant dot when a meeting starts and
 * hides it when the meeting ends or the card's X is pressed; the dot's menu
 * brings it back. The card itself is `MeetingPanelOverlay`, unchanged: a
 * view over the snapshots the control panel publishes. This wrapper adds
 * what a window of its own needs — the edge grips (a transparent frameless
 * window has no native resize border), Escape as a second way to put the
 * card away, and a hand-set size remembered across meetings under the same
 * localStorage key the bar's in-place morph used, so a size given to one
 * face carries to the other.
 */

const MEETING_CARD_SIZE_KEY = "meetingCardSize";
const MIN_WIDTH = 320;
const MIN_HEIGHT = 56;

function readMeetingCardSize(): { width: number; height: number } | null {
  try {
    const raw = localStorage.getItem(MEETING_CARD_SIZE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { width?: unknown; height?: unknown };
    const width = Number(parsed?.width);
    const height = Number(parsed?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    return { width, height };
  } catch {
    return null;
  }
}

function saveMeetingCardSize(width: number, height: number): void {
  try {
    localStorage.setItem(MEETING_CARD_SIZE_KEY, JSON.stringify({ width, height }));
  } catch {
    /* a size that cannot persist is still applied for this run */
  }
}

export default function MeetingPanelWindow() {
  // The toolbar's natural width is the card's real floor: below it the
  // Transcript button and the X are clipped off the right edge. The overlay
  // reports it; the window grows to it (keeping its right edge, where the
  // dot is) and the grips refuse to go under it.
  const [toolbarWidth, setToolbarWidth] = useState(0);
  const minWidth = Math.max(MIN_WIDTH, toolbarWidth);
  useEffect(() => {
    if (toolbarWidth <= 0) return;
    // On mount and on every resize that lands under the floor — main's first
    // placement at the default width, or anything else that sets the bounds
    // from outside the grips (which clamp themselves).
    const grow = () => {
      if (window.innerWidth >= minWidth) return;
      void window.electronAPI?.getOwnWindowBounds?.().then((bounds) => {
        if (!bounds || bounds.width >= minWidth) return;
        void window.electronAPI?.setOwnWindowBounds?.(
          bounds.x + bounds.width - minWidth,
          bounds.y,
          minWidth,
          bounds.height
        );
      });
    };
    grow();
    window.addEventListener("resize", grow);
    return () => window.removeEventListener("resize", grow);
  }, [toolbarWidth, minWidth]);

  // A remembered size, applied once, keeping the right edge where main put
  // it — the card is placed against the dot by its right edge.
  useEffect(() => {
    const saved = readMeetingCardSize();
    if (!saved) return;
    void window.electronAPI?.getOwnWindowBounds?.().then((bounds) => {
      if (!bounds) return;
      if (bounds.width === saved.width && bounds.height === saved.height) return;
      const width = Math.max(MIN_WIDTH, saved.width);
      const height = Math.max(MIN_HEIGHT, saved.height);
      void window.electronAPI?.setOwnWindowBounds?.(
        bounds.x + bounds.width - width,
        bounds.y,
        width,
        height
      );
    });
  }, []);

  // Escape puts the card away, like the X. The meeting keeps going.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      void window.electronAPI?.meetingPanelCommand?.("hide");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const onResized = useCallback((bounds: { width: number; height: number }) => {
    saveMeetingCardSize(bounds.width, bounds.height);
  }, []);
  const handleResizeStart = useOwnWindowResize({
    minWidth,
    minHeight: MIN_HEIGHT,
    onResized,
  });

  return (
    // `dark` pins every token to the dark palette: the card mixes hud-*
    // tokens with shared app tokens and floats over other apps, never
    // following the app theme.
    <div className="agent-overlay-window dark relative h-screen w-screen bg-transparent">
      <MeetingPanelOverlay onToolbarWidth={setToolbarWidth} />
      <ResizeHandles onResizeStart={handleResizeStart} />
    </div>
  );
}
