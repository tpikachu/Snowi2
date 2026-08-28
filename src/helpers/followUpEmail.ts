import reasoningService from "../services/ReasoningService";
import { getSettings, selectResolvedActions } from "../stores/settingsStore";
import { buildActionsOverrides } from "./actionsOverrides";
import { buildMeetingRecap } from "../utils/meetingRecap";

/**
 * Drafting the email that follows a meeting.
 *
 * The write-up already says what happened; the email is the same substance in
 * a different register — addressed to the people who were there, in prose, no
 * markdown headings. It runs on the same resolved "actions" model the write-up
 * used, so having notes at all implies having this.
 */

/** Why a draft could not start; the dialog maps these to friendly copy. */
export type FollowUpEmailFailure = "noModel" | "noEndpoint" | "noWriteUp";

export class FollowUpEmailError extends Error {
  readonly reason: FollowUpEmailFailure;
  constructor(reason: FollowUpEmailFailure) {
    super(reason);
    this.reason = reason;
  }
}

// AI system prompt — deliberately not translated (see i18n rules). The
// language instruction makes the draft follow the meeting, not the app.
const FOLLOW_UP_SYSTEM_PROMPT = `You write follow-up emails after meetings.

You will receive a meeting write-up (title, date, attendees, notes). Draft the email the organizer would send to the attendees afterwards.

Rules:
- Write only the email body. No subject line, no markdown syntax, no headings, no code fences.
- Open with a short greeting to the attendees and one sentence of thanks or context.
- Summarize the key decisions in a sentence or two of plain prose.
- List action items as short lines starting with "- ", naming the owner when the write-up names one.
- Close briefly. Sign off with nothing but a closing phrase — no name, no placeholder brackets.
- Write in the same language as the write-up.
- Be concise: the whole email fits on one screen.`;

export interface FollowUpEmailSource {
  title: string;
  /** Already localized, e.g. "Aug 19, 2026". */
  formattedDate?: string;
  /** The note's participants column (JSON attendees, or null). */
  participants?: string | null;
  /** The meeting write-up (markdown). Required — no write-up, no email. */
  enhancedContent: string;
  attendeesLabel: string;
}

export async function draftFollowUpEmail(source: FollowUpEmailSource): Promise<string> {
  const recap = buildMeetingRecap({
    title: source.title,
    formattedDate: source.formattedDate,
    participants: source.participants,
    enhancedContent: source.enhancedContent,
    labels: { attendees: source.attendeesLabel },
  });
  if (!recap) throw new FollowUpEmailError("noWriteUp");

  const settings = getSettings();
  const actions = selectResolvedActions(settings);
  if (!actions.model) throw new FollowUpEmailError("noModel");
  if (actions.mode === "self-hosted" && !actions.remoteUrl) {
    throw new FollowUpEmailError("noEndpoint");
  }

  const draft = await reasoningService.processText(recap, actions.model, null, {
    systemPrompt: FOLLOW_UP_SYSTEM_PROMPT,
    temperature: 0.4,
    disableThinking: settings.actionsDisableThinking,
    ...buildActionsOverrides(actions),
  });
  return draft.trim();
}

export {
  buildMailtoUrl,
  participantEmailAddresses,
  MAILTO_MAX_LENGTH,
} from "../utils/followUpEmailShare";
