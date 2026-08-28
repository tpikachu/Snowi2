/**
 * The shareable half of the follow-up email: who it goes to and the mailto:
 * URL that opens it. Pure — no store, no Electron — so the truncation rule
 * that decides whether a mail window opens at all is testable.
 */

/** Attendee email addresses from the participants JSON; unparseable is nobody. */
export function participantEmailAddresses(participants: string | null | undefined): string[] {
  if (!participants) return [];
  try {
    const parsed = JSON.parse(participants);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((attendee) => (typeof attendee?.email === "string" ? attendee.email.trim() : ""))
      .filter((email) => email.includes("@"));
  } catch {
    return [];
  }
}

/**
 * The practical mailto: budget. Beyond ~2000 characters Windows' ShellExecute
 * and several mail clients truncate or refuse silently.
 */
export const MAILTO_MAX_LENGTH = 1900;

/**
 * A mailto: URL that survives real mail clients. The body is cut at a line
 * boundary to fit the budget, because a draft that opens slightly short beats
 * a mail window that never opens; the full text is one Copy away.
 */
export function buildMailtoUrl({
  to,
  subject,
  body,
}: {
  to: string[];
  subject: string;
  body: string;
}): string {
  const base = `mailto:${to.map(encodeURIComponent).join(",")}`;
  const subjectPart = `subject=${encodeURIComponent(subject)}`;
  const prefix = `${base}?${subjectPart}&body=`;

  const budget = Math.max(0, MAILTO_MAX_LENGTH - prefix.length);
  let bodyText = body;
  while (bodyText && encodeURIComponent(bodyText).length > budget) {
    const cut = bodyText.lastIndexOf("\n");
    // No line boundary left to cut at — trim characters instead of giving up.
    bodyText = cut > 0 ? bodyText.slice(0, cut).trimEnd() : bodyText.slice(0, -32);
  }

  return `${prefix}${encodeURIComponent(bodyText)}`;
}
