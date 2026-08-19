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
