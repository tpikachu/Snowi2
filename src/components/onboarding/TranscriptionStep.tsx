import { useTranslation } from "react-i18next";
import TranscriptionModelPicker from "../TranscriptionModelPicker";
import LanguageSelector from "../ui/LanguageSelector";
import StepShell, { StepSection } from "./StepShell";

interface TranscriptionStepProps {
  eyebrow?: string;
  cloudTranscriptionProvider: string;
  onCloudProviderSelect: (provider: string) => void;
  cloudTranscriptionModel: string;
  onCloudModelSelect: (model: string) => void;
  selectedLocalModel: string;
  onLocalModelSelect: (modelId: string) => void;
  localTranscriptionProvider: string;
  onLocalProviderSelect: (provider: string) => void;
  useLocalWhisper: boolean;
  onModeChange: (isLocal: boolean) => void;
  cloudTranscriptionBaseUrl: string;
  setCloudTranscriptionBaseUrl: (url: string) => void;
  preferredLanguage: string;
  onPreferredLanguageChange: (language: string) => void;
}

export default function TranscriptionStep({
  eyebrow,
  cloudTranscriptionProvider,
  onCloudProviderSelect,
  cloudTranscriptionModel,
  onCloudModelSelect,
  selectedLocalModel,
  onLocalModelSelect,
  localTranscriptionProvider,
  onLocalProviderSelect,
  useLocalWhisper,
  onModeChange,
  cloudTranscriptionBaseUrl,
  setCloudTranscriptionBaseUrl,
  preferredLanguage,
  onPreferredLanguageChange,
}: TranscriptionStepProps) {
  const { t } = useTranslation();

  return (
    <StepShell
      eyebrow={eyebrow}
      title={t("onboarding.transcription.title")}
      description={t("onboarding.transcription.description")}
    >
      <TranscriptionModelPicker
        selectedCloudProvider={cloudTranscriptionProvider}
        onCloudProviderSelect={onCloudProviderSelect}
        selectedCloudModel={cloudTranscriptionModel}
        onCloudModelSelect={onCloudModelSelect}
        selectedLocalModel={selectedLocalModel}
        onLocalModelSelect={onLocalModelSelect}
        selectedLocalProvider={localTranscriptionProvider}
        onLocalProviderSelect={onLocalProviderSelect}
        useLocalWhisper={useLocalWhisper}
        onModeChange={onModeChange}
        cloudTranscriptionBaseUrl={cloudTranscriptionBaseUrl}
        setCloudTranscriptionBaseUrl={setCloudTranscriptionBaseUrl}
        variant="onboarding"
      />

      <StepSection label={t("onboarding.transcription.preferredLanguage")}>
        <LanguageSelector
          value={preferredLanguage}
          onChange={onPreferredLanguageChange}
          className="w-full"
        />
      </StepSection>
    </StepShell>
  );
}
