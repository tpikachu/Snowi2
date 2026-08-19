import React from "react";
import { Check, LucideIcon } from "lucide-react";

interface Step {
  title: string;
  icon: LucideIcon;
}

interface StepProgressProps {
  steps: Step[];
  currentStep: number;
  className?: string;
}

/**
 * A track of stations, not a row of chips.
 *
 * The active step is the one raised plate on the strip (Rule 2) carrying the
 * accent rail underneath it (Rule 3); completed steps flatten to a success
 * glyph and the connector between them fills in. Everything is square, so the
 * connectors read as a continuous rail rather than as gaps between pills.
 */
export default function StepProgress({ steps, currentStep, className = "" }: StepProgressProps) {
  return (
    <div className={`flex items-center justify-center gap-0.5 whitespace-nowrap ${className}`}>
      {steps.map((step, index) => {
        const Icon = step.icon;
        const isActive = index === currentStep;
        const isCompleted = index < currentStep;

        return (
          <React.Fragment key={index}>
            <div
              className={`relative flex items-center gap-1.5 rounded-control px-2 py-1 transition-colors duration-100 ease-snap ${
                isActive
                  ? "border border-border-subtle bg-surface-2 shadow-(--shadow-control) after:pointer-events-none after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-primary after:content-['']"
                  : "border border-transparent"
              }`}
            >
              <div
                className={`flex size-4 shrink-0 items-center justify-center rounded-[2px] transition-colors duration-100 ease-snap ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isCompleted
                      ? "border border-success/30 bg-success/10 text-success"
                      : "border border-border-subtle bg-surface-3 text-muted-foreground"
                }`}
              >
                {isCompleted ? (
                  <Check className="size-2.5" strokeWidth={2.5} />
                ) : (
                  <Icon className="size-2.5" strokeWidth={1.75} />
                )}
              </div>
              <span
                className={`micro-caps hidden md:block ${
                  isActive
                    ? "text-foreground"
                    : isCompleted
                      ? "text-success"
                      : "text-muted-foreground"
                }`}
              >
                {step.title}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                aria-hidden="true"
                className={`mx-0.5 h-px w-3 transition-colors duration-100 ease-snap ${
                  isCompleted ? "bg-success" : "bg-border"
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
