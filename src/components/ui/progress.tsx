import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "../lib/utils";

/**
 * Progress reads as a gauge, not a candy bar.
 *
 * Rule 1 — the track and the fill are square-cornered (3px), so the fill's
 * leading edge is a straight rule you can actually align against. A rounded
 * cap makes the last few percent ambiguous.
 * Rule 2 — the track is recessed (`--shadow-well`); the fill sits in it.
 *
 * `.gauge-track` draws 1px graticule marks every 12.5%, so a glance gives a
 * value and not just a mood. Fill vs track: 7.60:1 dark, 5.21:1 light.
 */
const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    data-slot="progress"
    className={cn(
      "gauge-track relative h-1.5 w-full overflow-hidden rounded-control",
      "bg-surface-raised dark:bg-surface-3 shadow-(--shadow-well)",
      className
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      className="h-full w-full flex-1 bg-primary transition-transform duration-300 ease-snap"
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
