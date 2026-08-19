import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "../lib/utils";

/**
 * A segmented gate, read as one machined part.
 *
 * Rule 2 does the work: the LIST is a recessed well (`--shadow-well`) and the
 * ACTIVE tab is the one segment raised out of it (`--shadow-control`). The
 * stock treatment is the reverse — a flat container with a floating white
 * pill — which is why every shadcn tab strip looks the same.
 *
 * Rule 3 then adds a 2px accent rail along the bottom of the active segment,
 * so activation survives greyscale and doesn't depend on the raise alone.
 *
 * 32px strip, 13px labels. Active text on the raised plate: 12.54:1 dark,
 * 15.24:1 light.
 */
const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    data-slot="tabs-list"
    className={cn(
      "inline-flex h-8 items-stretch gap-0.5 rounded-control border border-border-subtle",
      "bg-surface-1 p-0.5 text-muted-foreground shadow-(--shadow-well)",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    data-slot="tabs-trigger"
    className={cn(
      "relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[2px] px-2.5",
      "text-[13px] font-medium cursor-pointer",
      "transition-[background-color,color,box-shadow] duration-100 ease-snap",
      "hover:text-foreground",
      "focus-ring-tight",
      "disabled:pointer-events-none disabled:opacity-55 disabled:grayscale",
      "data-[state=active]:bg-surface-2 data-[state=active]:text-foreground data-[state=active]:shadow-(--shadow-control)",
      // Rule 3: the activation rail.
      "after:pointer-events-none after:absolute after:inset-x-1.5 after:bottom-0 after:h-0.5 after:content-['']",
      "data-[state=active]:after:bg-primary",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    data-slot="tabs-content"
    className={cn("focus-ring-tight mt-3", className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
