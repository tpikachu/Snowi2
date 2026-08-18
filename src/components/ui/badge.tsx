import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

const badgeVariants = cva(
  [
    "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
    "transition-colors duration-150 ease-snap",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  ].join(" "),
  {
    variants: {
      variant: {
        // Tint levels are picked so the hue text clears 4.5:1 on the tinted
        // fill in both themes (light 10%, dark 12%).
        default: "border-primary/20 bg-primary/10 dark:bg-primary/12 text-primary",
        secondary: "border-border-subtle bg-secondary text-secondary-foreground",
        destructive: "border-destructive/20 bg-destructive/10 dark:bg-destructive/12 text-destructive",
        outline: "border-border text-muted-foreground",
        success: "border-success/20 bg-success/10 dark:bg-success/12 text-success",
        warning: "border-warning/20 bg-warning/10 dark:bg-warning/12 text-warning",
        info: "border-info/20 bg-info/10 dark:bg-info/12 text-info",
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
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge };
