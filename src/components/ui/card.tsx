import * as React from "react";

import { cn } from "../lib/utils";

/**
 * Cards are panels, not paper.
 *
 * Rule 2 — the card carries `--shadow-panel` (a 1px top highlight plus a hard
 * contact line) and never changes elevation. Hover moves the EDGE, so a grid
 * of cards stays visually flat while still answering the cursor.
 *
 * Rule 4 — regions inside a card are divided by hairline seams that run the
 * full width of the panel, not by extra padding. Header and footer grow their
 * seam only when there is something on the other side of it, so a header-only
 * card never sprouts a stray rule.
 */
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card"
      className={cn(
        "rounded-surface border border-border-subtle bg-card text-card-foreground",
        "shadow-(--shadow-panel) transition-[border-color] duration-100 ease-snap",
        "hover:border-border",
        className
      )}
      {...props}
    />
  )
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card-header"
      className={cn(
        "flex flex-col gap-1 px-3.5 py-3",
        "[&:not(:last-child)]:border-b [&:not(:last-child)]:border-border-subtle",
        className
      )}
      {...props}
    />
  )
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      data-slot="card-title"
      className={cn(
        "text-base font-semibold leading-tight tracking-[-0.016em] text-foreground",
        className
      )}
      {...props}
    />
  )
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    data-slot="card-description"
    className={cn("text-[13px] leading-snug text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="card-content" className={cn("px-3.5 py-3", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card-footer"
      className={cn(
        "flex items-center gap-2 px-3.5 py-3",
        "[&:not(:first-child)]:border-t [&:not(:first-child)]:border-border-subtle",
        className
      )}
      {...props}
    />
  )
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
