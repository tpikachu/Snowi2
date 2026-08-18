import { useTranslation } from "react-i18next";
import { Textarea } from "../ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { HotkeyInput } from "../ui/HotkeyInput";
import { ActivationModeSelector } from "../ui/ActivationModeSelector";
import StepShell, { StepSection } from "./StepShell";
import { getCachedPlatform } from "../../utils/platform";
import type { HyprlandConfigStatus } from "../../hooks/useHotkeyModeInfo";

interface ActivationStepProps {
  eyebrow?: string;
  hotkey: string;
  readableHotkey: string;
  onHotkeyChange: (hotkey: string) => void | Promise<void>;
  isRegistering: boolean;
  validateHotkey: (hotkey: string) => string | null;
  activationMode: "tap" | "push";
  onActivationModeChange: (mode: "tap" | "push") => void;
  isUsingNativeShortcut: boolean;
  isUsingHyprland: boolean;
  hyprlandConfigStatus: HyprlandConfigStatus | null;
}

export default function ActivationStep({
  eyebrow,
  hotkey,
  readableHotkey,
  onHotkeyChange,
  isRegistering,
  validateHotkey,
  activationMode,
  onActivationModeChange,
  isUsingNativeShortcut,
  isUsingHyprland,
  hyprlandConfigStatus,
}: ActivationStepProps) {
  const { t } = useTranslation();
  const platform = getCachedPlatform();
  const showModeSelector = !isUsingNativeShortcut || platform === "linux";
  const isTapHint = activationMode === "tap" || (isUsingNativeShortcut && platform !== "linux");

  return (
    <StepShell
      eyebrow={eyebrow}
      title={t("onboarding.activation.title")}
      description={t("onboarding.activation.description")}
    >
      {isUsingHyprland && hyprlandConfigStatus && !hyprlandConfigStatus.canWrite && (
        <Alert>
          <AlertTitle>
            {t("settingsPage.general.hotkey.hyprlandConfigWriteWarningTitle")}
          </AlertTitle>
          <AlertDescription>
            {t("settingsPage.general.hotkey.hyprlandConfigWriteWarningDescription", {
              path: hyprlandConfigStatus.path,
            })}
          </AlertDescription>
        </Alert>
      )}

      <StepSection
        className="accent-bar"
        label={t("onboarding.activation.hotkey")}
        hint={
          isUsingHyprland ? t("settingsPage.general.hotkey.hyprlandUnbindDescription") : undefined
        }
        bodyClassName="bg-surface-0 p-5"
      >
        <HotkeyInput
          value={hotkey}
          onChange={onHotkeyChange}
          disabled={isRegistering}
          variant="hero"
          validate={validateHotkey}
        />
      </StepSection>

      {showModeSelector && (
        <StepSection bodyClassName="flex items-center justify-between gap-4 p-4">
          <div className="min-w-0">
            <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("onboarding.activation.mode")}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground/70">
              {activationMode === "tap"
                ? t("onboarding.activation.tapDescription")
                : t("onboarding.activation.holdDescription")}
            </p>
          </div>
          <ActivationModeSelector value={activationMode} onChange={onActivationModeChange} />
        </StepSection>
      )}

      <StepSection
        label={t("onboarding.activation.test")}
        hint={
          isTapHint
            ? t("onboarding.activation.hotkeyToStartStop", { hotkey: readableHotkey })
            : t("onboarding.activation.holdHotkey", { hotkey: readableHotkey })
        }
      >
        <Textarea
          rows={3}
          placeholder={t("onboarding.activation.textareaPlaceholder")}
          className="resize-none text-sm"
        />
      </StepSection>
    </StepShell>
  );
}
