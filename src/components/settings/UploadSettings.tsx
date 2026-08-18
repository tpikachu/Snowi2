import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Key, Cpu, Network } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { InferenceModeSelector } from "../ui/SettingsSection";
import type { InferenceModeOption } from "../ui/SettingsSection";
import TranscriptionModelPicker from "../TranscriptionModelPicker";
import SelfHostedPanel from "../SelfHostedPanel";
import type { InferenceMode } from "../../types/electron";

export function UploadTranscriptionPanel() {
  const { t } = useTranslation();

  const {
    uploadTranscriptionMode,
    setUploadTranscriptionMode,
    setUploadUseLocalWhisper,
    uploadWhisperModel,
    setUploadWhisperModel,
    uploadLocalTranscriptionProvider,
    setUploadLocalTranscriptionProvider,
    uploadParakeetModel,
    setUploadParakeetModel,
    uploadCloudTranscriptionProvider,
    setUploadCloudTranscriptionProvider,
    uploadCloudTranscriptionModel,
    setUploadCloudTranscriptionModel,
    uploadCloudTranscriptionBaseUrl,
    setUploadCloudTranscriptionBaseUrl,
    setUploadCloudTranscriptionMode,
    remoteTranscriptionUrl,
    setRemoteTranscriptionUrl,
    remoteTranscriptionModel,
    setRemoteTranscriptionModel,
  } = useSettingsStore();
  const transcriptionModes: InferenceModeOption[] = [
    {
      id: "providers",
      label: t("settingsPage.transcription.modes.providers"),
      description: t("settingsPage.transcription.modes.providersDesc"),
      icon: <Key className="w-4 h-4" />,
    },
    {
      id: "local",
      label: t("settingsPage.transcription.modes.local"),
      description: t("settingsPage.transcription.modes.localDesc"),
      icon: <Cpu className="w-4 h-4" />,
    },
    {
      id: "self-hosted",
      label: t("settingsPage.transcription.modes.selfHosted"),
      description: t("settingsPage.transcription.modes.selfHostedDesc"),
      icon: <Network className="w-4 h-4" />,
    },
  ];
  const handleTranscriptionModeSelect = (mode: InferenceMode) => {
    if (mode === uploadTranscriptionMode) return;
    setUploadTranscriptionMode(mode);
    setUploadUseLocalWhisper(mode === "local");
    setUploadCloudTranscriptionMode("byok");
  };

  const handleLocalTranscriptionModelSelect = useCallback(
    (modelId: string) => {
      if (uploadLocalTranscriptionProvider === "nvidia") {
        setUploadParakeetModel(modelId);
      } else {
        setUploadWhisperModel(modelId);
      }
    },
    [uploadLocalTranscriptionProvider, setUploadParakeetModel, setUploadWhisperModel]
  );

  const renderTranscriptionPicker = (mode: "cloud" | "local") => (
    <TranscriptionModelPicker
      transcriptionContext="upload"
      selectedCloudProvider={uploadCloudTranscriptionProvider}
      onCloudProviderSelect={setUploadCloudTranscriptionProvider}
      selectedCloudModel={uploadCloudTranscriptionModel}
      onCloudModelSelect={setUploadCloudTranscriptionModel}
      selectedLocalModel={
        uploadLocalTranscriptionProvider === "nvidia" ? uploadParakeetModel : uploadWhisperModel
      }
      onLocalModelSelect={handleLocalTranscriptionModelSelect}
      selectedLocalProvider={uploadLocalTranscriptionProvider}
      onLocalProviderSelect={setUploadLocalTranscriptionProvider}
      useLocalWhisper={mode === "local"}
      onModeChange={() => {}}
      mode={mode}
      cloudTranscriptionBaseUrl={uploadCloudTranscriptionBaseUrl}
      setCloudTranscriptionBaseUrl={setUploadCloudTranscriptionBaseUrl}
      variant="settings"
    />
  );

  return (
    <div className="space-y-3">
      <InferenceModeSelector
        modes={transcriptionModes}
        activeMode={uploadTranscriptionMode}
        onSelect={handleTranscriptionModeSelect}
      />

      {uploadTranscriptionMode === "providers" && renderTranscriptionPicker("cloud")}
      {uploadTranscriptionMode === "local" && renderTranscriptionPicker("local")}
      {uploadTranscriptionMode === "self-hosted" && (
        <SelfHostedPanel
          service="transcription"
          url={remoteTranscriptionUrl}
          onUrlChange={setRemoteTranscriptionUrl}
          model={remoteTranscriptionModel}
          onModelChange={setRemoteTranscriptionModel}
        />
      )}
    </div>
  );
}
