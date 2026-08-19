import ConfigureSettingsAction from "./ConfigureSettingsAction";
import type { SettingsRemedy } from "../../config/settingsRemedies";

/**
 * Toast options for an error the user can only fix in Settings. Longer-lived
 * than a plain error, because acting on it means reading it and clicking
 * something.
 *
 * Its own file so ConfigureSettingsAction.tsx exports only a component, which
 * is what keeps fast refresh working there.
 */
export function configureToastProps(remedy: SettingsRemedy | null, dismiss: () => void) {
  if (!remedy) return {};
  return {
    duration: 12000,
    action: <ConfigureSettingsAction remedy={remedy} onNavigate={dismiss} />,
  };
}
