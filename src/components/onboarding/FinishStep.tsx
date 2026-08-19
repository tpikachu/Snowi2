import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Settings, Stethoscope } from "lucide-react";
import { Button } from "../ui/button";
import ApiKeyInput from "../ui/ApiKeyInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { getTranscriptionProviders, modelRegistry } from "../../models/ModelRegistry";
import { useSettingsStore } from "../../stores/settingsStore";
import { buildCortiOnboardingPayloads } from "../../helpers/reasoningRouting";
import StepShell, { StepSection } from "./StepShell";
import { SnowyMark } from "./SnowyMark";
import { USE_CASE_IDS } from "./useCases";

interface FinishStepProps {
  eyebrow?: string;
  useCases: string[];
  /** Readable dictation hotkey, echoed back as the one thing to remember. */
  hotkey?: string;
  onFinish: (openSettings: boolean) => void;
  isFinishing: boolean;
}

export default function FinishStep({
  eyebrow,
  useCases,
  hotkey,
  onFinish,
  isFinishing,
}: FinishStepProps) {
  const { t } = useTranslation();
  const setCloudTranscriptionForAllScopes = useSettingsStore(
    (s) => s.setCloudTranscriptionForAllScopes
  );
  const setCloudReasoningForAllScopes = useSettingsStore((s) => s.setCloudReasoningForAllScopes);
  const cortiClientId = useSettingsStore((s) => s.cortiClientId);
  const setCortiClientId = useSettingsStore((s) => s.setCortiClientId);
  const cortiClientSecret = useSettingsStore((s) => s.cortiClientSecret);
  const setCortiClientSecret = useSettingsStore((s) => s.setCortiClientSecret);
  const cortiApiKey = useSettingsStore((s) => s.cortiApiKey);
  const setCortiApiKey = useSettingsStore((s) => s.setCortiApiKey);
  const cortiEnvironment = useSettingsStore((s) => s.cortiEnvironment);
  const setCortiEnvironment = useSettingsStore((s) => s.setCortiEnvironment);

  // The Corti pitch only renders once the Corti provider ships in the model
  // registry (separate PR) — until then healthcare users see the default finish.
  const cortiProvider = getTranscriptionProviders().find((p) => p.id === "corti");
  const [showCorti, setShowCorti] = useState(
    !!cortiProvider && useCases.includes(USE_CASE_IDS.healthcare)
  );
  const hasCortiCredentials =
    cortiClientId.trim().length > 0 && cortiClientSecret.trim().length > 0;

  const startWithCorti = () => {
    // Transcription always routes to Corti. Reasoning routes to Corti only in the
    // EU with an API key (Corti Models is EU-only); otherwise reasoning keeps its
    // default local routing so PHI never reaches a third party.
    const reasoningProvider = modelRegistry.getCloudProviders().find((p) => p.id === "corti");
    const { transcription, reasoning } = buildCortiOnboardingPayloads(
      cortiProvider,
      reasoningProvider,
      cortiEnvironment,
      cortiApiKey.trim().length > 0
    );
    setCloudTranscriptionForAllScopes(transcription);
    if (reasoning) {
      setCloudReasoningForAllScopes(reasoning);
    } else {
      useSettingsStore.getState().setUseCleanupModel(true);
    }
    onFinish(false);
  };

  if (showCorti) {
    return (
      <StepShell
        eyebrow={eyebrow}
        media={
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border-subtle bg-primary/10 dark:bg-primary/15">
            <Stethoscope className="h-5 w-5 text-primary" />
          </span>
        }
        title={t("onboarding.finish.corti.title")}
        description={t("onboarding.finish.corti.description")}
      >
        <ol className="list-inside list-decimal space-y-1 text-xs text-muted-foreground">
          <li>{t("onboarding.finish.corti.step1")}</li>
          <li>{t("onboarding.finish.corti.step2")}</li>
          <li>{t("onboarding.finish.corti.step3")}</li>
        </ol>

        <StepSection bodyClassName="p-4 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              {t("transcription.corti.clientId")}
            </label>
            <ApiKeyInput apiKey={cortiClientId} setApiKey={setCortiClientId} label="" helpText="" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              {t("transcription.corti.clientSecret")}
            </label>
            <ApiKeyInput
              apiKey={cortiClientSecret}
              setApiKey={setCortiClientSecret}
              label=""
              helpText=""
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              {t("transcription.corti.environment")}
            </label>
            <Select value={cortiEnvironment} onValueChange={setCortiEnvironment}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="us">US</SelectItem>
                <SelectItem value="eu">EU</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground/70">
              {t("onboarding.finish.corti.regionHint")}
            </p>
          </div>
          {/* Corti Models (LLM) is EU-only; US projects used the removed cloud mode for
              language features, so the key is only collected in the EU region. */}
          {cortiEnvironment === "eu" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                {t("transcription.corti.apiKey")}
              </label>
              <ApiKeyInput apiKey={cortiApiKey} setApiKey={setCortiApiKey} label="" helpText="" />
              {cortiApiKey.trim() && (
                <p className="text-xs text-muted-foreground/70">
                  {t("onboarding.finish.corti.llmHint")}
                </p>
              )}
            </div>
          )}
        </StepSection>

        <div className="flex items-center gap-2 pt-1">
          <Button
            onClick={startWithCorti}
            disabled={isFinishing || !hasCortiCredentials}
            className="px-4"
          >
            <Check className="h-3.5 w-3.5" />
            {t("onboarding.finish.corti.useCorti")}
          </Button>
          <Button variant="ghost" onClick={() => setShowCorti(false)} disabled={isFinishing}>
            {t("onboarding.finish.corti.skip")}
          </Button>
        </div>
      </StepShell>
    );
  }

  return (
    <StepShell
      eyebrow={eyebrow}
      media={
        <span className="relative flex h-12 w-12 items-center justify-center">
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-2xl bg-primary/15 blur-md dark:bg-primary/20"
          />
          <SnowyMark className="relative h-11 w-11 rounded-[10px] shadow-(--shadow-elevated)" />
        </span>
      }
      title={t("onboarding.finish.title")}
      description={t("onboarding.finish.localDescription")}
    >
      {hotkey && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-1 px-4 py-3">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("onboarding.activation.hotkey")}
          </span>
          <kbd className="rounded-sm border border-border bg-surface-raised px-2 py-1 text-xs font-semibold text-foreground">
            {hotkey}
          </kbd>
        </div>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("onboarding.finish.cleanupNote")}
      </p>

      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="success"
          onClick={() => onFinish(false)}
          disabled={isFinishing}
          className="px-4"
        >
          <Check className="h-3.5 w-3.5" />
          {t("onboarding.finish.skipForNow")}
        </Button>
        <Button variant="outline" onClick={() => onFinish(true)} disabled={isFinishing}>
          <Settings className="h-3.5 w-3.5" />
          {t("onboarding.finish.openSettings")}
        </Button>
      </div>
    </StepShell>
  );
}
