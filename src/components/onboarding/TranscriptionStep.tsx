import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import TranscriptionModelPicker from "../TranscriptionModelPicker";
import TranscriptionAutoSetup from "../TranscriptionAutoSetup";
import LanguageSelector from "../ui/LanguageSelector";
import StepShell, { StepSection } from "./StepShell";
import { useSettingsStore } from "../../stores/settingsStore";

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

  // Automatic by default. Someone arriving here for the first time has no way
  // to rank four 630 MB ASR models against their own hardware, and the manual
  // picker asked them to do exactly that before they had heard the app speak
  // once. Advanced stays one click away and unchanged.
  const [advanced, setAdvanced] = useState(false);

  const updateTranscriptionSettings = useSettingsStore((s) => s.updateTranscriptionSettings);
  const setMeetingTranscriptionMode = useSettingsStore((s) => s.setMeetingTranscriptionMode);
  const setMeetingUseLocalWhisper = useSettingsStore((s) => s.setMeetingUseLocalWhisper);
  const setMeetingLocalTranscriptionProvider = useSettingsStore(
    (s) => s.setMeetingLocalTranscriptionProvider
  );
  const setMeetingParakeetModel = useSettingsStore((s) => s.setMeetingParakeetModel);
  const setMeetingWhisperModel = useSettingsStore((s) => s.setMeetingWhisperModel);

  const applyRecommendation = useCallback(
    ({ provider, modelId }: { provider: "whisper" | "nvidia"; modelId: string }) => {
      // One atomic write rather than the provider-then-model prop callbacks the
      // manual picker uses. Those decide which field to write from the provider
      // captured at render time, so setting both in a single tick would file a
      // Parakeet model name under `whisperModel`. The picker gets away with it
      // because switching engine tabs is a separate click; this is not.
      updateTranscriptionSettings({
        useLocalWhisper: true,
        localTranscriptionProvider: provider,
        ...(provider === "nvidia" ? { parakeetModel: modelId } : { whisperModel: modelId }),
      });

      // Meetings resolve transcription from their own scope, and
      // `localTranscriptionProvider` is the one field in it with no fallback to
      // the general setting (see selectResolvedMeetingTranscription). Writing
      // only the general scope would download the streaming model and then have
      // every meeting reach for Whisper anyway.
      setMeetingTranscriptionMode("local");
      setMeetingUseLocalWhisper(true);
      setMeetingLocalTranscriptionProvider(provider);
      if (provider === "nvidia") setMeetingParakeetModel(modelId);
      else setMeetingWhisperModel(modelId);
    },
    [
      updateTranscriptionSettings,
      setMeetingTranscriptionMode,
      setMeetingUseLocalWhisper,
      setMeetingLocalTranscriptionProvider,
      setMeetingParakeetModel,
      setMeetingWhisperModel,
    ]
  );

  const languageFamily = preferredLanguage === "en" ? "en" : "multilingual";

  return (
    <StepShell
      eyebrow={eyebrow}
      title={t("onboarding.transcription.title")}
      description={t(
        advanced
          ? "onboarding.transcription.description"
          : "onboarding.transcription.automaticDescription"
      )}
    >
      {advanced ? (
        <>
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
          <button
            type="button"
            onClick={() => setAdvanced(false)}
            className="text-[11px] text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("transcriptionSetup.switchToBasic")}
          </button>
        </>
      ) : (
        <TranscriptionAutoSetup
          language={languageFamily}
          onApply={applyRecommendation}
          onSwitchToAdvanced={() => setAdvanced(true)}
        />
      )}

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
