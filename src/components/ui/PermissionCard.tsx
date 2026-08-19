import { Button } from "./button";
import { Check, LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";

interface PermissionCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  granted: boolean;
  onRequest: () => void;
  buttonText?: string;
  badge?: string;
  hint?: string;
}

/**
 * A status row, read left to right: rail -> glyph -> what it is -> the action.
 *
 * Rule 3 carries "granted" as a green rail rather than washing the whole row
 * in success tint; a permissions list is meant to be scanned down the leading
 * edge, and a column of rails does that in one pass.
 */
export default function PermissionCard({
  icon: Icon,
  title,
  description,
  granted,
  onRequest,
  buttonText = "Grant Access",
  badge,
  hint,
}: PermissionCardProps) {
  return (
    <div
      className={cn(
        "group relative rounded-surface border p-2.5",
        "transition-[background-color,border-color] duration-100 ease-snap",
        granted
          ? "border-border-subtle bg-surface-1 shadow-[var(--shadow-panel),inset_2px_0_0_var(--color-success)]"
          : "border-border-subtle bg-surface-1 shadow-[var(--shadow-panel),inset_2px_0_0_var(--color-warning)] hover:border-border"
      )}
    >
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-control border",
            "transition-colors duration-100 ease-snap",
            granted ? "border-success/30 bg-success/10" : "border-border-subtle bg-surface-3"
          )}
        >
          {granted ? (
            <Check className="size-3.5 text-success" strokeWidth={2.5} />
          ) : (
            <Icon className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold leading-tight text-foreground">
            {title}
            {badge && (
              <span className="micro-caps inline-flex items-center rounded-control border border-border-subtle bg-surface-3 px-1 py-px text-muted-foreground">
                {badge}
              </span>
            )}
          </h3>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{description}</p>
        </div>

        {!granted && (
          <Button onClick={onRequest} size="sm" className="shrink-0">
            {buttonText}
          </Button>
        )}
      </div>

      {hint && !granted && (
        <p className="mt-1.5 pl-9.5 text-[11px] leading-snug text-warning">{hint}</p>
      )}
    </div>
  );
}
