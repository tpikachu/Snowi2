import React from "react";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const Toggle = ({ checked, onChange, disabled = false }: ToggleProps) => {
  const trackClasses = checked
    ? "bg-primary border-primary hover:bg-primary-hover hover:border-primary-hover"
    : "bg-surface-raised border-border hover:border-border-hover";

  // Checked knob rides on the teal track, so it uses the same ink as a primary
  // button label; unchecked it sits on a neutral track.
  const knobClasses = checked ? "bg-primary-foreground" : "bg-muted-foreground";

  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      className={`relative inline-flex h-5.5 w-10 items-center rounded-full border transition-colors duration-150 ease-snap outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${trackClasses} ${
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform duration-150 ease-snap ${
          checked ? "translate-x-5" : "translate-x-1"
        } ${knobClasses}`}
      />
    </button>
  );
};
