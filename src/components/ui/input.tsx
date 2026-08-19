import * as React from "react";

import { cn } from "../lib/utils";

/**
 * Chrome (recessed well, functional `--color-border-control` edge, and the
 * Rule 6 focus outline) is owned by the global `input:not(.input-inline)`
 * rules in index.css, so a raw `<input>` anywhere in the app matches this
 * component exactly. Only geometry, typography and state overrides live here.
 *
 * 32px tall, 13px type: a field is the same height as a button so a field and
 * its adjacent action sit on one baseline without either being nudged.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-8 w-full min-w-0 rounded-control px-2.5 py-1 text-[13px] text-foreground",
        "placeholder:text-muted-foreground/90",
        "selection:bg-primary selection:text-primary-foreground",
        "file:text-foreground file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-[13px] file:font-medium",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55 disabled:grayscale disabled:bg-muted",
        className
      )}
      {...props}
    />
  );
}

export { Input };
