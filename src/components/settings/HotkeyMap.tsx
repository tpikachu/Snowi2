import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { SettingsPanel, SettingsPanelRow } from "../ui/SettingsSection";
import { HotkeyInput } from "../ui/HotkeyInput";
import { cn } from "../lib/utils";
import { formatHotkeyLabel } from "../../utils/hotkeys";
import { parseHotkeyList, serializeHotkeyList } from "../../utils/hotkeys";
import { normalizeHotkey } from "../../utils/hotkeyValidator";
import { getPlatform } from "../../utils/platform";
import { settingsGroupDomId } from "./settingsNav";

export interface HotkeyMapRow {
  /** Also the scroll anchor the settings search links to. */
  id: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  label: string;
  description: string;
  /** The slot's current bindings as a comma-separated list ("" for unset). */
  hotkey: string;
  /** Commit a new list. May resolve `false` on failure; the store not
   *  updating is what rolls the chips back — they render from `hotkey`. */
  onChange: (list: string) => unknown;
  /** Called when the last binding is removed. Omit to make the slot required. */
  onClear?: () => unknown;
  /** Per-hotkey validation (cross-slot conflicts). */
  validate?: (hotkey: string) => string | null | undefined;
  disabled?: boolean;
  /** Cap on list size, e.g. 1 on backends that only apply the primary hotkey. */
  maxHotkeys?: number;
  /**
   * Offered when the slot is empty. Opt-in shortcuts ship unbound (four
   * global accelerators registered behind the user's back is a good way to
   * break whatever else already owned them), so the suggestion is how a user
   * gets a sensible binding without inventing one.
   */
  suggestion?: { hotkey: string; onApply: () => void; disabled?: boolean };
  /** Settings that belong to this shortcut (activation mode, layout). */
  extra?: React.ReactNode;
  /** Right-aligned footer affordance (e.g. reset to default). */
  footerEnd?: React.ReactNode;
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

/** Which binding of which row is being re-recorded; -1 appends a new one. */
interface EditTarget {
  rowId: string;
  index: number;
}

/**
 * Every global shortcut as one flat table, recorded in place.
 *
 * The reference product's manner: name and purpose on the left, the binding
 * as keycaps on the right, and clicking the caps turns them into a recorder —
 * press the combo, done. No expanding editor, no second surface. A row's
 * related settings (activation mode, meeting layout) sit as one quiet line
 * beneath it, always visible, because a select nobody can find is a select
 * nobody uses.
 *
 * The chips render straight from the store-held `hotkey` value: a commit that
 * fails simply never updates the store, and the caps stay what they were —
 * no optimistic state to roll back.
 */
export default function HotkeyMap({ rows }: { rows: HotkeyMapRow[] }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const platform = getPlatform();

  const isSameHotkey = (a: string, b: string) =>
    normalizeHotkey(a, platform) === normalizeHotkey(b, platform);

  const commitList = (row: HotkeyMapRow, next: string[]) => {
    setEditing(null);
    if (next.length === 0) {
      void row.onClear?.();
      return;
    }
    void row.onChange(serializeHotkeyList(next));
  };

  // Block binding the same combo twice within one slot (normalized, so alias
  // spellings collide too), then defer to the row's cross-slot validation.
  const makeValidate =
    (row: HotkeyMapRow, bindings: string[], excludeIndex: number) => (hotkey: string) => {
      if (bindings.some((existing, i) => i !== excludeIndex && isSameHotkey(existing, hotkey))) {
        return t("hotkeyInput.duplicate");
      }
      return row.validate?.(hotkey);
    };

  return (
    <SettingsPanel>
      {rows.map((row) => {
        const bindings = parseHotkeyList(row.hotkey);
        const max = row.maxHotkeys ?? Infinity;
        const edit = editing?.rowId === row.id ? editing : null;
        const canRemove = (index: number) =>
          bindings.length > 1 || (!!row.onClear && index === 0 && bindings.length === 1);

        return (
          <SettingsPanelRow key={row.id}>
            <div
              id={settingsGroupDomId(row.id)}
              data-settings-group={row.id}
              className="scroll-mt-3"
            >
              <div className="flex items-center gap-3">
                <row.icon size={15} className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-tight text-foreground">
                    {row.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {row.description}
                  </span>
                </span>

                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  {bindings.map((binding, index) =>
                    edit?.index === index ? (
                      <HotkeyInput
                        key={`edit-${index}`}
                        variant="chip"
                        autoFocus
                        value={binding}
                        disabled={row.disabled}
                        validate={makeValidate(row, bindings, index)}
                        onChange={(next) =>
                          commitList(
                            row,
                            bindings.map((b, i) => (i === index ? next : b))
                          )
                        }
                        onBlur={() => setEditing(null)}
                      />
                    ) : (
                      <span key={`${binding}-${index}`} className="group/chip flex items-center">
                        <button
                          type="button"
                          disabled={row.disabled}
                          onClick={() => setEditing({ rowId: row.id, index })}
                          aria-label={t("hotkeyInput.ariaLabel")}
                          title={t("hotkeyInput.clickToChangeLower")}
                          className={cn(
                            "flex items-center rounded-lg px-1 py-0.5 outline-none",
                            "transition-colors duration-100 ease-snap hover:bg-surface-2",
                            "focus-visible:ring-2 focus-visible:ring-ring",
                            "disabled:cursor-default disabled:opacity-55"
                          )}
                        >
                          <Keycaps hotkey={binding} />
                        </button>
                        {canRemove(index) && (
                          <button
                            type="button"
                            disabled={row.disabled}
                            onClick={() =>
                              commitList(
                                row,
                                bindings.filter((_, i) => i !== index)
                              )
                            }
                            aria-label={t("hotkeyInput.remove")}
                            className={cn(
                              "flex size-4 items-center justify-center rounded-sm text-muted-foreground/60",
                              "opacity-0 outline-none transition-opacity duration-100",
                              "hover:text-destructive focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring",
                              "group-hover/chip:opacity-100"
                            )}
                          >
                            <X size={11} />
                          </button>
                        )}
                      </span>
                    )
                  )}

                  {edit?.index === -1 && (
                    <HotkeyInput
                      variant="chip"
                      autoFocus
                      value=""
                      disabled={row.disabled}
                      validate={makeValidate(row, bindings, -1)}
                      onChange={(next) => commitList(row, [...bindings, next])}
                      onBlur={() => setEditing(null)}
                    />
                  )}

                  {bindings.length === 0 && !edit && (
                    <button
                      type="button"
                      disabled={row.disabled}
                      onClick={() => setEditing({ rowId: row.id, index: -1 })}
                      className={cn(
                        "rounded-md bg-surface-2 px-2 py-1 text-[11px] font-medium text-muted-foreground",
                        "outline-none transition-colors duration-100 ease-snap",
                        "hover:bg-surface-3 hover:text-foreground",
                        "focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-55"
                      )}
                    >
                      {t("settingsPage.hotkeys.notSet")}
                    </button>
                  )}

                  {bindings.length > 0 && bindings.length < max && !edit && (
                    <button
                      type="button"
                      disabled={row.disabled}
                      onClick={() => setEditing({ rowId: row.id, index: -1 })}
                      aria-label={t("hotkeyInput.addAnother")}
                      title={t("hotkeyInput.addAnother")}
                      className={cn(
                        "flex size-6 items-center justify-center rounded-md text-muted-foreground/60",
                        "outline-none transition-colors duration-100 ease-snap",
                        "hover:bg-surface-2 hover:text-foreground",
                        "focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-55"
                      )}
                    >
                      <Plus size={12} />
                    </button>
                  )}
                </div>
              </div>

              {(row.suggestion && bindings.length === 0 && !edit) || row.footerEnd ? (
                <div className="mt-1.5 flex items-center justify-between gap-3 pl-7">
                  {row.suggestion && bindings.length === 0 && !edit ? (
                    <button
                      type="button"
                      disabled={row.suggestion.disabled}
                      onClick={row.suggestion.onApply}
                      className={cn(
                        "rounded-sm text-xs text-muted-foreground outline-none transition-colors",
                        "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                        "disabled:opacity-50"
                      )}
                    >
                      {t("settingsPage.hotkeys.useSuggested", {
                        hotkey: formatHotkeyLabel(row.suggestion.hotkey),
                      })}
                    </button>
                  ) : (
                    <span />
                  )}
                  {row.footerEnd}
                </div>
              ) : null}

              {row.extra && (
                <div className="mt-2.5 border-t border-border-subtle pt-2.5 pl-7">{row.extra}</div>
              )}
            </div>
          </SettingsPanelRow>
        );
      })}
    </SettingsPanel>
  );
}
