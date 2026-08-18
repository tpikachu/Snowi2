import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { Textarea } from "../ui/textarea";
import { HotkeyInput } from "../ui/HotkeyInput";
import StepShell, { StepSection } from "./StepShell";

interface VoiceAgentStepProps {
  eyebrow?: string;
  agentName: string;
  /** Primary voice-agent hotkey; empty string means "not set". */
  hotkey: string;
  readableHotkey: string;
  onHotkeyChange: (hotkey: string) => void;
  onHotkeyClear: () => void;
  validateHotkey: (hotkey: string) => string | null;
}

export default function VoiceAgentStep({
  eyebrow,
  agentName,
  hotkey,
  readableHotkey,
  onHotkeyChange,
  onHotkeyClear,
  validateHotkey,
}: VoiceAgentStepProps) {
  const { t } = useTranslation();
  const examples = t("onboarding.voiceAgent.examples", { returnObjects: true }) as string[];

  return (
    <StepShell
      eyebrow={eyebrow}
      title={t("onboarding.voiceAgent.title")}
      description={t("onboarding.voiceAgent.description")}
    >
      <StepSection
        className="accent-bar"
        label={t("onboarding.voiceAgent.hotkey")}
        bodyClassName="bg-surface-0 p-5"
      >
        <HotkeyInput
          value={hotkey}
          onChange={onHotkeyChange}
          onClear={onHotkeyClear}
          variant="hero"
          validate={validateHotkey}
        />
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-border-subtle bg-surface-2 p-3">
          <Sparkles className="mt-px h-3.5 w-3.5 shrink-0 text-primary" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("onboarding.voiceAgent.howItWorks", { agentName })}
          </p>
        </div>
      </StepSection>

      <StepSection
        label={t("onboarding.voiceAgent.test")}
        hint={
          hotkey
            ? t("onboarding.voiceAgent.testInstruction", { hotkey: readableHotkey })
            : t("onboarding.voiceAgent.testSetHotkey")
        }
      >
        <div className="mb-3 flex flex-wrap gap-1.5">
          {examples.map((example) => (
            <span
              key={example}
              className="rounded-full border border-border-subtle bg-surface-2 px-2.5 py-1 text-xs text-muted-foreground"
            >
              {example}
            </span>
          ))}
        </div>
        <Textarea
          rows={3}
          placeholder={t("onboarding.voiceAgent.testPlaceholder")}
          className="resize-none text-sm"
        />
      </StepSection>

      <p className="text-xs text-muted-foreground/60">{t("onboarding.voiceAgent.optionalNote")}</p>
    </StepShell>
  );
}
