import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { SettingsPanel, SettingsPanelRow } from "../ui/SettingsSection";
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
  /** The current binding, shown as keycaps. Empty/undefined renders "Not set". */
  hotkey?: string | null;
  /** The slot's editor — a `HotkeyListInput`. Revealed when the row opens. */
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
 * The current binding as keycaps — one cap per token, the way a shortcut is
 * printed on a keyboard rather than spelled in prose. This is what makes the
 * keymap reviewable at a glance: the eye reads caps without reading.
 */
export function Keycaps({ hotkey }: { hotkey: string }) {
  // A slot can hold several bindings ("F8,Ctrl+Space"); each renders as its
  // own run of caps, separated by a quiet dot.
  const bindings = hotkey
    .split(",")
    .map((binding) => binding.trim())
    .filter(Boolean);
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {bindings.map((binding, bindingIndex) => (
        <span key={`${binding}-${bindingIndex}`} className="flex items-center gap-1">
          {bindingIndex > 0 && <span className="text-[11px] text-muted-foreground/60">·</span>}
          {formatHotkeyLabel(binding)
            .split("+")
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part, index) => (
              <kbd
                key={`${part}-${index}`}
                className={cn(
                  "inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5",
                  "border border-border/60 bg-surface-2 text-[11px] font-medium text-foreground",
                  "shadow-[inset_0_-1.5px_0_var(--color-border)]"
                )}
              >
                {part}
              </kbd>
            ))}
        </span>
      ))}
    </span>
  );
}

/**
 * Every global shortcut in one table, editors hidden until asked for.
 *
 * Each slot used to show its editor, its suggestion button, and its extra
 * settings all at once — five open forms to read past before finding the one
 * binding you came to check. Now a closed row is just name, description, and
 * the binding as keycaps; clicking it opens the editor underneath. Reviewing
 * the keymap is a downward scan of caps, and editing stays one click away.
 *
 * The per-slot anchor IDs survive: each row still publishes
 * `data-settings-group`, so the nav pane and settings search keep resolving to
 * the exact shortcut rather than to the top of the section.
 */
export default function HotkeyMap({ rows }: { rows: HotkeyMapRow[] }) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <SettingsPanel>
      {rows.map((row) => {
        const isOpen = openId === row.id;
        return (
          <SettingsPanelRow key={row.id}>
            <div
              id={settingsGroupDomId(row.id)}
              data-settings-group={row.id}
              className="scroll-mt-3"
            >
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : row.id)}
                aria-expanded={isOpen}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg text-left",
                  "outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
              >
                <row.icon size={15} className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-tight text-foreground">
                    {row.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {row.description}
                  </span>
                </span>
                {row.hotkey ? (
                  <Keycaps hotkey={row.hotkey} />
                ) : (
                  <span className="shrink-0 rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {t("settingsPage.hotkeys.notSet")}
                  </span>
                )}
                <ChevronRight
                  size={14}
                  className={cn(
                    "shrink-0 text-muted-foreground/70 transition-transform duration-150",
                    isOpen && "rotate-90"
                  )}
                />
              </button>

              {isOpen && (
                <div className="mt-3 border-t border-border-subtle pt-3">
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
                  {row.extra && (
                    <div className="mt-3 border-t border-border-subtle pt-3">{row.extra}</div>
                  )}
                </div>
              )}
            </div>
          </SettingsPanelRow>
        );
      })}
    </SettingsPanel>
  );
}
