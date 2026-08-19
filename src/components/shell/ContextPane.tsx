import React from "react";
import { PanelLeftClose } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CONTEXT_PANE_WIDTH_PX } from "./contextPaneSlot";

interface ContextPaneProps {
  /** Section name — this pane's own title, distinct from the content header. */
  title: string;
  onCollapse: () => void;
  children: React.ReactNode;
}

/**
 * The middle column: whatever list, tree or filter set the active section
 * scopes its content by. Its collapse control lives in its own header, where a
 * collapsed pane can never hide it.
 */
export default function ContextPane({ title, onCollapse, children }: ContextPaneProps) {
  const { t } = useTranslation();

  return (
    <aside
      className="flex h-full shrink-0 flex-col border-r border-border-subtle bg-surface-1"
      style={{ width: CONTEXT_PANE_WIDTH_PX }}
    >
      <div
        className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle pl-3 pr-2"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <h2 className="min-w-0 flex-1 truncate text-[13px] font-medium leading-none tracking-tight text-foreground">
          {title}
        </h2>
        <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <button
            type="button"
            onClick={onCollapse}
            aria-label={t("shell.contextPane.collapse")}
            aria-expanded
            className={[
              "flex size-7 items-center justify-center rounded-md text-muted-foreground",
              "outline-none transition-colors duration-150 ease-snap",
              "hover:bg-surface-3 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            ].join(" ")}
          >
            <PanelLeftClose size={15} />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </aside>
  );
}
