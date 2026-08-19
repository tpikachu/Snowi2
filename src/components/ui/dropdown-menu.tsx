import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight, Circle } from "lucide-react";

import { cn } from "../lib/utils";

/**
 * Menus in the "machined instrument" language.
 *
 * Rule 3 is the whole story here. A highlighted row is a neutral plate plus a
 * 2px accent rail on its leading edge — NOT a teal wash across the row. The
 * wash is the shadcn/Radix default and it has two problems: it repaints the
 * row's text contrast on every keyboard step, and in a long list it turns the
 * accent into wallpaper. The rail marks position; the plate marks state.
 *
 * Rows are 28px — the target floor — with 3px corners, so a menu of ten items
 * fits where the stock 36px rows fit seven.
 *
 * Highlight plate: foreground on surface-3 = 14.22:1 dark, 16.17:1 light.
 * Rail vs plate: 7.60:1 dark, 5.21:1 light.
 */
const DropdownMenu = DropdownMenuPrimitive.Root;

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

const DropdownMenuGroup = DropdownMenuPrimitive.Group;

const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

const DropdownMenuSub = DropdownMenuPrimitive.Sub;

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

/** Shared row geometry — one definition, so every row species lines up. */
const menuRowClass = [
  "relative flex h-7 select-none items-center gap-2 rounded-[2px] px-2 text-[13px]",
  "outline-none transition-[background-color,box-shadow,color] duration-75 ease-snap",
  "focus:bg-surface-3 focus:text-foreground",
  "focus:shadow-[inset_2px_0_0_var(--color-primary)]",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-55 data-[disabled]:grayscale",
].join(" ");

/** Shared floating-panel geometry for the menu and its submenus. */
const menuPanelClass = [
  "z-50 min-w-[9rem] overflow-hidden rounded-surface border border-border bg-popover p-1",
  "text-popover-foreground shadow-(--shadow-overlay)",
  "data-[state=open]:animate-in data-[state=closed]:animate-out",
  "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
  "data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1",
  "data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
  "duration-100",
].join(" ");

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean;
  }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      menuRowClass,
      "cursor-default",
      "data-[state=open]:bg-surface-3 data-[state=open]:shadow-[inset_2px_0_0_var(--color-primary)]",
      inset && "pl-7",
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto size-3.5 text-muted-foreground" strokeWidth={1.75} />
  </DropdownMenuPrimitive.SubTrigger>
));
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName;

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    className={cn(menuPanelClass, className)}
    {...props}
  />
));
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 5, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(menuPanelClass, className)}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      menuRowClass,
      "cursor-pointer",
      "[&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:[stroke-width:1.75]",
      inset && "pl-7",
      className
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(menuRowClass, "cursor-pointer pl-7 pr-2", className)}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex size-3.5 items-center justify-center text-primary">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="size-3.5" strokeWidth={2} />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = DropdownMenuPrimitive.CheckboxItem.displayName;

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(menuRowClass, "cursor-pointer pl-7 pr-2", className)}
    {...props}
  >
    <span className="absolute left-2 flex size-3.5 items-center justify-center text-primary">
      <DropdownMenuPrimitive.ItemIndicator>
        {/* A square pip, not a dot — the radio marker matches the machined
            corner language rather than importing a bullet from elsewhere. */}
        <Circle className="size-2 fill-current" strokeWidth={0} />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
));
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn("micro-caps px-2 pb-1 pt-2 text-muted-foreground", inset && "pl-7", className)}
    {...props}
  />
));
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    // Rule 4: the seam runs to the panel edge, so the menu reads as one plate
    // divided rather than as stacked cards.
    className={cn("-mx-1 my-1 h-px bg-border-subtle", className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

const DropdownMenuShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn(
        "ml-auto text-[11px] tabular-nums tracking-[0.08em] text-muted-foreground/80",
        className
      )}
      {...props}
    />
  );
};
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
};
