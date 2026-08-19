import { MousePointerClick, MicVocal } from "lucide-react";
import { useTranslation } from "react-i18next";

type ActivationMode = "tap" | "push";

interface ActivationModeSelectorProps {
  value: ActivationMode;
  onChange: (mode: ActivationMode) => void;
  disabled?: boolean;
}

const OPTIONS = [
  { mode: "tap", Icon: MousePointerClick, labelKey: "common.tap" },
  { mode: "push", Icon: MicVocal, labelKey: "common.hold" },
] as const;

/**
 * Segmented gate, identical construction to `tabs.tsx` and
 * `ProcessingModeSelector` — recessed track, one raised segment, accent rail
 * under the live one.
 */
export function ActivationModeSelector({
  value,
  onChange,
  disabled = false,
}: ActivationModeSelectorProps) {
  const { t } = useTranslation();

  return (
    <div
      className={`relative flex rounded-control border border-border-subtle bg-surface-1 p-0.5 shadow-(--shadow-well) ${
        disabled ? "cursor-not-allowed opacity-55 grayscale" : ""
      }`}
    >
      {/* Raised plate under the live segment. */}
      <div
        className={`absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-[2px] border border-border-subtle bg-surface-2 shadow-(--shadow-control) transition-transform duration-150 ease-snap ${
          value === "push" ? "translate-x-[calc(100%+4px)]" : "translate-x-0"
        }`}
      />

      {OPTIONS.map(({ mode, Icon, labelKey }) => (
        <button
          key={mode}
          type="button"
          disabled={disabled}
          aria-pressed={value === mode}
          onClick={() => onChange(mode)}
          className={[
            "relative z-10 flex flex-1 items-center justify-center gap-1 rounded-[2px] px-2.5 py-1",
            "text-xs font-medium transition-colors duration-100 ease-snap focus-ring-tight",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
            value === mode ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            "after:pointer-events-none after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:content-['']",
            value === mode ? "after:bg-primary" : "",
          ].join(" ")}
        >
          <Icon className="size-3" strokeWidth={1.75} />
          <span>{t(labelKey)}</span>
        </button>
      ))}
    </div>
  );
}
