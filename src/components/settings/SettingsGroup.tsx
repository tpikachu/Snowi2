import React from "react";
import { cn } from "../lib/utils";
import { useSettingsSurface } from "./settingsSurfaceContext";
import {
  SECTION_BY_ID,
  isVisibleEntry,
  settingsGroupDomId,
  type SettingsSectionType,
} from "./settingsNav";

interface SettingsGroupProps {
  /** Stable ID, also the scroll anchor the nav pane links to. */
  id: string;
  title: string;
  description?: string;
  /** Secondary line under the description — platform caveats and the like. */
  note?: React.ReactNode;
  /** Right-aligned control in the group header (a re-check button, say). */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * One titled block of settings. Every group registers itself in the DOM with
 * `data-settings-group`, which is how the nav pane discovers which anchors are
 * actually on screen — platform-conditional groups never leave a dead link
 * behind.
 *
 * `break-inside-avoid` keeps a group whole when the section flows into two
 * columns on a wide window.
 *
 * A group belonging to a hidden feature renders nothing, decided here rather
 * than at each call site. The nav pane filters its anchors through the same
 * predicate, and the two drifting apart is what leaves either a dead link or a
 * visible block of settings for a feature that has been switched off — which
 * is how "Sound Effects" and "Floating Icon" survived the dictation cull.
 */
export default function SettingsGroup({
  id,
  title,
  description,
  note,
  action,
  children,
  className,
}: SettingsGroupProps) {
  const headingId = `${settingsGroupDomId(id)}-heading`;

  if (!isVisibleEntry(id)) return null;

  return (
    <section
      id={settingsGroupDomId(id)}
      data-settings-group={id}
      aria-labelledby={headingId}
      className={cn("break-inside-avoid scroll-mt-3", className)}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            id={headingId}
            className="text-[13px] font-semibold leading-tight tracking-tight text-foreground"
          >
            {title}
          </h3>
          {description && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
          )}
          {note && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{note}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/**
 * Wrapper for one section's groups. Single column keeps a comfortable measure;
 * wide windows flow the groups into two balanced columns for the sections that
 * are made of many small panels.
 */
export function SettingsSectionBody({
  section,
  children,
  className,
}: {
  section: SettingsSectionType;
  children: React.ReactNode;
  className?: string;
}) {
  const { isWide } = useSettingsSurface();
  const twoColumn = !!SECTION_BY_ID[section]?.twoColumn && isWide;

  return (
    <div
      className={cn(
        twoColumn
          ? "w-full columns-2 gap-6 [&>*]:mb-6 [&>*]:break-inside-avoid"
          : "mx-auto flex w-full max-w-[46rem] flex-col gap-6",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * One panel's body inside a panelled section (Speech-to-Text, Language Models):
 * the same measure and rhythm as a single-column section.
 */
export function SettingsPanelBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto flex w-full max-w-[46rem] flex-col gap-6", className)}>
      {children}
    </div>
  );
}

/** Two-up field layout for short inputs; collapses to one column when narrow. */
export function SettingsFieldGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { isCompact } = useSettingsSurface();

  return (
    <div className={cn("grid gap-3", isCompact ? "grid-cols-1" : "grid-cols-2", className)}>
      {children}
    </div>
  );
}

/** Label + control + help text, stacked. The rhythm every field follows. */
export function SettingsField({
  htmlFor,
  label,
  help,
  children,
  className,
}: {
  htmlFor: string;
  label: string;
  help?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium leading-none text-foreground">
        {label}
      </label>
      {children}
      {help && <p className="text-xs leading-relaxed text-muted-foreground">{help}</p>}
    </div>
  );
}
