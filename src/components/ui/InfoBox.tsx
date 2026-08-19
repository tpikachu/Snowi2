import React from "react";
import { cn } from "../lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

/**
 * Same construction as `alert.tsx` — a neutral panel with a Rule 3 rail —
 * so an InfoBox and an Alert sitting on the same page read as one family
 * rather than as two different generations of the design.
 */
const infoBoxVariants = cva(
  "relative rounded-surface border border-border-subtle bg-surface-1 p-3 text-[13px] leading-snug",
  {
    variants: {
      variant: {
        default: "shadow-[var(--shadow-panel),inset_2px_0_0_var(--color-primary)]",
        success: "shadow-[var(--shadow-panel),inset_2px_0_0_var(--color-success)]",
        warning: "shadow-[var(--shadow-panel),inset_2px_0_0_var(--color-warning)]",
        info: "shadow-[var(--shadow-panel),inset_2px_0_0_var(--color-info)]",
        muted: "shadow-[var(--shadow-panel),inset_2px_0_0_var(--color-border-hover)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface InfoBoxProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof infoBoxVariants> {}

export function InfoBox({ variant, className, children, ...props }: InfoBoxProps) {
  return (
    <div data-slot="info-box" className={cn(infoBoxVariants({ variant }), className)} {...props}>
      {children}
    </div>
  );
}
