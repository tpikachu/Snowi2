import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

/**
 * Buttons in the "machined instrument" language.
 *
 *   Geometry  3px corner (`rounded-control`), heights on a 4px ladder
 *             28 / 32 / 38, horizontal padding ~= height / 2.6.
 *   Elevation raised variants carry `--shadow-control`: a 1px top highlight
 *             plus a hard, un-blurred contact line. Pressing swaps it for
 *             `--shadow-control-pressed` — the control goes into its well
 *             instead of jumping toward the cursor.
 *   Edge      bordered variants use `--color-border-control` (>= 3:1), so the
 *             boundary is genuinely perceivable rather than decorative.
 *   Focus     one `.focus-ring` (a real outline at a transparent offset).
 *   Disabled  desaturate + flatten. A disabled primary is a grey button, not
 *             a translucent teal one, so "off" never reads as "brand colour".
 *   Icons     14px at 1.75 stroke — a hairline weight that matches the
 *             hairline seams, one notch lighter than Lucide's default 2.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0",
    "rounded-control font-medium cursor-pointer select-none",
    "transition-[background-color,border-color,color,box-shadow] duration-100 ease-snap",
    "focus-ring",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55 disabled:grayscale disabled:shadow-none",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:[stroke-width:1.75]",
  ].join(" "),
  {
    variants: {
      variant: {
        // Primary CTA — solid brand teal, raised, 9.06:1 dark / 5.76:1 light.
        default: [
          "text-primary-foreground font-semibold",
          "bg-primary border border-primary",
          "shadow-(--shadow-control)",
          "hover:bg-primary-hover hover:border-primary-hover",
          "active:bg-primary-active active:border-primary-active active:shadow-(--shadow-control-pressed)",
        ].join(" "),

        success: [
          "text-success-foreground font-semibold",
          "bg-success border border-success",
          "shadow-(--shadow-control)",
          "hover:bg-success/90 hover:border-success/90",
          "active:bg-success/80 active:shadow-(--shadow-control-pressed)",
        ].join(" "),

        // Solid destructive uses the deeper red so the label clears 4.5:1.
        destructive: [
          "text-destructive-foreground font-semibold",
          "bg-destructive-solid border border-destructive-solid",
          "shadow-(--shadow-control)",
          "hover:bg-destructive-solid/90 hover:border-destructive-solid/90",
          "active:bg-destructive-solid/80 active:shadow-(--shadow-control-pressed)",
        ].join(" "),

        // Outline — a raised neutral plate with the functional edge.
        outline: [
          "font-medium text-foreground",
          "bg-surface-2 border border-border-control",
          "shadow-(--shadow-control)",
          "hover:bg-surface-3 hover:border-border-hover",
          "active:bg-surface-3 active:shadow-(--shadow-control-pressed)",
        ].join(" "),

        // Outline flat — the quiet bordered variant: no fill, no elevation,
        // structural hairline. Identified by its label, so it keeps the
        // decorative edge rather than the functional one.
        "outline-flat": [
          "font-medium text-muted-foreground bg-transparent",
          "border border-border",
          "hover:text-foreground hover:border-border-hover hover:bg-surface-2",
          "active:bg-surface-3",
        ].join(" "),

        secondary: [
          "font-medium text-secondary-foreground",
          "bg-surface-1 border border-border-control",
          "shadow-(--shadow-control)",
          "hover:bg-surface-2 hover:border-border-hover",
          "active:bg-surface-3 active:shadow-(--shadow-control-pressed)",
        ].join(" "),

        // Ghost — no plate at all. Hover paints a flat well, never a border.
        ghost: [
          "font-medium text-foreground border border-transparent",
          "hover:bg-surface-3 hover:text-foreground",
          "active:bg-surface-3 active:shadow-(--shadow-control-pressed)",
        ].join(" "),

        link: [
          "font-medium text-primary border border-transparent",
          "hover:text-primary-hover hover:underline",
          "underline-offset-[3px] decoration-1",
        ].join(" "),

        // Social button for auth flows.
        social: [
          "font-medium text-foreground gap-2",
          "bg-surface-2 border border-border-control",
          "shadow-(--shadow-control)",
          "hover:bg-surface-3 hover:border-border-hover",
          "active:bg-surface-3 active:shadow-(--shadow-control-pressed)",
        ].join(" "),
      },
      size: {
        // 32px. Dense but a comfortable target; 13px label, tabular-safe.
        default: "h-8 px-3 text-[13px]",
        // 28px — the floor for a clickable control in this system.
        sm: "h-7 px-2.5 text-xs gap-1",
        lg: "h-9.5 px-4 text-sm [&_svg:not([class*='size-'])]:size-4",
        icon: "size-8 px-0 [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button };
