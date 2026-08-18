import type { ReactNode } from "react";
import { cn } from "../lib/utils";

interface StepShellProps {
  /** Optional mark or icon above the heading (used by the closing step). */
  media?: ReactNode;
  /** Small accent label above the heading — the step's name in the rail. */
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * One onboarding step: a single dominant heading, one supporting line, then
 * the controls. Every step uses it so the flow keeps one rhythm.
 */
export default function StepShell({
  media,
  eyebrow,
  title,
  description,
  children,
  className,
}: StepShellProps) {
  return (
    <div className={cn("space-y-6", className)}>
      <header className="space-y-2">
        {media && <div className="pb-1">{media}</div>}
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        {description && (
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </header>

      <div className="space-y-3">{children}</div>
    </div>
  );
}

interface StepSectionProps {
  label?: string;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** A labelled panel — the only container the step bodies group controls in. */
export function StepSection({
  label,
  hint,
  action,
  children,
  className,
  bodyClassName,
}: StepSectionProps) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-border-subtle bg-surface-1",
        className
      )}
    >
      {(label || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-2.5">
          <div className="min-w-0">
            {label && (
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {label}
              </h2>
            )}
            {hint && <p className="mt-0.5 text-xs leading-snug text-muted-foreground/70">{hint}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
