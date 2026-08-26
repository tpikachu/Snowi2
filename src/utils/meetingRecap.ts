/**
 * The recap someone else reads.
 *
 * A meeting note is usually *for* somebody who was not in the room — a
 * manager, a client, the rest of the team — and today's path from note to
 * message is select-all, copy, then hand-trim the app furniture out. This
 * builds the message directly: a header line with what the meeting was and
 * when, who was there, then the write-up as it stands.
 *
 * Markdown on purpose: it pastes cleanly into Slack, and as readable plain
 * text into email. No footer, no "sent from" — the recap is the user's
 * artifact, not an advertisement.
 *
 * Pure — no store, no Electron, no clock. The caller formats the date,
 * because only it knows the display locale.
 */

export interface MeetingRecapInput {
  title: string;
  /** Already localized (e.g. "Aug 19, 2026"). Empty hides the date. */
  formattedDate?: string;
  /** The note's participants column: JSON attendees, or null. */
  participants?: string | null;
  /** The write-up (markdown). The recap is empty without one. */
  enhancedContent: string;
  labels: {
    /** e.g. "Attendees" */
    attendees: string;
  };
}

/** Display names from the participants JSON; unparseable reads as nobody. */
export function recapAttendeeNames(participants: string | null | undefined): string[] {
  if (!participants) return [];
  try {
    const parsed = JSON.parse(participants);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((attendee) =>
        typeof attendee?.displayName === "string" && attendee.displayName.trim()
          ? attendee.displayName.trim()
          : typeof attendee?.email === "string"
            ? attendee.email.trim()
            : ""
      )
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** @returns null when there is no write-up to share. */
export function buildMeetingRecap(input: MeetingRecapInput): string | null {
  const body = input.enhancedContent?.trim();
  if (!body) return null;

  const heading = [input.title?.trim(), input.formattedDate?.trim()].filter(Boolean).join(" — ");
  const attendees = recapAttendeeNames(input.participants);

  const header: string[] = [];
  if (heading) header.push(`**${heading}**`);
  if (attendees.length > 0) header.push(`${input.labels.attendees}: ${attendees.join(", ")}`);

  return header.length > 0 ? `${header.join("\n")}\n\n${body}` : body;
}
