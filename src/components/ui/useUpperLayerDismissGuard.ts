import * as React from "react";
import type * as DialogPrimitive from "@radix-ui/react-dialog";

type InteractOutsideEvent = Parameters<
  NonNullable<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>["onInteractOutside"]>
>[0];

/**
 * Keeps a dialog open when the click that dismissed a layer *above* it —
 * a popper (Select / Popover / DropdownMenu) or a stacked dialog — would
 * otherwise be read as a click outside this one.
 *
 * Radix defers outside-click dismissal to a one-time document `click`
 * listener, and the upper layer can unmount before that runs (a Select closes
 * on pointerdown; a stacked dialog's Cancel closes it mid-click). By the time
 * the listener fires there is nothing above us any more, so the dismissal is
 * un-gated and the wrong layer closes. "Was something above us" therefore has
 * to be snapshotted at pointerdown capture time, ahead of every Radix handler.
 *
 * `DialogContent` applies this for you. Anything built on
 * `DialogPrimitive.Content` directly has to opt in — which is what settings
 * did not do, being a full-window surface rather than a centred box, so
 * closing a Select there threw the user back to Home.
 */
export function useUpperLayerDismissGuard<T extends HTMLElement>(
  forwardedRef?: React.ForwardedRef<T>
) {
  const contentRef = React.useRef<T | null>(null);
  const layerWasAboveRef = React.useRef(false);

  React.useEffect(() => {
    const snapshotLayersAbove = () => {
      // Later-mounted portals stack on top, so the last open dialog in DOM
      // order is the topmost one.
      const openDialogs = document.querySelectorAll('[role="dialog"][data-state="open"]');
      layerWasAboveRef.current =
        !!document.querySelector("[data-radix-popper-content-wrapper]") ||
        (openDialogs.length > 0 && openDialogs[openDialogs.length - 1] !== contentRef.current);
    };
    document.addEventListener("pointerdown", snapshotLayersAbove, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", snapshotLayersAbove, { capture: true });
    };
  }, []);

  const guardInteractOutside = React.useCallback((event: InteractOutsideEvent) => {
    if (event.defaultPrevented) return;
    // Focus-outside dismissals would read a snapshot left over from the last
    // pointerdown, however long ago — the guard is pointer-only.
    if (event.detail.originalEvent.type !== "pointerdown") return;
    if (layerWasAboveRef.current) event.preventDefault();
  }, []);

  /**
   * Ref for the Content. Stable across renders, so the node is not detached
   * and reattached on every one, and it keeps any forwarded ref working.
   */
  const setContentRef = React.useCallback(
    (node: T | null) => {
      contentRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef]
  );

  return { contentRef, guardInteractOutside, setContentRef };
}
