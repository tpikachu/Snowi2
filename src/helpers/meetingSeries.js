/**
 * Which past meetings are earlier occurrences of the one starting now.
 *
 * There is no series id to lean on: the calendar sync stores expanded
 * occurrences without their recurrence linkage, Apple never had one, and
 * manual meetings never touched a calendar. What every occurrence of a
 * recurring meeting *does* share is its title — meeting notes take the event
 * summary verbatim (`meetingDetectionEngine`), so "Acme weekly" last Tuesday
 * and "Acme weekly" today are the same string. Matching on that is precise,
 * works across all three providers, and — unlike a new series column — works
 * retroactively on every note the user already has.
 *
 * Two guards keep the string match honest:
 *
 * - Placeholder and generic titles never match. Every manual meeting is born
 *   "New note", and chaining them into one fake series would hand the
 *   assistant last week's unrelated call as "last time".
 * - When both sides know their participants, they must share at least one
 *   email. "1:1" with Dana and "1:1" with Sam are different series; the title
 *   cannot tell them apart, but the attendee lists can. A side with no
 *   participant emails (manual notes, events without attendees) abstains
 *   rather than vetoes — most calendars fill attendees in, and the ones that
 *   do not would otherwise never match at all.
 *
 * Pure — no database, no Electron. The database hands over candidates already
 * filtered to `note_type = 'meeting'` with a loosely matching title; this
 * module decides which of them are really the same meeting.
 */

/**
 * Titles that name a kind of meeting rather than a particular one. Kept
 * deliberately short: a false negative costs one brief, a false positive
 * briefs the user on somebody else's meeting.
 */
const GENERIC_TITLES = new Set([
  "new note", // the placeholder every manual and mic-detected meeting is born with
  "untitled",
  "meeting",
  "call",
  "sync",
  "1:1",
  "1-1",
  "one on one",
  "standup",
  "stand-up",
  "check-in",
  "check in",
  "quick chat",
  "catch up",
  "catch-up",
]);

/** Lowercased, trimmed, inner whitespace collapsed — the identity of a title. */
function normalizeSeriesTitle(title) {
  return (title || "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Whether a title is specific enough to identify a series by itself. */
function isSeriesTitle(title) {
  const normalized = normalizeSeriesTitle(title);
  return normalized.length > 0 && !GENERIC_TITLES.has(normalized);
}

/**
 * Participant emails from a note's `participants` column (JSON, written from
 * the calendar event's attendees). Anything unparseable reads as "unknown",
 * which abstains from the overlap check rather than failing it.
 */
function participantEmails(participants) {
  if (!participants) return [];
  let parsed = participants;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((attendee) =>
      typeof attendee?.email === "string" ? attendee.email.trim().toLowerCase() : ""
    )
    .filter(Boolean);
}

/**
 * Past occurrences of the meeting `current` belongs to, newest first.
 *
 * @param current    { title, participants } — the note the meeting just started.
 * @param candidates Past meeting notes with a case-insensitively equal title,
 *                   newest first, each { id, title, created_at, participants }.
 */
function findSeriesOccurrences(current, candidates) {
  if (!isSeriesTitle(current?.title)) return [];
  const title = normalizeSeriesTitle(current.title);
  const currentEmails = new Set(participantEmails(current.participants));

  return (candidates || []).filter((candidate) => {
    if (normalizeSeriesTitle(candidate.title) !== title) return false;
    const candidateEmails = participantEmails(candidate.participants);
    // Both sides know who was there: same series means someone in common.
    if (currentEmails.size > 0 && candidateEmails.length > 0) {
      return candidateEmails.some((email) => currentEmails.has(email));
    }
    return true;
  });
}

module.exports = {
  GENERIC_TITLES,
  normalizeSeriesTitle,
  isSeriesTitle,
  participantEmails,
  findSeriesOccurrences,
};
