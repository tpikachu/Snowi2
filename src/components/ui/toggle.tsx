import React from "react";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * A rocker switch, not a pill switch.
 *
 * Rule 1 says nothing in this system is a capsule, and the iOS-style pill is
 * the most borrowed shape in desktop UI. So: a 32x18 rectangular gate with a
 * 3px machined corner and a square 14px slug that slides between two hard
 * stops.
 *
 * Rule 2 carries the state as well as the colour — OFF is a recessed well,
 * ON is a raised teal plate. That means the switch still reads correctly for
 * a user who cannot separate the teal from the neutral.
 *
 * The visible gate is 18px tall, which is below the 28px target floor, so a
 * transparent `::before` expands the hit area to 40x32 without disturbing the
 * layout around it.
 *
 * Knob vs track: 7.53:1 off (muted-foreground on input), 9.06:1 on
 * (primary-foreground on primary) in dark; 6.24:1 / 5.76:1 in light.
 */
export const Toggle = ({ checked, onChange, disabled = false }: ToggleProps) => {
  const trackClasses = checked
    ? "bg-primary border-primary shadow-(--shadow-control) hover:bg-primary-hover hover:border-primary-hover"
    : "bg-input border-border-control shadow-(--shadow-well) hover:border-border-hover";

  const knobClasses = checked
    ? "bg-primary-foreground translate-x-3.5"
    : "bg-muted-foreground translate-x-0";

  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      data-slot="toggle"
      className={`relative inline-flex h-4.5 w-8 shrink-0 items-center rounded-control border p-px transition-colors duration-100 ease-snap focus-ring before:absolute before:-inset-x-1 before:-inset-y-[7px] before:content-[''] ${trackClasses} ${
        disabled ? "cursor-not-allowed opacity-55 grayscale" : "cursor-pointer"
      }`}
    >
      <span
        className={`pointer-events-none inline-block size-3.5 rounded-[2px] transition-transform duration-100 ease-snap ${knobClasses}`}
      />
    </button>
  );
};
