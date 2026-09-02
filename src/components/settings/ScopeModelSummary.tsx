import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import ModelPickerChip from "../ModelPickerChip";
import { SettingsPanel, SettingsPanelRow, SettingsRow } from "../ui/SettingsSection";
import { cn } from "../lib/utils";
import type { InferenceScope } from "../../config/inferenceScopes";

/**
 * What replaced the full model editor in Settings: the scope's current model
 * as the same picker chip every surface uses, and the old editor folded
 * behind "Advanced setup". Models are chosen where they are used (chat, cue
 * card, actions) — Settings only needs to show the state and keep the escape
 * hatch for local servers, LAN endpoints, custom APIs, and enterprise
 * routing, none of which fit in a chip.
 */
export default function ScopeModelSummary({
  scope,
  children,
}: {
  scope: InferenceScope;
  /** The scope's InferenceConfigEditor, rendered only when Advanced is open. */
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <>
      <SettingsPanel>
        <SettingsPanelRow>
          <SettingsRow
            label={t("settingsPage.llms.currentModel")}
            description={t("settingsPage.llms.currentModelHint")}
          >
            <ModelPickerChip scope={scope} />
          </SettingsRow>
        </SettingsPanelRow>
      </SettingsPanel>

      <button
        type="button"
        onClick={() => setAdvancedOpen((open) => !open)}
        aria-expanded={advancedOpen}
        className={cn(
          "flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground",
          "transition-colors duration-150 hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        )}
      >
        <ChevronDown
          size={12}
          className={cn("transition-transform duration-200", advancedOpen && "rotate-180")}
        />
        {t("settingsPage.llms.advancedSetup")}
      </button>
      {advancedOpen && children}
    </>
  );
}
