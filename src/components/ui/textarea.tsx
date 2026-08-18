import * as React from "react";

import { cn } from "../lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

/**
 * Chrome (fill, border, hover and the teal focus ring) is owned by the global
 * `textarea:not(.input-inline)` rule in index.css. Only layout, typography and
 * state overrides live here.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md px-3 py-2 text-sm text-foreground resize-y cursor-text",
          "placeholder:text-muted-foreground/60",
          "selection:bg-primary selection:text-primary-foreground",
          "hover:border-border-hover",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted",
          "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/25",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
