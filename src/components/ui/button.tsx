import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-md text-sm font-medium cursor-pointer select-none",
    "transition-[background-color,border-color,color,box-shadow] duration-150 ease-snap",
    // Teal focus ring with a visible offset so it reads on any surface.
    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-45 disabled:cursor-not-allowed",
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        // Primary CTA — solid brand teal, crisp 1px edge.
        default: [
          "text-primary-foreground font-semibold",
          "bg-primary border border-primary",
          "shadow-(--shadow-card)",
          "hover:bg-primary-hover hover:border-primary-hover",
          "active:bg-primary-active active:border-primary-active",
        ].join(" "),

        success: [
          "text-success-foreground font-semibold",
          "bg-success border border-success",
          "shadow-(--shadow-card)",
          "hover:bg-success/90 hover:border-success/90",
          "active:bg-success/80",
        ].join(" "),

        // Solid destructive uses the deeper red so the label clears 4.5:1.
        destructive: [
          "text-destructive-foreground font-semibold",
          "bg-destructive-solid border border-destructive-solid",
          "shadow-(--shadow-card)",
          "hover:bg-destructive-solid/90 hover:border-destructive-solid/90",
          "active:bg-destructive-solid/80",
        ].join(" "),

        // Outline — filled neutral surface with a real border.
        outline: [
          "font-medium text-foreground",
          "bg-surface-1 border border-border",
          "shadow-(--shadow-card)",
          "hover:bg-surface-raised hover:border-border-hover",
          "active:bg-surface-3",
        ].join(" "),

        // Outline flat — transparent, hairline border, no fill or shadow.
        "outline-flat": [
          "font-medium text-muted-foreground bg-transparent",
          "border border-border",
          "hover:text-foreground hover:border-border-hover hover:bg-muted",
          "active:bg-surface-3",
        ].join(" "),

        secondary: [
          "font-medium text-secondary-foreground",
          "bg-secondary border border-border-subtle",
          "hover:bg-surface-raised hover:border-border",
          "active:bg-surface-3",
        ].join(" "),

        ghost: [
          "font-medium text-foreground border border-transparent",
          "hover:bg-muted hover:border-border-subtle",
          "active:bg-surface-3",
        ].join(" "),

        link: [
          "font-medium text-primary border border-transparent",
          "hover:text-primary-hover hover:underline",
          "underline-offset-4",
        ].join(" "),

        // Social button for auth flows.
        social: [
          "font-medium text-foreground gap-2",
          "bg-surface-1 border border-border",
          "shadow-(--shadow-card)",
          "hover:bg-surface-raised hover:border-border-hover",
          "active:bg-surface-3",
        ].join(" "),
      },
      size: {
        default: "h-9 px-3.5 py-1.5",
        sm: "h-8 px-3 text-xs gap-1.5",
        lg: "h-11 px-5 text-sm",
        icon: "size-9",
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
