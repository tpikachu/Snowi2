import * as React from "react";

import { cn } from "../lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

/**
 * Chrome (recessed well, functional edge, invalid state and the Rule 6 focus
 * outline) is owned by the global `textarea:not(.input-inline)` rules in
 * index.css. Only geometry, typography and state overrides live here.
 *
 * The minimum height is four 13px lines rather than a round 80px, so an empty
 * textarea already looks like the field it is.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        data-slot="textarea"
        className={cn(
          "flex min-h-18 w-full rounded-control px-2.5 py-1.5 text-[13px] leading-relaxed text-foreground",
          "resize-y cursor-text",
          "placeholder:text-muted-foreground/90",
          "selection:bg-primary selection:text-primary-foreground",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55 disabled:grayscale",
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
