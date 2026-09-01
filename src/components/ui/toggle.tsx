import React from "react";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * A pill switch.
 *
 * This replaces the earlier rectangular rocker on explicit client direction
 * (2026-08): the product's surfaces pivoted to the softer, rounded language,
 * and the switch is the control that carries most of that read. ON is a
 * filled primary track with a light knob slid to the far stop; OFF is a
 * recessed neutral track — so the state is still carried by position and
 * fill, not colour alone.
 *
 * The visible track is 22px tall, below the 28px target floor, so a
 * transparent `::before` expands the hit area without disturbing the layout
 * around it.
 *
 * Knob vs track: muted-foreground on input OFF, primary-foreground on
 * primary ON — the same pairings the previous switch shipped with, both
 * comfortably past 4.5:1 in light and dark.
 */
export const Toggle = ({ checked, onChange, disabled = false }: ToggleProps) => {
  const trackClasses = checked
    ? "bg-primary border-primary hover:bg-primary-hover hover:border-primary-hover"
    : "bg-input border-border-control shadow-(--shadow-well) hover:border-border-hover";

  const knobClasses = checked
    ? "translate-x-[18px] bg-primary-foreground"
    : "translate-x-0 bg-muted-foreground";

  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      data-slot="toggle"
      className={`relative inline-flex h-[22px] w-10 shrink-0 items-center rounded-full border p-0.5 transition-colors duration-150 ease-snap focus-ring before:absolute before:-inset-x-1 before:-inset-y-[5px] before:content-[''] ${trackClasses} ${
        disabled ? "cursor-not-allowed opacity-55 grayscale" : "cursor-pointer"
      }`}
    >
      <span
        className={`pointer-events-none inline-block size-4 rounded-full shadow-sm transition-transform duration-150 ease-snap ${knobClasses}`}
      />
    </button>
  );
};
