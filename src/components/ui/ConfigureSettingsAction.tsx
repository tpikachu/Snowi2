import { useTranslation } from "react-i18next";
import { Button } from "./button";
import { requestSettings } from "../../stores/settingsNavigationStore";
import { remedyTarget, type SettingsRemedy } from "../../config/settingsRemedies";

/**
 * The "Configure" button an unconfigured-feature toast carries.
 *
 * An unconfigured model or endpoint is not a failure the user can retry out of,
 * so the error carries the trip to the setting that fixes it. Naming the page
 * in the message and leaving them to find it is the thing this replaces.
 */
export default function ConfigureSettingsAction({
  remedy,
  onNavigate,
}: {
  remedy: SettingsRemedy;
  /** Dismisses the toast, so Settings does not open behind it. */
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        onNavigate?.();
        requestSettings(remedyTarget(remedy));
      }}
      className="h-6 px-2 text-xs text-white/80 hover:bg-white/10 hover:text-white"
    >
      {t("notes.actions.errors.configure")}
    </Button>
  );
}
