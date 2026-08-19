import { Check, LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";

interface OptionCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}

/**
 * Rule 3 — selection is the accent rail down the leading edge plus a raised
 * plate, not a teal-tinted card. A grid of these used to turn half the screen
 * the brand colour the moment anything was chosen.
 *
 * The state marker is a square 3px checkbox rather than a circle: this is a
 * pick-one-of-many control, and nothing in the system is round.
 */
export default function OptionCard({
  icon: Icon,
  title,
  description,
  selected,
  onSelect,
  disabled = false,
}: OptionCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "group relative h-full w-full rounded-surface border p-3 text-left",
        "transition-[background-color,border-color,box-shadow] duration-100 ease-snap",
        "focus-ring",
        selected
          ? "border-border-control bg-surface-2 shadow-[var(--shadow-control),inset_2px_0_0_var(--color-primary)]"
          : "border-border-subtle bg-surface-1 shadow-(--shadow-panel) hover:border-border-hover hover:bg-surface-2",
        disabled && "cursor-not-allowed opacity-55 grayscale"
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-control border",
            "transition-colors duration-100 ease-snap",
            selected
              ? "border-primary/35 bg-primary/10"
              : "border-border-subtle bg-surface-3 group-hover:border-border"
          )}
        >
          <Icon
            className={cn(
              "size-3.5 transition-colors duration-100 ease-snap",
              selected ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
            )}
            strokeWidth={1.75}
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold leading-snug text-foreground">
            {title}
          </span>
          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
            {description}
          </span>
        </span>

        <span
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-[2px] border",
            "transition-colors duration-100 ease-snap",
            selected
              ? "border-primary bg-primary"
              : "border-border-control bg-input shadow-(--shadow-well)"
          )}
        >
          {selected && <Check className="size-3 text-primary-foreground" strokeWidth={2.5} />}
        </span>
      </div>
    </button>
  );
}
