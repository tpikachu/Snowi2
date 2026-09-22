import { useTranslation } from "react-i18next";
import { ProviderIcon } from "./ProviderIcon";
import { cn } from "../lib/utils";

export interface ProviderGridItem {
  id: string;
  name: string;
  /** A key/credential is stored for this provider. */
  configured?: boolean;
  /**
   * The features this provider serves ("Chat", "Write-ups"), each worn as a
   * badge. Several providers can serve at once — chat on one, write-ups on
   * another — so one "In use" badge on one card was a lie for the rest.
   */
  roles?: string[];
  /** One short qualifier under the name — region limits, "no key needed", etc. */
  note?: string;
}

interface ProviderGridProps {
  providers: ProviderGridItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  className?: string;
}

/**
 * The provider chooser.
 *
 * A wrapping strip of chips was fine at three providers and stopped being fine
 * at eight: the rows reflowed with the panel width, the names crowded, and
 * nothing on screen said which providers were actually usable — you had to
 * click each one to discover whether its key was set. This lays them out on a
 * fixed grid and puts that answer on the card, so a glance is enough to see
 * both what is available and what is ready to use.
 */
export function ProviderGrid({ providers, selectedId, onSelect, className }: ProviderGridProps) {
  const { t } = useTranslation();

  return (
    <div
      role="radiogroup"
      aria-label={t("reasoning.providerGrid.label")}
      className={cn("grid grid-cols-2 gap-1.5 sm:grid-cols-3", className)}
    >
      {providers.map((provider) => {
        const isSelected = provider.id === selectedId;

        return (
          <button
            key={provider.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(provider.id)}
            className={cn(
              "focus-ring-tight flex min-h-11 items-center gap-2 rounded-control border px-2.5 py-2 text-left",
              "transition-colors duration-100 ease-snap",
              isSelected
                ? "border-primary/45 bg-surface-2 shadow-(--shadow-control)"
                : "border-border-subtle hover:border-border-hover hover:bg-surface-2"
            )}
          >
            <ProviderIcon provider={provider.id} className="size-4 shrink-0" />

            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block truncate text-xs font-medium leading-none",
                  isSelected ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {provider.name}
              </span>
              {provider.note && (
                <span className="mt-1 block truncate text-[11px] leading-none text-muted-foreground">
                  {provider.note}
                </span>
              )}
            </span>

            {/* The badges say what this provider serves; otherwise readiness,
                not selection: a filled dot means a key is stored. Titled
                rather than icon-only so it survives greyscale. */}
            {provider.roles && provider.roles.length > 0 ? (
              <span className="flex shrink-0 flex-col items-end gap-0.5" data-provider-roles="">
                {provider.roles.map((role) => (
                  <span
                    key={role}
                    className="rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary"
                  >
                    {role}
                  </span>
                ))}
              </span>
            ) : (
              <span
                aria-hidden="true"
                title={
                  provider.configured
                    ? t("reasoning.providerGrid.keySet")
                    : t("reasoning.providerGrid.keyMissing")
                }
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  provider.configured ? "bg-primary" : "border border-border-hover"
                )}
              />
            )}
            <span className="sr-only">
              {provider.configured
                ? t("reasoning.providerGrid.keySet")
                : t("reasoning.providerGrid.keyMissing")}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default ProviderGrid;
