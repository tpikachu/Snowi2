import { Bot, FileAudio, Languages, LucideIcon, PenLine, Stethoscope, Users } from "lucide-react";
import { DICTATION_ENABLED } from "../../config/features";

export const USE_CASE_IDS = {
  dictation: "dictation",
  meetings: "meetings",
  healthcare: "healthcare",
  translation: "translation",
  ai: "ai",
  upload: "upload",
} as const;

export type UseCaseId = (typeof USE_CASE_IDS)[keyof typeof USE_CASE_IDS];

export interface UseCaseOption {
  id: UseCaseId;
  icon: LucideIcon;
}

const ALL_USE_CASE_OPTIONS: UseCaseOption[] = [
  { id: USE_CASE_IDS.dictation, icon: PenLine },
  { id: USE_CASE_IDS.meetings, icon: Users },
  { id: USE_CASE_IDS.healthcare, icon: Stethoscope },
  { id: USE_CASE_IDS.translation, icon: Languages },
  { id: USE_CASE_IDS.ai, icon: Bot },
  { id: USE_CASE_IDS.upload, icon: FileAudio },
];

/**
 * Dictation and translation are both the dictation flow (translation is
 * `dictationTranslation`, hidden with the rest of it in DICTATION_SETTINGS_IDS).
 * Offering them during onboarding promises a feature the build does not ship.
 */
const DICTATION_USE_CASES = new Set<UseCaseId>([USE_CASE_IDS.dictation, USE_CASE_IDS.translation]);

export const USE_CASE_OPTIONS: UseCaseOption[] = ALL_USE_CASE_OPTIONS.filter(
  (option) => DICTATION_ENABLED || !DICTATION_USE_CASES.has(option.id)
);
