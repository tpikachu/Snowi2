import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./accordion";
import { getReservedShortcuts, getValidExamples, type Platform } from "../../utils/hotkeyValidator";
import { formatHotkeyLabelForPlatform } from "../../utils/hotkeys";

type AccordionPlatform = "macos" | "windows" | "linux";

const PLATFORM_MAP: Record<AccordionPlatform, Platform> = {
  macos: "darwin",
  windows: "win32",
  linux: "linux",
};

interface HotkeyGuidanceAccordionProps {
  defaultValue?: AccordionPlatform;
  className?: string;
}

export function HotkeyGuidanceAccordion({
  defaultValue,
  className = "",
}: HotkeyGuidanceAccordionProps) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState<Record<AccordionPlatform, boolean>>({
    macos: false,
    windows: false,
    linux: false,
  });

  const recommendedByPlatform: Record<AccordionPlatform, string[]> = {
    macos: [
      t("hotkeyGuidance.recommended.macos.0"),
      t("hotkeyGuidance.recommended.macos.1"),
      t("hotkeyGuidance.recommended.macos.2"),
      t("hotkeyGuidance.recommended.macos.3"),
      t("hotkeyGuidance.recommended.macos.4"),
    ],
    windows: [
      t("hotkeyGuidance.recommended.windows.0"),
      t("hotkeyGuidance.recommended.windows.1"),
      t("hotkeyGuidance.recommended.windows.2"),
      t("hotkeyGuidance.recommended.windows.3"),
    ],
    linux: [
      t("hotkeyGuidance.recommended.linux.0"),
      t("hotkeyGuidance.recommended.linux.1"),
      t("hotkeyGuidance.recommended.linux.2"),
      t("hotkeyGuidance.recommended.linux.3"),
      t("hotkeyGuidance.recommended.linux.4"),
    ],
  };

  const validationRules = [
    t("hotkeyGuidance.validationRules.0"),
    t("hotkeyGuidance.validationRules.1"),
    t("hotkeyGuidance.validationRules.2"),
    t("hotkeyGuidance.validationRules.3"),
  ];

  const platformLabels: Record<AccordionPlatform, string> = {
    macos: t("hotkeyGuidance.platforms.macos"),
    windows: t("hotkeyGuidance.platforms.windows"),
    linux: t("hotkeyGuidance.platforms.linux"),
  };

  const renderReserved = (platformKey: AccordionPlatform) => {
    const platform = PLATFORM_MAP[platformKey];
    const reserved = getReservedShortcuts(platform);
    const formatted = reserved.map((shortcut) => formatHotkeyLabelForPlatform(shortcut, platform));
    const unique = Array.from(new Set(formatted));
    const displayCount = 8;
    const visible = showAll[platformKey] ? unique : unique.slice(0, displayCount);
    const hasMore = unique.length > displayCount;

    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{t("hotkeyGuidance.blockedDescription")}</p>
        <ul className="flex flex-wrap gap-1">
          {visible.map((shortcut) => (
            <li key={`${platformKey}-${shortcut}`}>
              {/* Chrome comes from the global keycap rule in index.css: this
                  app is driven by a hotkey, so a key is a real object here. */}
              <kbd>{shortcut}</kbd>
            </li>
          ))}
        </ul>
        {hasMore && (
          <button
            type="button"
            onClick={() =>
              setShowAll((prev) => ({
                ...prev,
                [platformKey]: !prev[platformKey],
              }))
            }
            className="focus-ring-tight cursor-pointer rounded-control text-xs text-primary hover:text-primary-hover"
          >
            {showAll[platformKey] ? t("hotkeyGuidance.showFewer") : t("hotkeyGuidance.showAll")}
          </button>
        )}
      </div>
    );
  };

  const renderSection = (platformKey: AccordionPlatform) => {
    const platform = PLATFORM_MAP[platformKey];
    const recommended = recommendedByPlatform[platformKey];
    const examples = getValidExamples(platform);
    const formattedExamples = examples.map((example) =>
      formatHotkeyLabelForPlatform(example, platform)
    );

    return (
      <AccordionItem value={platformKey}>
        <AccordionTrigger>{platformLabels[platformKey]}</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div>
              <h4 className="micro-caps mb-1.5 text-muted-foreground">
                {t("hotkeyGuidance.recommendedTitle")}
              </h4>
              <ul className="space-y-0.5 text-[13px] text-muted-foreground">
                {recommended.map((pattern) => (
                  <li key={`${platformKey}-${pattern}`}>{pattern}</li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="micro-caps mb-1.5 text-muted-foreground">
                {t("hotkeyGuidance.rulesTitle")}
              </h4>
              <ul className="space-y-0.5 text-[13px] text-muted-foreground">
                {validationRules.map((rule) => (
                  <li key={`${platformKey}-${rule}`}>{rule}</li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="micro-caps mb-1.5 text-muted-foreground">
                {t("hotkeyGuidance.blockedTitle")}
              </h4>
              {renderReserved(platformKey)}
            </div>

            <div>
              <h4 className="micro-caps mb-1.5 text-muted-foreground">
                {t("hotkeyGuidance.examplesTitle")}
              </h4>
              <ul className="flex flex-wrap gap-1">
                {formattedExamples.map((example) => (
                  <li key={`${platformKey}-${example}`}>
                    <kbd>{example}</kbd>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  };

  return (
    <div
      className={`rounded-surface border border-border-subtle bg-surface-1 shadow-(--shadow-panel) ${className}`}
    >
      {/* Rule 4: the panel header is divided by a full-bleed seam, not by a
          margin, so the disclosure list below reads as part of one plate. */}
      <div className="border-b border-border-subtle px-3.5 py-2.5">
        <h3 className="text-[13px] font-semibold leading-tight text-foreground">
          {t("hotkeyGuidance.title")}
        </h3>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
          {t("hotkeyGuidance.description")}
        </p>
      </div>
      <div className="px-3.5 py-1">
        <Accordion type="single" collapsible defaultValue={defaultValue}>
          {renderSection("macos")}
          {renderSection("windows")}
          {renderSection("linux")}
        </Accordion>
      </div>
    </div>
  );
}

export default HotkeyGuidanceAccordion;
