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
        "group relative h-full w-full rounded-lg border p-3.5 text-left",
        "transition-[background-color,border-color,box-shadow] duration-150 ease-snap",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        selected
          ? "border-primary/45 bg-primary/8 dark:bg-primary/10 shadow-(--shadow-selected)"
          : "border-border-subtle bg-surface-1 hover:border-border-hover hover:bg-surface-2",
        disabled && "cursor-not-allowed border-border-subtle bg-muted text-muted-foreground"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
            "transition-colors duration-150 ease-snap",
            selected
              ? "bg-primary/15 dark:bg-primary/20"
              : "bg-surface-3 group-hover:bg-primary/12 dark:bg-surface-3"
          )}
        >
          <Icon
            className={cn(
              "h-4 w-4 transition-colors duration-150 ease-snap",
              selected ? "text-primary" : "text-muted-foreground group-hover:text-primary"
            )}
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium leading-snug text-foreground">{title}</span>
          <span className="mt-1 block text-xs leading-snug text-muted-foreground">
            {description}
          </span>
        </span>

        <span
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
            "transition-colors duration-150 ease-snap",
            selected ? "border-primary bg-primary" : "border-border bg-transparent"
          )}
        >
          {selected && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
        </span>
      </div>
    </button>
  );
}
