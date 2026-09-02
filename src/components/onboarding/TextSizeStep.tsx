import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import { useSettingsStore } from "../../stores/settingsStore";
import StepShell from "./StepShell";

/**
 * Pick a comfortable text size before ever seeing the app.
 *
 * The preview is real, twice over: the sample card below scales with the
 * choice, and the choice is applied to this window's zoom immediately — the
 * onboarding surface itself is the preview. The same three options live in
 * Settings → Preferences afterwards; this step just asks the question at the
 * moment it costs nothing to answer.
 */

const OPTIONS = [
  { value: "1", labelKey: "settingsPage.general.appearance.textSizeDefault" },
  { value: "1.1", labelKey: "settingsPage.general.appearance.textSizeLarge" },
  { value: "1.25", labelKey: "settingsPage.general.appearance.textSizeLarger" },
] as const;

export default function TextSizeStep({ eyebrow }: { eyebrow?: string }) {
  const { t } = useTranslation();
  const uiTextScale = useSettingsStore((s) => s.uiTextScale);
  const setUiTextScale = useSettingsStore((s) => s.setUiTextScale);

  // Live preview: the whole window follows the choice, exactly as the app
  // will. ControlPanel applies the same zoom after onboarding; this window
  // has to apply it itself because ControlPanel is not mounted yet.
  useEffect(() => {
    const factor = Number.parseFloat(uiTextScale);
    window.electronAPI?.setUiZoom?.(Number.isFinite(factor) && factor > 0 ? factor : 1);
  }, [uiTextScale]);

  return (
    <StepShell
      eyebrow={eyebrow}
      title={t("onboarding.textSize.title")}
      description={t("onboarding.textSize.description")}
    >
      <div
        role="radiogroup"
        aria-label={t("settingsPage.general.appearance.textSize")}
        className="grid grid-cols-3 gap-2"
      >
        {OPTIONS.map((option) => {
          const isSelected = uiTextScale === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setUiTextScale(option.value)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border px-3 py-4",
                "outline-none transition-colors duration-150 ease-snap",
                "focus-visible:ring-2 focus-visible:ring-ring",
                isSelected
                  ? "border-primary/45 bg-primary-subtle/60"
                  : "border-border-subtle hover:border-border-hover hover:bg-surface-2"
              )}
            >
              {/* The letter is the option's own preview: same glyph, three
                  sizes, so the difference is visible before committing. */}
              <span
                aria-hidden="true"
                className={cn(
                  "font-semibold leading-none",
                  option.value === "1"
                    ? "text-lg"
                    : option.value === "1.1"
                      ? "text-xl"
                      : "text-2xl",
                  isSelected ? "text-primary" : "text-foreground"
                )}
              >
                Aa
              </span>
              <span
                className={cn(
                  "text-xs font-medium",
                  isSelected ? "text-primary" : "text-muted-foreground"
                )}
              >
                {t(option.labelKey)}
              </span>
            </button>
          );
        })}
      </div>

      {/* A sample of what the user will actually read — a write-up card —
          rendered at body size, which the window's zoom is already scaling. */}
      <div className="rounded-xl border border-border-subtle bg-surface-1 p-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {t("onboarding.textSize.previewLabel")}
        </p>
        <p className="mt-2 text-sm font-semibold text-foreground">
          {t("onboarding.textSize.previewHeading")}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {t("onboarding.textSize.previewBody")}
        </p>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("onboarding.textSize.changeLater")}
      </p>
    </StepShell>
  );
}
