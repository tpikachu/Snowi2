import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

/**
 * Rule 3 — an alert is a flat panel with a 2px accent rail on its leading
 * edge, not a coloured box. The tinted-fill alert is the other unmistakable
 * shadcn shape, and at this app's density a full wash of colour behind a
 * paragraph is exactly what you do not want repeated down a settings page.
 *
 * So: severity is carried by the rail and the icon, legibility by a neutral
 * surface. Body copy runs on `--color-foreground` over `surface-1` —
 * 16.27:1 dark, 17.13:1 light — instead of hue-on-hue.
 *
 * Rail vs its surface (>= 3:1 required for a non-text indicator):
 *   dark   primary 8.69  success 9.03  warning 10.35  destructive 5.37
 *   light  primary 5.52  success 5.41  warning  5.20  destructive 5.61
 */
const alertVariants = cva(
  [
    "relative w-full overflow-hidden rounded-surface border border-border-subtle",
    "bg-surface-1 text-[13px] text-foreground shadow-(--shadow-panel)",
    // Icon sits in the gutter the rail opens up; content clears it.
    "px-3 py-2.5 pl-9 [&:not(:has(>svg))]:pl-3",
    "[&>svg]:absolute [&>svg]:left-3.5 [&>svg]:top-3 [&>svg]:size-3.5 [&>svg]:[stroke-width:1.75]",
    // The rail itself.
    "before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:content-['']",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "before:bg-border-hover [&>svg]:text-muted-foreground",
        destructive: "before:bg-destructive [&>svg]:text-destructive",
        success: "before:bg-success [&>svg]:text-success",
        warning: "before:bg-warning [&>svg]:text-warning",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    data-slot="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      data-slot="alert-title"
      className={cn(
        "mb-0.5 text-[13px] font-semibold leading-tight tracking-[-0.006em] text-inherit",
        className
      )}
      {...props}
    />
  )
);
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="alert-description"
    className={cn("text-[13px] leading-snug text-muted-foreground [&_p]:leading-snug", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
