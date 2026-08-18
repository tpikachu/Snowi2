import { useTranslation } from "react-i18next";
import PermissionsSection from "../ui/PermissionsSection";
import StepShell from "./StepShell";
import type { UsePermissionsReturn } from "../../hooks/usePermissions";
import type { SystemAudioAccessResult } from "../../types/electron";

interface PermissionsStepProps {
  eyebrow?: string;
  permissions: UsePermissionsReturn;
  systemAudio: Pick<SystemAudioAccessResult, "granted" | "mode" | "supportsOnboardingGrant"> & {
    request: () => Promise<boolean>;
  };
  systemAudioRecommended: boolean;
}

export default function PermissionsStep({
  eyebrow,
  permissions,
  systemAudio,
  systemAudioRecommended,
}: PermissionsStepProps) {
  const { t } = useTranslation();
  const isMacOS = permissions.pasteToolsInfo?.platform === "darwin";

  return (
    <StepShell
      eyebrow={eyebrow}
      title={t("onboarding.permissions.title")}
      description={
        isMacOS
          ? t("onboarding.permissions.requiredForApp")
          : t("onboarding.permissions.microphoneRequired")
      }
    >
      <PermissionsSection
        permissions={permissions}
        systemAudio={systemAudio}
        systemAudioRecommended={systemAudioRecommended}
      />
    </StepShell>
  );
}
