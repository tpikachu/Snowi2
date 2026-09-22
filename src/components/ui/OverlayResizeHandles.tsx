/* eslint-disable react-refresh/only-export-components -- a grip component and the hook that drives it belong together */
import { useCallback } from "react";

/**
 * Window-edge resize grips for an overlay that resizes ITS OWN window (the
 * cue card in its own window under ASSISTANT_DOT). A transparent frameless
 * window gets no native resize border, so the grips do the work through the
 * own-window bounds bridge, and the hook returns the mousedown handler they
 * need. The same markup the assistant bar keeps for its chat column; kept
 * separate because the bar's copy drives the agent window by name.
 */
export function ResizeHandles({
  onResizeStart,
}: {
  onResizeStart: (e: React.MouseEvent, direction: string) => void;
}) {
  const noDrag = { WebkitAppRegion: "no-drag" } as React.CSSProperties;
  return (
    <>
      <div
        className="absolute top-0 left-2 right-2 h-[5px] cursor-n-resize"
        style={noDrag}
        onMouseDown={(e) => onResizeStart(e, "n")}
      />
      <div
        className="absolute bottom-0 left-2 right-2 h-[5px] cursor-s-resize"
        style={noDrag}
        onMouseDown={(e) => onResizeStart(e, "s")}
      />
      <div
        className="absolute left-0 top-2 bottom-2 w-[5px] cursor-w-resize"
        style={noDrag}
        onMouseDown={(e) => onResizeStart(e, "w")}
      />
      <div
        className="absolute right-0 top-2 bottom-2 w-[5px] cursor-e-resize"
        style={noDrag}
        onMouseDown={(e) => onResizeStart(e, "e")}
      />
      <div
        className="absolute top-0 left-0 w-[10px] h-[10px] cursor-nw-resize"
        style={noDrag}
        onMouseDown={(e) => onResizeStart(e, "nw")}
      />
      <div
        className="absolute top-0 right-0 w-[10px] h-[10px] cursor-ne-resize"
        style={noDrag}
        onMouseDown={(e) => onResizeStart(e, "ne")}
      />
      <div
        className="absolute bottom-0 left-0 w-[10px] h-[10px] cursor-sw-resize"
        style={noDrag}
        onMouseDown={(e) => onResizeStart(e, "sw")}
      />
      <div
        className="absolute bottom-0 right-0 w-[10px] h-[10px] cursor-se-resize"
        style={noDrag}
        onMouseDown={(e) => onResizeStart(e, "se")}
      />
    </>
  );
}

export interface OwnWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Resizes this renderer's own window from a grip drag. Screen coordinates
 * throughout, so the drag keeps tracking past the window's edge. Main floors
 * the size at the window's minimum and keeps it on the work area.
 */
export function useOwnWindowResize({
  minWidth,
  minHeight,
  onResized,
}: {
  minWidth: number;
  minHeight: number;
  onResized?: (bounds: OwnWindowBounds) => void;
}) {
  return useCallback(
    (e: React.MouseEvent, direction: string) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.screenX;
      const startY = e.screenY;

      void window.electronAPI?.getOwnWindowBounds?.().then((bounds) => {
        if (!bounds) return;
        const startBounds = { ...bounds };
        let last: OwnWindowBounds = { ...bounds };

        const handleMouseMove = (ev: MouseEvent) => {
          const dx = ev.screenX - startX;
          const dy = ev.screenY - startY;
          let { x, y, width, height } = startBounds;
          if (direction.includes("e")) width += dx;
          if (direction.includes("w")) {
            x += dx;
            width -= dx;
          }
          if (direction.includes("s")) height += dy;
          if (direction.includes("n")) {
            y += dy;
            height -= dy;
          }
          width = Math.max(minWidth, width);
          height = Math.max(minHeight, height);
          last = { x, y, width, height };
          void window.electronAPI?.setOwnWindowBounds?.(x, y, width, height);
        };
        const handleMouseUp = () => {
          window.removeEventListener("mousemove", handleMouseMove);
          window.removeEventListener("mouseup", handleMouseUp);
          onResized?.(last);
        };
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
      });
    },
    [minWidth, minHeight, onResized]
  );
}
