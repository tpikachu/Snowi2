/**
 * Write-up templates: the shape a meeting's notes take.
 *
 * A 1:1, a standup and a sales call produce different artifacts, and one
 * write-up prompt cannot serve all three well. A template is a small prompt
 * addendum that replaces the default section structure — nothing else about
 * the write-up pipeline changes, which is why these are plain data rather
 * than variants of the action system.
 *
 * A meeting note remembers its template (`notes.meeting_template`), and a new
 * occurrence of a recurring meeting inherits the previous occurrence's choice
 * (see meetingDetectionEngine) — pick once for "Acme weekly" and every future
 * one writes up that way.
 *
 * Prompts are English on purpose: system prompts are not translated in this
 * project. Labels are i18n keys, resolved by the picker.
 */

export interface MeetingTemplate {
  id: string;
  /** i18n key for the picker label. */
  labelKey: string;
  /**
   * The prompt addendum. Empty for the default template, which leaves the
   * base meeting prompt's own structure in place.
   */
  prompt: string;
}

export const MEETING_TEMPLATES: readonly MeetingTemplate[] = [
  {
    id: "default",
    labelKey: "notes.templates.default",
    prompt: "",
  },
  {
    id: "one-on-one",
    labelKey: "notes.templates.oneOnOne",
    prompt:
      "This is a recurring one-on-one. Structure the notes as: " +
      "## Topics Discussed, ## Decisions Made, ## Action Items, " +
      "## For Next Time (things either side said they would pick up again). " +
      "Track commitments in both directions — what You owe Them and what Them owes You. " +
      "If the conversation carried signals about workload, morale or growth, note them " +
      "briefly under ## How It's Going; omit the section entirely otherwise.",
  },
  {
    id: "standup",
    labelKey: "notes.templates.standup",
    prompt:
      "This is a team standup. Keep it terse — a standup write-up longer than the standup " +
      "has failed. Structure the notes as: ## Progress, ## Blockers (most prominent " +
      "section; name an owner for each), ## Next Steps. Skip pleasantries entirely.",
  },
  {
    id: "sales",
    labelKey: "notes.templates.sales",
    prompt:
      "This is a sales or client call. Structure the notes as: ## Summary, " +
      "## Their Needs & Pain Points, ## Objections & Concerns (verbatim where the wording " +
      "matters), ## Pricing & Terms Discussed, ## Action Items, ## Next Steps (who moves " +
      "next, and by when). Numbers, dates and named decision-makers are the substance — " +
      "never round or drop them.",
  },
  {
    id: "interview",
    labelKey: "notes.templates.interview",
    prompt:
      "This is an interview. Structure the notes as: ## Summary, ## Background & Experience, " +
      "## Strengths, ## Concerns, ## Notable Answers (short verbatim quotes), ## Follow-ups. " +
      "Do not score the candidate or recommend a decision unless the transcript itself " +
      "contains one.",
  },
  {
    id: "planning",
    labelKey: "notes.templates.planning",
    prompt:
      "This is a planning or working session. Structure the notes as: ## Goals, " +
      "## Options Considered (with the trade-offs actually discussed), ## Decisions Made, " +
      "## Open Questions, ## Action Items. A decision without its rejected alternatives " +
      "loses the reasoning — keep both.",
  },
];

const BY_ID = new Map(MEETING_TEMPLATES.map((template) => [template.id, template]));

/** Unknown or missing ids resolve to the default — old notes never break. */
export function meetingTemplateById(id: string | null | undefined): MeetingTemplate {
  return (id && BY_ID.get(id)) || MEETING_TEMPLATES[0];
}

/** The addendum for a note's stored template id; "" means default shape. */
export function templatePromptFor(id: string | null | undefined): string {
  return meetingTemplateById(id).prompt;
}
