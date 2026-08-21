import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import TranscriptionModelPicker from "../TranscriptionModelPicker";
import TranscriptionAutoSetup from "../TranscriptionAutoSetup";
import LanguageSelector from "../ui/LanguageSelector";
import StepShell, { StepSection } from "./StepShell";
import { useSettingsStore } from "../../stores/settingsStore";
import { cn } from "../lib/utils";

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
      {/* A switch that sits above the content and is present in both modes.
          The way back used to be a small text link *below* the manual picker,
          which is a tall control — so on any normal window the only exit was
          off-screen, and Advanced read as a one-way door. */}
      <div
        role="radiogroup"
        aria-label={t("transcriptionSetup.modeLabel")}
        className="inline-flex rounded-control border border-border-subtle bg-surface-2 p-0.5 shadow-(--shadow-control)"
      >
        {[
          { id: "basic", label: t("transcriptionSetup.modeBasic"), value: false },
          { id: "advanced", label: t("transcriptionSetup.modeAdvanced"), value: true },
        ].map((mode) => (
          <button
            key={mode.id}
            type="button"
            role="radio"
            aria-checked={advanced === mode.value}
            onClick={() => setAdvanced(mode.value)}
            className={cn(
              "rounded-control px-3 py-1 text-xs font-medium outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              advanced === mode.value
                ? "bg-surface-1 text-foreground shadow-(--shadow-control)"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {advanced ? (
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
      ) : (
        <TranscriptionAutoSetup language={languageFamily} onApply={applyRecommendation} />
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
