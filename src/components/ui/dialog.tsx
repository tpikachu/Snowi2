import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";

/**
 * Dialogs in the "machined instrument" language.
 *
 * What changed and why:
 *   - 8px corner instead of 16px. A 16px radius on a 512px panel is a card
 *     shape; this is a panel shape.
 *   - The scrim is a tinted neutral (`--color-scrim`) with no backdrop blur.
 *   - Header and footer are divided from the body by full-bleed hairline
 *     seams (Rule 4), driven off the `--dlg-pad` custom property so the bleed
 *     always matches the panel's real inset.
 *   - A teal hairline caps the top edge.
 *   - Entry is fade + a 1% rise. No zoom.
 *
 * Behaviour — the portal, the focus trap, and the layered outside-click guard
 * below — is untouched.
 */
const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // A tinted neutral scrim, no backdrop blur. Blur is the decorative
      // default of the last five years and it costs a compositor pass on
      // every frame of a window this app keeps always-on-top.
      "fixed inset-0 z-50 bg-scrim",
      "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-100",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, onInteractOutside, ...props }, ref) => {
  // With another layer open above this dialog — a popper (Select/Popover/
  // DropdownMenu) or a stacked dialog — an outside click dismisses that
  // layer, never this dialog. Radix defers outside-click dismissal to a
  // one-time document `click` listener, and the upper layer can unmount
  // before it runs (e.g. a stacked dialog's Cancel closes it mid-click),
  // which un-gates this layer's own dismissal. So "was something above us"
  // must be snapshotted at pointerdown capture time, ahead of every Radix
  // handler.
  const contentRef = React.useRef<React.ElementRef<typeof DialogPrimitive.Content> | null>(null);
  const layerWasAboveRef = React.useRef(false);
  React.useEffect(() => {
    const snapshotLayersAbove = () => {
      // Later-mounted portals stack on top, so the last open dialog in DOM
      // order is the topmost one.
      const openDialogs = document.querySelectorAll('[role="dialog"][data-state="open"]');
      layerWasAboveRef.current =
        !!document.querySelector("[data-radix-popper-content-wrapper]") ||
        (openDialogs.length > 0 && openDialogs[openDialogs.length - 1] !== contentRef.current);
    };
    document.addEventListener("pointerdown", snapshotLayersAbove, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", snapshotLayersAbove, { capture: true });
    };
  }, []);

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={(node) => {
          contentRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        onInteractOutside={(event) => {
          onInteractOutside?.(event);
          if (event.defaultPrevented) return;
          // Focus-outside dismissals would read a snapshot left over from the
          // last pointerdown, however long ago — the guard is pointer-only.
          if (event.detail.originalEvent.type !== "pointerdown") return;
          if (layerWasAboveRef.current) event.preventDefault();
        }}
        className={cn(
          // `--dlg-pad` is the single source of the dialog's inset; the header
          // and footer read it to bleed their seams to the panel edge (Rule 4).
          "[--dlg-pad:1rem] fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2",
          "gap-3.5 p-(--dlg-pad) rounded-overlay duration-[140ms]",
          "bg-popover border border-border text-popover-foreground shadow-(--shadow-modal)",
          // A teal hairline caps the panel — the one piece of accent a modal
          // gets, and the tell that this is a Snowi surface and not a browser
          // dialog. Inset from the corners so it never overshoots the radius.
          "before:pointer-events-none before:absolute before:left-2 before:right-2 before:top-0 before:h-px before:bg-primary/45 before:content-['']",
          // No zoom. A modal that scales up reads as a notification; this one
          // rises 1% and settles.
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[49%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[49%]",
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="focus-ring-tight absolute right-2.5 top-2.5 flex size-7 items-center justify-center rounded-control text-muted-foreground transition-colors duration-100 ease-snap cursor-pointer hover:bg-surface-3 hover:text-foreground disabled:pointer-events-none">
          <X className="size-3.5" strokeWidth={1.75} />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

/**
 * Rule 4 — the header seam runs the full width of the panel. It only appears
 * when there is something below it to divide, so a title-only dialog stays a
 * single clean plate. `pr-7` reserves the close button's column.
 */
const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-header"
    className={cn(
      "flex flex-col gap-1 text-left",
      "-mx-(--dlg-pad) px-(--dlg-pad) pr-7 pb-3",
      "[&:not(:last-child)]:border-b [&:not(:last-child)]:border-border-subtle",
      className
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-footer"
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      "-mx-(--dlg-pad) px-(--dlg-pad) pt-3",
      "[&:not(:first-child)]:border-t [&:not(:first-child)]:border-border-subtle",
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-[15px] font-semibold leading-tight tracking-[-0.018em] text-foreground brand-heading",
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-[13px] leading-snug text-muted-foreground brand-body", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

// Custom confirmation dialog component
interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  variant?: "default" | "destructive";
  /** Extra content between the header and the footer (e.g. a type-to-confirm input). */
  children?: React.ReactNode;
  confirmDisabled?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  variant = "default",
  children,
  confirmDisabled = false,
}) => {
  const confirmRef = React.useRef<HTMLButtonElement>(null);

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  // Radix auto-focuses the first tabbable — the Cancel button — so Enter used
  // to cancel. Focus Confirm instead, except: destructive dialogs keep Cancel
  // focused (Enter must never destroy by default), and dialogs with children
  // keep Radix's choice (a type-to-confirm input owns focus and Enter itself).
  const handleOpenAutoFocus = (event: Event) => {
    if (children != null || variant === "destructive") return;
    event.preventDefault();
    confirmRef.current?.focus();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" onOpenAutoFocus={handleOpenAutoFocus}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            {cancelText}
          </Button>
          <Button
            ref={confirmRef}
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={confirmDisabled}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Custom alert dialog component
interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  okText?: string;
  onOk: () => void;
}

const AlertDialog: React.FC<AlertDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  okText = "OK",
  onOk,
}) => {
  const handleOk = () => {
    onOk();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="default" onClick={handleOk}>
            {okText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  ConfirmDialog,
  AlertDialog,
};
