import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./button";
import { AlertCircle } from "lucide-react";
import { cn } from "../lib/utils";

interface MicPermissionWarningProps {
  error: string | null;
  onOpenSoundSettings: () => void;
  onOpenPrivacySettings: () => void;
}

type Platform = "darwin" | "win32" | "linux";

const getPlatform = (): Platform => {
  if (typeof window !== "undefined" && window.electronAPI?.getPlatform) {
    const p = window.electronAPI.getPlatform();
    if (p === "darwin" || p === "win32" || p === "linux") return p;
  }
  // Fallback to user agent
  if (typeof navigator !== "undefined") {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac")) return "darwin";
    if (ua.includes("linux")) return "linux";
  }
  return "win32";
};

export default function MicPermissionWarning({
  error,
  onOpenSoundSettings,
  onOpenPrivacySettings,
}: MicPermissionWarningProps) {
  const { t } = useTranslation();
  const config = useMemo(() => {
    const platformConfig: Record<
      Platform,
      { message: string; soundLabel: string; privacyLabel: string; showPrivacyButton: boolean }
    > = {
      darwin: {
        message: t("hooks.permissions.warning.messages.macos"),
        soundLabel: t("hooks.permissions.warning.soundLabel"),
        privacyLabel: t("hooks.permissions.warning.privacyLabel"),
        showPrivacyButton: true,
      },
      win32: {
        message: t("hooks.permissions.warning.messages.windows"),
        soundLabel: t("hooks.permissions.warning.soundLabel"),
        privacyLabel: t("hooks.permissions.warning.privacyLabel"),
        showPrivacyButton: true,
      },
      linux: {
        message: t("hooks.permissions.warning.messages.linux"),
        soundLabel: t("hooks.permissions.warning.soundLabel"),
        privacyLabel: "",
        showPrivacyButton: false,
      },
    };
    return platformConfig[getPlatform()];
  }, [t]);

  return (
    // Same construction as `alert.tsx`: neutral plate, severity carried by the
    // Rule 3 rail and the glyph, so the message itself stays at full contrast
    // (foreground on surface-1 = 16.27:1 dark, 17.13:1 light).
    <div
      className={cn(
        "relative rounded-surface border border-border-subtle bg-surface-1 p-2",
        "shadow-[var(--shadow-panel),inset_2px_0_0_var(--color-warning)]"
      )}
    >
      <div className="flex items-center gap-2 pl-1.5">
        <AlertCircle className="size-3.5 shrink-0 text-warning" strokeWidth={1.75} />
        <p className="flex-1 text-xs leading-snug text-foreground">{error || config.message}</p>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onOpenSoundSettings} className="px-2">
            {config.soundLabel}
          </Button>
          {config.showPrivacyButton && (
            <Button variant="ghost" size="sm" onClick={onOpenPrivacySettings} className="px-2">
              {config.privacyLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
