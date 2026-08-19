import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

/**
 * Rule 5 + Rule 1 — badges are machined tags, not pills: a 3px corner and
 * micro-caps type. A pill badge is the single most recognisable shadcn tell,
 * and it also wastes horizontal space, which this UI does not have.
 *
 * Every tint is a flat 10% wash of its own hue with a matching 25% edge, so
 * the hue text clears 4.5:1 in both themes:
 *   dark   primary 7.02  success 7.21  warning 8.14  destructive 4.62
 *   light  primary 4.99  success 4.90  warning 4.74  destructive 4.97
 */
const badgeVariants = cva(
  [
    "inline-flex items-center gap-1 rounded-control border px-1.5 py-0.5",
    "micro-caps whitespace-nowrap",
    "transition-colors duration-100 ease-snap",
    "focus-ring-tight",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "border-primary/25 bg-primary/10 text-primary",
        secondary: "border-border-subtle bg-surface-3 text-secondary-foreground",
        destructive: "border-destructive/25 bg-destructive/10 text-destructive",
        outline: "border-border-control bg-transparent text-muted-foreground",
        success: "border-success/25 bg-success/10 text-success",
        warning: "border-warning/25 bg-warning/10 text-warning",
        info: "border-info/25 bg-info/10 text-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge };
