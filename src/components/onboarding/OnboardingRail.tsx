import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Check, LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";
import { SnowyMark } from "./SnowyMark";

export interface RailStep {
  id: string;
  title: string;
  icon: LucideIcon;
}

interface OnboardingRailProps {
  steps: RailStep[];
  currentStep: number;
  /** Only ever called for a step the user has already completed. */
  onStepSelect: (index: number) => void;
  className?: string;
}

/**
 * Quiet left rail: brand lockup, the steps as a labelled vertical list with
 * completed / active / upcoming states, and a progress readout at the foot.
 */
export default function OnboardingRail({
  steps,
  currentStep,
  onStepSelect,
  className,
}: OnboardingRailProps) {
  const { t } = useTranslation();
  const total = steps.length;
  const percent = total > 0 ? Math.round(((currentStep + 1) / total) * 100) : 0;

  return (
    <aside
      className={cn(
        "relative w-60 shrink-0 flex-col overflow-hidden border-r border-border-subtle bg-surface-1",
        className
      )}
    >
      {/* One soft teal wash behind the mark — the only decoration in the flow. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-64"
        style={{
          background:
            "radial-gradient(110% 70% at 0% 0%, oklch(from var(--color-primary) l c h / 0.12), transparent 72%)",
        }}
      />

      {/* Drag strip — on macOS the traffic lights sit here. */}
      <div
        className="relative h-12 shrink-0 border-b border-border"
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
      />

      <div className="relative flex items-center gap-2.5 px-5 pt-6 pb-7">
        <SnowyMark className="h-7 w-7 rounded-[7px] shadow-(--shadow-card)" />
        <span className="text-sm font-semibold tracking-tight text-foreground">Snowy</span>
      </div>

      <nav
        aria-label={t("onboarding.rail.ariaLabel")}
        className="relative min-h-0 flex-1 overflow-y-auto px-3"
      >
        <ol className="space-y-0.5">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;

            return (
              <li key={step.id} className="relative">
                {index < steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute left-5 top-7 -bottom-0.5 w-px",
                      isCompleted ? "bg-primary/35" : "bg-border-subtle"
                    )}
                  />
                )}

                <button
                  type="button"
                  disabled={!isCompleted}
                  aria-current={isActive ? "step" : undefined}
                  onClick={() => onStepSelect(index)}
                  className={cn(
                    "group relative flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left",
                    "outline-none transition-colors duration-150 ease-snap",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface-1",
                    isActive && "bg-primary/8 dark:bg-primary/12",
                    isCompleted
                      ? "hover:bg-foreground/4 dark:hover:bg-white/5"
                      : "cursor-default disabled:pointer-events-none"
                  )}
                >
                  <span
                    className={cn(
                      "relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                      "transition-colors duration-150 ease-snap",
                      isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : isCompleted
                          ? "border-primary/35 bg-primary/12 text-primary"
                          : "border-border bg-surface-2 text-muted-foreground/50"
                    )}
                  >
                    {isCompleted ? (
                      <Check className="h-3 w-3" strokeWidth={3} />
                    ) : (
                      <Icon className="h-2.5 w-2.5" />
                    )}
                  </span>

                  <span
                    className={cn(
                      "truncate text-[13px] transition-colors duration-150 ease-snap",
                      isActive
                        ? "font-medium text-foreground"
                        : isCompleted
                          ? "text-foreground/70 group-hover:text-foreground"
                          : "text-muted-foreground/60"
                    )}
                  >
                    {step.title}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* h-16 matches the nav bar in the content column, so both hairlines line up. */}
      <div className="relative flex h-16 shrink-0 flex-col justify-center gap-2 border-t border-border-subtle px-5">
        <p className="text-[11px] text-muted-foreground tabular-figures" data-numeric>
          {t("onboarding.rail.progress", { current: currentStep + 1, total })}
        </p>
        <div className="h-1 overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-snap"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </aside>
  );
}
