import React from "react";
import { useTranslation } from "react-i18next";
import { Cloud, Lock } from "lucide-react";

interface ProcessingModeSelectorProps {
  useLocalWhisper: boolean;
  setUseLocalWhisper: (value: boolean) => void;
  className?: string;
}

/**
 * The same segmented gate as `tabs.tsx`: a recessed track with one segment
 * raised out of it and an accent rail under the live one.
 *
 * The old version painted itself in raw `white/5` washes, which meant it was
 * the one control in the app that could not follow the theme. Everything here
 * is a semantic token.
 */
export default function ProcessingModeSelector({
  useLocalWhisper,
  setUseLocalWhisper,
  className = "",
}: ProcessingModeSelectorProps) {
  const { t } = useTranslation();

  const optionClass = (active: boolean) =>
    [
      "relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-[2px] py-1.5",
      "text-[13px] font-medium cursor-pointer",
      "transition-colors duration-100 ease-snap focus-ring-tight",
      active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      // Rule 3: the activation rail.
      "after:pointer-events-none after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:content-['']",
      active ? "after:bg-primary" : "",
    ].join(" ");

  return (
    <div
      className={`relative flex rounded-control border border-border-subtle bg-surface-1 p-0.5 shadow-(--shadow-well) ${className}`}
    >
      {/* Raised plate under the live segment. */}
      <div
        className={`absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-[2px] border border-border-subtle bg-surface-2 shadow-(--shadow-control) transition-transform duration-150 ease-snap ${
          useLocalWhisper ? "translate-x-[calc(100%+4px)]" : "translate-x-0"
        }`}
      />

      <button
        type="button"
        onClick={() => setUseLocalWhisper(false)}
        aria-pressed={!useLocalWhisper}
        className={optionClass(!useLocalWhisper)}
      >
        <Cloud className="size-3.5" strokeWidth={1.75} />
        <span>{t("common.cloud")}</span>
        {!useLocalWhisper && <span className="micro-caps text-success">{t("common.fast")}</span>}
      </button>

      <button
        type="button"
        onClick={() => setUseLocalWhisper(true)}
        aria-pressed={useLocalWhisper}
        className={optionClass(useLocalWhisper)}
      >
        <Lock className="size-3.5" strokeWidth={1.75} />
        <span>{t("common.local")}</span>
        {useLocalWhisper && <span className="micro-caps text-primary">{t("common.private")}</span>}
      </button>
    </div>
  );
}
