import React from "react";
import { createPortal } from "react-dom";
import { useContextPaneSlot } from "./contextPaneSlot";

interface ContextPaneSectionProps {
  children: React.ReactNode;
  /**
   * Used only when no shell owns the context pane (e.g. the view rendered
   * standalone): the column renders in place instead of being hoisted.
   */
  inlineClassName?: string;
}

/**
 * Hoists a section's list/tree column into the shell's context pane without
 * moving its state: the column keeps rendering inside the section that owns
 * its handlers, and only its DOM position changes. Inside the shell a null
 * node means the pane is collapsed or hidden, so nothing renders.
 */
export default function ContextPaneSection({ children, inlineClassName }: ContextPaneSectionProps) {
  const { node, managed } = useContextPaneSlot();

  if (node) return createPortal(children, node);
  if (managed) return null;
  return <div className={inlineClassName}>{children}</div>;
}
