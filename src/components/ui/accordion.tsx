import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";

/**
 * A disclosure tree, not a FAQ list.
 *
 * The marker moves to the LEADING edge and rotates 0 -> 90 degrees, which is
 * the file-tree convention an engineer already reads without thinking. The
 * stock arrangement — label left, chevron flipping 180 degrees on the far
 * right — puts the state indicator as far from the label as the row allows.
 *
 * The open row also takes the Rule 3 accent rail, so state survives greyscale,
 * and the body indents to the label's own left edge so the hierarchy is
 * legible with the marker column empty.
 */
const Accordion = AccordionPrimitive.Root;

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    data-slot="accordion-item"
    className={cn("border-b border-border-subtle last:border-b-0", className)}
    {...props}
  />
));
AccordionItem.displayName = "AccordionItem";

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      data-slot="accordion-trigger"
      className={cn(
        "group flex flex-1 items-center gap-1.5 rounded-[2px] py-2.5 pl-1 text-left",
        "text-[13px] font-semibold text-foreground cursor-pointer",
        "transition-[color,box-shadow] duration-100 ease-snap",
        "hover:text-primary focus-ring-tight",
        "data-[state=open]:shadow-[inset_2px_0_0_var(--color-primary)]",
        "[&[data-state=open]>svg]:rotate-90",
        className
      )}
      {...props}
    >
      <ChevronRight
        className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-100 ease-snap"
        strokeWidth={1.75}
      />
      <span className="min-w-0 flex-1">{children}</span>
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName;

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    data-slot="accordion-content"
    className="overflow-hidden text-[13px] text-muted-foreground data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn("pb-3 pl-6 pt-0.5", className)}>{children}</div>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = AccordionPrimitive.Content.displayName;

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
