import { useTranslation } from "react-i18next";
import { ArrowLeft, Cloud, Lock, SlidersHorizontal, Sparkles } from "lucide-react";
import TranscriptionModelPicker from "../TranscriptionModelPicker";
import TranscriptionAutoSetup from "../TranscriptionAutoSetup";
import CloudProviderSetup from "./CloudProviderSetup";
import LanguageSelector from "../ui/LanguageSelector";
import OptionCard from "../ui/OptionCard";
import StepShell, { StepSection } from "./StepShell";
import type { OnboardingTranscriptionSetup } from "../../hooks/useOnboardingTranscriptionSetup";

/**
 * Where the user is inside the setup step's own little flow.
 *
 * "fork" is the local-or-cloud question, "localChoice" the pick-for-me-or-not
 * question, and the rest are the detail screens those answers land on. Owned
 * by OnboardingFlow rather than this component so Back/Next navigation does
 * not reset a choice mid-download.
 */
export type TranscriptionSetupStage =
  "fork" | "localChoice" | "auto" | "manual" | "cloud" | "advanced";

interface TranscriptionStepProps {
  eyebrow?: string;
  setup: OnboardingTranscriptionSetup;
  stage: TranscriptionSetupStage;
  onStageChange: (stage: TranscriptionSetupStage) => void;
  useCases: string[];
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
  setup,
  stage,
  onStageChange,
  useCases,
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

  const questionLabel =
    stage === "fork"
      ? t("onboarding.transcription.path.question")
      : stage === "localChoice"
        ? t("onboarding.transcription.localChoice.question")
        : null;

  const renderStage = () => {
    switch (stage) {
      case "fork":
        return (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <OptionCard
              icon={Lock}
              title={t("onboarding.transcription.path.localTitle")}
              description={t("onboarding.transcription.path.localDescription")}
              selected={useLocalWhisper}
              onSelect={() => {
                onModeChange(true);
                onStageChange("localChoice");
              }}
            />
            <OptionCard
              icon={Cloud}
              title={t("onboarding.transcription.path.cloudTitle")}
              description={t("onboarding.transcription.path.cloudDescription")}
              selected={!useLocalWhisper}
              onSelect={() => {
                onModeChange(false);
                onStageChange("cloud");
              }}
            />
          </div>
        );

      case "localChoice":
        return (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <OptionCard
              icon={Sparkles}
              title={t("onboarding.transcription.localChoice.autoTitle")}
              description={t("onboarding.transcription.localChoice.autoDescription")}
              selected={false}
              onSelect={() => onStageChange("auto")}
            />
            <OptionCard
              icon={SlidersHorizontal}
              title={t("onboarding.transcription.localChoice.manualTitle")}
              description={t("onboarding.transcription.localChoice.manualDescription")}
              selected={false}
              onSelect={() => onStageChange("manual")}
            />
          </div>
        );

      case "auto":
        return <TranscriptionAutoSetup setup={setup} autoStart />;

      case "manual":
        return (
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
            mode="local"
          />
        );

      case "cloud":
        return <CloudProviderSetup useCases={useCases} />;

      case "advanced":
        return (
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
        );
    }
  };

  return (
    <StepShell
      eyebrow={eyebrow}
      title={t("onboarding.transcription.title")}
      description={t(
        stage === "auto"
          ? "onboarding.transcription.automaticDescription"
          : "onboarding.transcription.description"
      )}
    >
      {stage !== "fork" && (
        <button
          type="button"
          onClick={() =>
            onStageChange(stage === "auto" || stage === "manual" ? "localChoice" : "fork")
          }
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-ring rounded-control"
        >
          <ArrowLeft className="size-3" strokeWidth={1.75} />
          {t("onboarding.transcription.changeChoice")}
        </button>
      )}

      {questionLabel && (
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {questionLabel}
        </p>
      )}

      {renderStage()}

      {/* The full picker — every provider, every model, the base-URL field —
          for the person who knows exactly what they want. One quiet link so
          the wizard never reads as a locked door. */}
      {stage !== "advanced" && stage !== "manual" && (
        <button
          type="button"
          onClick={() => onStageChange("advanced")}
          className="block text-left text-[11px] text-muted-foreground underline decoration-border hover:text-foreground focus-ring rounded-control"
        >
          {t("onboarding.transcription.advancedLink")}
        </button>
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
