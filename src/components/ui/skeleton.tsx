import { cn } from "../lib/utils";

/**
 * A pending region is a blank plate with a single pass of light across it,
 * not a pulsing blob. `animate-pulse` reads as "this thing is alive"; a sweep
 * reads as "this is being filled in", which is what is actually happening.
 *
 * `.skeleton-sheen` disables itself under `prefers-reduced-motion`, leaving
 * the flat plate to carry the state.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "skeleton-sheen relative overflow-hidden rounded-control bg-surface-3",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
