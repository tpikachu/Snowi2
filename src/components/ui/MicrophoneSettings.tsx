import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Toggle } from "./toggle";
import { SettingsRow } from "./SettingsSection";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { Button } from "./button";
import { RefreshCw } from "lucide-react";
import { isBuiltInMicrophone } from "../../utils/audioDeviceUtils";
import { resolveMicDeviceSelection } from "../../helpers/micDeviceSelection";
import { MIC_WARM_HOLD_CHOICES } from "../../stores/settingsStore";

interface AudioDevice {
  deviceId: string;
  label: string;
  isBuiltIn: boolean;
}

interface MicrophoneSettingsProps {
  preferBuiltInMic: boolean;
  selectedMicDeviceId: string;
  selectedMicDeviceLabel: string;
  micWarmHoldSeconds: number;
  onPreferBuiltInChange: (value: boolean) => void;
  onDeviceSelect: (deviceId: string, label: string) => void;
  onMicWarmHoldSecondsChange: (seconds: number) => void;
}

export const MicrophoneSettings: React.FC<MicrophoneSettingsProps> = ({
  preferBuiltInMic,
  selectedMicDeviceId,
  selectedMicDeviceLabel,
  micWarmHoldSeconds,
  onPreferBuiltInChange,
  onDeviceSelect,
  onMicWarmHoldSecondsChange,
}) => {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use refs to access current values without triggering re-renders
  const selectedDeviceRef = useRef(selectedMicDeviceId);
  const selectedDeviceLabelRef = useRef(selectedMicDeviceLabel);
  const onDeviceSelectRef = useRef(onDeviceSelect);

  // Keep refs in sync
  useEffect(() => {
    selectedDeviceRef.current = selectedMicDeviceId;
    selectedDeviceLabelRef.current = selectedMicDeviceLabel;
    onDeviceSelectRef.current = onDeviceSelect;
  }, [preferBuiltInMic, selectedMicDeviceId, selectedMicDeviceLabel, onDeviceSelect]);

  const loadDevices = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Acquiring the mic just to read labels interrupts other audio (pauses
      // music on macOS), so only do it when labels are missing (no permission yet).
      let allDevices = await navigator.mediaDevices.enumerateDevices();
      const hasLabels = allDevices.some((d) => d.kind === "audioinput" && d.label);
      if (!hasLabels) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        allDevices = await navigator.mediaDevices.enumerateDevices();
      }

      const audioInputs = allDevices
        .filter((d) => d.kind === "audioinput")
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
          isBuiltIn: isBuiltInMicrophone(d.label),
        }));

      setDevices(audioInputs);

      const resolvedSelection = resolveMicDeviceSelection(
        audioInputs,
        selectedDeviceRef.current,
        selectedDeviceLabelRef.current
      );
      if (
        resolvedSelection.device &&
        (resolvedSelection.status === "remapped" || !selectedDeviceLabelRef.current)
      ) {
        onDeviceSelectRef.current(
          resolvedSelection.device.deviceId,
          resolvedSelection.device.label
        );
      }

      // No auto-select: an empty selection already means "system default", and
      // silently promoting the first enumerated device overwrote that choice on
      // every refresh — so picking System default never stuck.
    } catch {
      setError(t("microphoneSettings.errors.unableToAccess"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadDevices();

    const handleDeviceChange = () => loadDevices();
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [loadDevices]);

  const builtInDevice = devices.find((d) => d.isBuiltIn);
  // What the picker should show: while the built-in preference is on, the app
  // is really using the built-in mic, so the list reflects that rather than a
  // stale saved selection the capture path never consults.
  const effectiveDeviceValue = preferBuiltInMic
    ? (builtInDevice?.deviceId ?? "default")
    : selectedMicDeviceId || "default";

  return (
    <div className="space-y-4">
      <SettingsRow
        label={t("microphoneSettings.preferBuiltIn.label")}
        description={t("microphoneSettings.preferBuiltIn.description")}
      >
        <Toggle checked={preferBuiltInMic} onChange={onPreferBuiltInChange} />
      </SettingsRow>

      {preferBuiltInMic && !builtInDevice && devices.length > 0 && (
        <div className="rounded-surface border border-border-subtle bg-surface-1 p-3 shadow-[var(--shadow-panel),inset_2px_0_0_var(--color-warning)]">
          <p className="text-sm text-warning dark:text-warning">
            {t("microphoneSettings.noBuiltInDetected")}
          </p>
        </div>
      )}

      {/* Always visible. Hiding the list behind the built-in preference meant a
          user running a virtual or loopback input — the whole reason to pick a
          device by hand — saw no device list at all and concluded the app could
          not see their hardware. Choosing one here is the stronger signal, so it
          turns the automatic preference off rather than being ignored by it. */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-foreground">
            {t("microphoneSettings.inputDevice")}
          </label>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadDevices}
            disabled={isLoading}
            className="h-7 w-7 p-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <Select
            value={effectiveDeviceValue}
            onValueChange={(value) => {
              // An explicit pick always wins over the automatic preference.
              if (preferBuiltInMic) onPreferBuiltInChange(false);
              if (value === "default") {
                onDeviceSelect("", "");
                return;
              }
              const device = devices.find((candidate) => candidate.deviceId === value);
              onDeviceSelect(value, device?.label || "");
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("microphoneSettings.selectPlaceholder")}>
                {effectiveDeviceValue === "default"
                  ? t("microphoneSettings.systemDefault")
                  : (devices.find((d) => d.deviceId === effectiveDeviceValue)?.label ??
                    t("microphoneSettings.unknownDevice"))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">{t("microphoneSettings.systemDefault")}</SelectItem>
              {devices.map((device) => (
                <SelectItem key={device.deviceId} value={device.deviceId}>
                  {device.label}
                  {device.isBuiltIn && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t("microphoneSettings.builtIn")}
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <p className="text-xs text-muted-foreground">{t("microphoneSettings.helpText")}</p>
      </div>

      <SettingsRow
        label={t("microphoneSettings.warmHold.label")}
        description={t("microphoneSettings.warmHold.description")}
      >
        <Select
          value={String(micWarmHoldSeconds)}
          onValueChange={(value) => onMicWarmHoldSecondsChange(Number(value))}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {/* Derived from the store's whitelist so a new option can't silently
                snap to 0 in the setter; its label key is the value itself. */}
            {MIC_WARM_HOLD_CHOICES.map((seconds) => (
              <SelectItem key={seconds} value={String(seconds)}>
                {t(`microphoneSettings.warmHold.options.${seconds}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>
      {micWarmHoldSeconds > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("microphoneSettings.warmHold.privacyNote")}
        </p>
      )}
    </div>
  );
};

export default MicrophoneSettings;
