import React from "react";
import { useTranslation } from "react-i18next";
import { SettingsPanel, SettingsPanelRow } from "../ui/SettingsSection";
import { useSettingsLayout } from "../ui/useSettingsLayout";
import { Button } from "../ui/button";
import { cn } from "../lib/utils";
import { formatHotkeyLabel } from "../../utils/hotkeys";
import { settingsGroupDomId } from "./settingsNav";

export interface HotkeyMapRow {
  /** Also the scroll anchor the settings nav and search link to. */
  id: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  label: string;
  description: string;
  /** The slot's editor — a `HotkeyListInput`. */
  control: React.ReactNode;
  /**
   * Offered when the slot is empty. Opt-in shortcuts ship unbound (four global
   * accelerators registered behind the user's back is a good way to break
   * whatever else already owned them), so the suggestion is how a user gets a
   * sensible binding without inventing one.
   */
  suggestion?: { hotkey: string; onApply: () => void; disabled?: boolean };
  /** Settings that belong to this shortcut, e.g. its activation mode. */
  extra?: React.ReactNode;
}

/**
 * Every global shortcut in one table.
 *
 * Each slot used to be its own titled card, which meant five headings, five
 * descriptions and five panels to read past before finding the one row you
 * came to change. As a single panel the whole keymap is legible at a glance
 * and the slots line up in one column, so "what is bound to what" is one
 * downward scan.
 *
 * The per-slot anchor IDs survive the merge: each row still publishes
 * `data-settings-group`, so the nav pane and settings search keep resolving to
 * the exact shortcut rather than to the top of the section.
 */
export default function HotkeyMap({ rows }: { rows: HotkeyMapRow[] }) {
  const { t } = useTranslation();
  const { isCompact } = useSettingsLayout();

  return (
    <SettingsPanel>
      {rows.map((row) => (
        <SettingsPanelRow key={row.id}>
          <div id={settingsGroupDomId(row.id)} data-settings-group={row.id} className="scroll-mt-3">
            <div className={cn("flex gap-4", isCompact ? "flex-col" : "items-start")}>
              <div className="flex min-w-0 flex-1 items-start gap-2.5">
                <row.icon size={14} className="mt-px shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs font-medium leading-none text-foreground">{row.label}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {row.description}
                  </p>
                </div>
              </div>

              <div className={cn("shrink-0", isCompact ? "w-full" : "w-60")}>
                {row.control}
                {row.suggestion && (
                  <Button
                    type="button"
                    variant="outline-flat"
                    size="sm"
                    className="mt-2"
                    disabled={row.suggestion.disabled}
                    onClick={row.suggestion.onApply}
                  >
                    {t("settingsPage.hotkeys.useSuggested", {
                      hotkey: formatHotkeyLabel(row.suggestion.hotkey),
                    })}
                  </Button>
                )}
              </div>
            </div>

            {row.extra && (
              <div className="mt-3 border-t border-border-subtle pt-3">{row.extra}</div>
            )}
          </div>
        </SettingsPanelRow>
      ))}
    </SettingsPanel>
  );
}
