import { useTranslation } from "react-i18next";
import { Textarea } from "../ui/textarea";
import OptionCard from "../ui/OptionCard";
import StepShell from "./StepShell";
import { USE_CASE_OPTIONS } from "./useCases";

interface UseCaseStepProps {
  eyebrow?: string;
  useCases: string[];
  onUseCasesChange: (useCases: string[]) => void;
  note: string;
  onNoteChange: (note: string) => void;
}

export default function UseCaseStep({
  eyebrow,
  useCases,
  onUseCasesChange,
  note,
  onNoteChange,
}: UseCaseStepProps) {
  const { t } = useTranslation();

  const toggleUseCase = (id: string) => {
    onUseCasesChange(useCases.includes(id) ? useCases.filter((c) => c !== id) : [...useCases, id]);
  };

  return (
    <StepShell
      eyebrow={eyebrow}
      title={t("onboarding.useCase.title")}
      description={t("onboarding.useCase.description")}
    >
      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {t("onboarding.useCase.selectHint")}
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {USE_CASE_OPTIONS.map(({ id, icon }) => (
            <OptionCard
              key={id}
              icon={icon}
              title={t(`onboarding.useCase.options.${id}.title`)}
              description={t(`onboarding.useCase.options.${id}.description`)}
              selected={useCases.includes(id)}
              onSelect={() => toggleUseCase(id)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1.5 pt-1">
        <label
          htmlFor="onboarding-usecase-note"
          className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
        >
          {t("onboarding.useCase.noteLabel")}
        </label>
        <Textarea
          id="onboarding-usecase-note"
          rows={2}
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder={t("onboarding.useCase.notePlaceholder")}
          className="resize-none text-sm"
        />
      </div>
    </StepShell>
  );
}
