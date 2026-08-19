import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";

/** Width of the section-scoped context pane (list / filters column). */
export const CONTEXT_PANE_WIDTH_PX = 280;

/**
 * Below this the window can no longer carry rail + context pane + a usable
 * content column, so the pane folds itself away. The user can still reopen it
 * from the content header — the fold only happens on the way in.
 */
export const CONTEXT_PANE_AUTO_COLLAPSE_PX = 900;

const STORAGE_KEY = "contextPaneCollapsed";

/**
 * The DOM node the shell reserves for section-owned context-pane content.
 * `managed` is true only inside the control panel shell: it tells a section
 * that the shell owns this column, so a null node means "hidden", not
 * "unavailable" — and the section must not fall back to rendering its own.
 */
export interface ContextPaneSlot {
  node: HTMLElement | null;
  managed: boolean;
}

export const ContextPaneSlotContext = createContext<ContextPaneSlot>({
  node: null,
  managed: false,
});

export function useContextPaneSlot(): ContextPaneSlot {
  return useContext(ContextPaneSlotContext);
}

/**
 * The portal host for the context pane — a node React never owns.
 *
 * The obvious implementation (`<div ref={setNode}/>` rendered by the pane) has
 * a defect that only shows up as a crash: the pane's mount point unmounts
 * whenever the pane collapses, the window narrows into the side-panel layout,
 * or the section changes — while the children portalled into it live in a
 * completely different subtree (the section that owns their state). React does
 * not support a portal container it also unmounts; the two deletions are
 * unordered, and whichever loses calls `removeChild` on a node that no longer
 * holds the child. That surfaces as "Failed to execute 'removeChild' on
 * 'Node'" and takes the whole window down through the error boundary.
 *
 * So the container is a plain detached div, created once and never rendered by
 * React. The pane only *adopts* it: React mounts and unmounts the mount point,
 * and `mountRef` moves this host in and out of it. The portal's container
 * therefore always exists and always still owns its children, whatever order
 * the two subtrees unmount in.
 *
 * It also removes a frame of latency — the old ref-callback-into-state version
 * could not portal anything until the render *after* the pane appeared.
 */
export function useContextPaneHost(): {
  host: HTMLElement | null;
  mountRef: (element: HTMLElement | null) => void;
} {
  const [host] = useState<HTMLElement | null>(() => {
    if (typeof document === "undefined") return null;
    const element = document.createElement("div");
    element.className = "flex min-h-0 flex-1 flex-col";
    return element;
  });

  // The host outlives every mount point, so the only thing left to clean up is
  // the host itself when the whole shell goes away.
  useEffect(() => () => host?.remove(), [host]);

  const mountRef = useCallback(
    (element: HTMLElement | null) => {
      if (!host) return;
      if (element) element.appendChild(host);
      else host.remove();
    },
    [host]
  );

  return { host, mountRef };
}

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function isNarrowNow(): boolean {
  return typeof window !== "undefined" && window.innerWidth < CONTEXT_PANE_AUTO_COLLAPSE_PX;
}

/**
 * Collapsed state for the context pane. Explicit toggles persist; the
 * width-driven collapse does not, so a spell in a narrow window never becomes
 * the default the next time the app opens wide.
 */
export function useContextPaneCollapse(): { collapsed: boolean; toggle: () => void } {
  const windowWidth = useMeetingRecordingStore((s) => s.windowWidth);
  const isNarrow = windowWidth < CONTEXT_PANE_AUTO_COLLAPSE_PX;
  const [collapsed, setCollapsed] = useState(() => isNarrowNow() || readStoredCollapsed());
  const wasNarrow = useRef(isNarrow);

  useEffect(() => {
    if (isNarrow && !wasNarrow.current) setCollapsed(true);
    wasNarrow.current = isNarrow;
  }, [isNarrow]);

  const toggle = useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // localStorage unavailable — the choice just won't persist
      }
      return next;
    });
  }, []);

  return { collapsed, toggle };
}
