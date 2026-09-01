import React from "react";
import { useTranslation } from "react-i18next";
import { useSettingsLayout } from "./useSettingsLayout";
import type { InferenceMode } from "../../types/electron";

/**
 * The settings scaffolding, in the product's softer rounded language
 * (client direction, 2026-08: match and beat the Cluely-class settings look).
 *
 * A settings panel is still ONE plate divided by full-width hairline seams
 * (`divide-y`) — never a stack of translucent cards — but the plate is now
 * rounded-xl with room to breathe in every row: 14px labels over muted
 * descriptions, optional leading icon tiles, and the pill Toggle on the
 * trailing edge. Micro-caps survive only as group metadata labels.
 */

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  title,
  description,
  children,
  className = "",
}) => {
  return (
    <div className={`space-y-2.5 ${className}`}>
      <div>
        <h3 className="micro-caps text-muted-foreground">{title}</h3>
        {description && (
          <p className="mt-1 text-xs leading-snug text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
};

interface SettingsGroupProps {
  title?: string;
  children: React.ReactNode;
  variant?: "default" | "highlighted";
  className?: string;
}

export const SettingsGroup: React.FC<SettingsGroupProps> = ({
  title,
  children,
  variant = "default",
  className = "",
}) => {
  const baseClasses = "space-y-2.5 rounded-xl border border-border-subtle p-3.5";
  const variantClasses = {
    default: "bg-surface-1 shadow-(--shadow-panel)",
    // Rule 3 — emphasis is a rail, not a tinted box.
    highlighted: "bg-surface-1 shadow-[var(--shadow-panel),inset_2px_0_0_var(--color-primary)]",
  };

  return (
    <div className={`${baseClasses} ${variantClasses[variant]} ${className}`}>
      {title && <h4 className="micro-caps text-muted-foreground">{title}</h4>}
      {children}
    </div>
  );
};

interface SettingsRowProps {
  label: string;
  description?: string;
  /** Optional leading icon, rendered in a soft square tile beside the copy. */
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const SettingsRow: React.FC<SettingsRowProps> = ({
  label,
  description,
  icon,
  children,
  className = "",
}) => {
  const { isCompact } = useSettingsLayout();

  return (
    <div
      className={`flex ${
        isCompact ? "flex-col items-start gap-2" : "items-center justify-between gap-4"
      } ${className}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {icon && (
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-3 text-muted-foreground"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-tight text-foreground">{label}</p>
          {description && (
            <p className="mt-1 text-xs leading-snug text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className={isCompact ? "" : "shrink-0"}>{children}</div>
    </div>
  );
};

export function SettingsPanel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle bg-surface-1 shadow-(--shadow-panel) ${className}`}
    >
      {children}
    </div>
  );
}

export function SettingsPanelRow({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { isCompact } = useSettingsLayout();

  return (
    <div className={`${isCompact ? "px-3.5 py-3" : "px-4 py-3"} ${className}`}>{children}</div>
  );
}

export function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-2.5">
      <h3 className="micro-caps text-muted-foreground">{title}</h3>
      {description && (
        <p className="mt-1 text-xs leading-snug text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

export interface InferenceModeOption {
  id: InferenceMode;
  disabled?: boolean;
  badge?: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

export function InferenceModeSelector({
  modes,
  activeMode,
  onSelect,
}: {
  modes: InferenceModeOption[];
  activeMode: InferenceMode | null;
  onSelect: (mode: InferenceMode) => void;
}) {
  const { t } = useTranslation();

  return (
    <SettingsPanel>
      {modes.map((mode) => {
        const isActive = activeMode === mode.id;
        const isDisabled = !!mode.disabled;
        return (
          <SettingsPanelRow
            key={mode.id}
            // Rule 3 — the live mode is marked on the leading edge of its row.
            className={`relative transition-[background-color,box-shadow] duration-100 ease-snap ${
              isActive ? "bg-surface-2 shadow-[inset_2px_0_0_var(--color-primary)]" : ""
            } ${isDisabled || isActive ? "" : "hover:bg-surface-2"}`}
          >
            <button
              onClick={() => onSelect(mode.id)}
              disabled={isDisabled}
              aria-pressed={isActive}
              className={`focus-ring-tight group flex w-full items-center gap-2.5 rounded-control text-left ${
                isDisabled ? "cursor-not-allowed opacity-55 grayscale" : "cursor-pointer"
              }`}
            >
              <div
                className={`flex size-7 shrink-0 items-center justify-center rounded-control border transition-colors duration-100 ease-snap ${
                  isActive
                    ? "border-primary/35 bg-primary/10 text-primary"
                    : "border-border-subtle bg-surface-3 text-muted-foreground group-hover:border-border"
                }`}
              >
                {mode.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold leading-tight text-foreground">
                    {mode.label}
                  </span>
                  {isActive && !isDisabled && (
                    <span className="micro-caps rounded-control border border-primary/25 bg-primary/10 px-1 py-px text-primary">
                      {t("common.active")}
                    </span>
                  )}
                  {isDisabled && mode.badge && (
                    <span className="micro-caps rounded-control border border-border-subtle bg-surface-3 px-1 py-px text-muted-foreground">
                      {mode.badge}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                  {mode.description}
                </p>
              </div>
              {/* Square selection marker — nothing in this system is round. */}
              <div
                className={`flex size-4 shrink-0 items-center justify-center rounded-[2px] border transition-colors duration-100 ease-snap ${
                  isActive
                    ? "border-primary bg-primary"
                    : "border-border-control bg-input shadow-(--shadow-well)"
                }`}
              >
                {isActive && <div className="size-1.5 rounded-[1px] bg-primary-foreground" />}
              </div>
            </button>
          </SettingsPanelRow>
        );
      })}
    </SettingsPanel>
  );
}
