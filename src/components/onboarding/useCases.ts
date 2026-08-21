import {
  Bot,
  FileAudio,
  GraduationCap,
  Handshake,
  Languages,
  LucideIcon,
  Microscope,
  PenLine,
  Stethoscope,
  UserSearch,
  Users,
} from "lucide-react";
import { DICTATION_ENABLED } from "../../config/features";

export const USE_CASE_IDS = {
  dictation: "dictation",
  team: "team",
  clients: "clients",
  interviews: "interviews",
  research: "research",
  healthcare: "healthcare",
  education: "education",
  translation: "translation",
  ai: "ai",
  upload: "upload",
} as const;

export type UseCaseId = (typeof USE_CASE_IDS)[keyof typeof USE_CASE_IDS];

export interface UseCaseOption {
  id: UseCaseId;
  icon: LucideIcon;
}

/**
 * The kinds of meeting people bring here.
 *
 * These used to be a list of app features — "meeting notes", "talking to my
 * AI", "uploading audio files" — which asked the wrong question twice over.
 * With dictation hidden, "meeting notes" was the whole product rather than a
 * choice, and the other two named surfaces rather than reasons anyone opens a
 * meeting copilot.
 *
 * Each option now describes a kind of conversation, because that is the thing
 * that genuinely differs between users and the thing worth acting on: a sales
 * call wants commitments and next steps, a research interview wants quotes,
 * a clinical consultation wants a note that can be filed. Answering also costs
 * nothing to get wrong — the selection tunes defaults, it never gates a
 * feature.
 */
const ALL_USE_CASE_OPTIONS: UseCaseOption[] = [
  { id: USE_CASE_IDS.team, icon: Users },
  { id: USE_CASE_IDS.clients, icon: Handshake },
  { id: USE_CASE_IDS.interviews, icon: UserSearch },
  { id: USE_CASE_IDS.research, icon: Microscope },
  { id: USE_CASE_IDS.healthcare, icon: Stethoscope },
  { id: USE_CASE_IDS.education, icon: GraduationCap },
  { id: USE_CASE_IDS.dictation, icon: PenLine },
  { id: USE_CASE_IDS.translation, icon: Languages },
  { id: USE_CASE_IDS.ai, icon: Bot },
  { id: USE_CASE_IDS.upload, icon: FileAudio },
];

/**
 * Dictation and translation are both the dictation flow (translation is
 * `dictationTranslation`, hidden with the rest of it in DICTATION_SETTINGS_IDS).
 * Offering them during onboarding promises a feature the build does not ship.
 *
 * `ai` and `upload` join them: both are features rather than reasons, and both
 * read as filler beside six kinds of meeting. Kept in `USE_CASE_IDS` because
 * installs that ran the old onboarding still have them stored.
 */
const HIDDEN_USE_CASES = new Set<UseCaseId>([USE_CASE_IDS.ai, USE_CASE_IDS.upload]);
const DICTATION_USE_CASES = new Set<UseCaseId>([USE_CASE_IDS.dictation, USE_CASE_IDS.translation]);

export const USE_CASE_OPTIONS: UseCaseOption[] = ALL_USE_CASE_OPTIONS.filter(
  (option) =>
    !HIDDEN_USE_CASES.has(option.id) && (DICTATION_ENABLED || !DICTATION_USE_CASES.has(option.id))
);
