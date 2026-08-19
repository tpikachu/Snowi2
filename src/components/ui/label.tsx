import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

/**
 * Rule 5 — a field label is metadata, not content. Micro-caps at 11px /
 * 0.07em pulls it a clear step below the value it names, which lets the
 * label/field pair compress vertically without the two competing.
 *
 * muted-foreground on the surfaces labels sit on: 7.07:1 dark, 6.51:1 light.
 */
const labelVariants = cva(
  "micro-caps text-muted-foreground select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-55"
);

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    data-slot="label"
    className={cn(labelVariants(), className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
