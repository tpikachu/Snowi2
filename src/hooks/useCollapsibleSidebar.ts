import { useCallback, useEffect, useRef, useState } from "react";

const PEEK_CLOSE_DELAY_MS = 120;

export function useCollapsibleSidebar() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebarCollapsed") === "true"
  );
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const suppressPeek = useRef(false);

  const toggle = useCallback(() => {
    clearTimeout(peekTimer.current);
    setPeek(false);
    const next = !collapsed;
    suppressPeek.current = next;
    localStorage.setItem("sidebarCollapsed", String(next));
    setCollapsed(next);
  }, [collapsed]);

  const showPeek = useCallback(() => {
    if (suppressPeek.current) return;
    clearTimeout(peekTimer.current);
    setPeek(true);
  }, []);

  const hidePeek = useCallback(() => {
    // The pointer has left the panel itself, so a later hover over the trigger
    // should peek again.
    suppressPeek.current = false;
    clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => setPeek(false), PEEK_CLOSE_DELAY_MS);
  }, []);

  // Only clears the post-collapse suppression. It must NOT schedule a close:
  // the peeked panel is painted over the trigger, so the trigger sees a
  // mouseleave the moment the panel opens. Closing there would uncover the
  // trigger, re-fire mouseenter, and oscillate.
  const leaveToggle = useCallback(() => {
    suppressPeek.current = false;
  }, []);

  useEffect(() => () => clearTimeout(peekTimer.current), []);

  return { collapsed, peek, toggle, showPeek, hidePeek, leaveToggle };
}
