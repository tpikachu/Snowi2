import * as React from "react";

import { cn } from "../lib/utils";

/**
 * Chrome (fill, border, hover and the teal focus ring) is owned by the global
 * `input:not(.input-inline)` rule in index.css so raw `<input>` elements match
 * this component exactly. Only layout, typography and state overrides live here.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-md px-3 py-1.5 text-sm text-foreground",
        "placeholder:text-muted-foreground/60",
        "selection:bg-primary selection:text-primary-foreground",
        "file:text-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted",
        "hover:border-border-hover",
        "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/25",
        className
      )}
      {...props}
    />
  );
}

export { Input };
