const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeSeriesTitle,
  isSeriesTitle,
  participantEmails,
  findSeriesOccurrences,
} = require("../../src/helpers/meetingSeries");

const attendees = (...emails) => JSON.stringify(emails.map((email) => ({ email })));

const note = (id, title, participants = null) => ({
  id,
  title,
  created_at: `2026-08-${String(id).padStart(2, "0")} 10:00:00`,
  participants,
});

test("title identity survives case, trim and inner whitespace", () => {
  assert.equal(normalizeSeriesTitle("  Acme   Weekly  "), "acme weekly");
  assert.equal(normalizeSeriesTitle("Acme\tWeekly"), "acme weekly");
});

test("placeholder and generic titles never identify a series", () => {
  // Every manual meeting is born "New note" — matching on it would chain all
  // of them into one fake series.
  for (const title of ["New note", "new note", " Meeting ", "1:1", "Standup", "", null]) {
    assert.equal(isSeriesTitle(title), false, JSON.stringify(title));
  }
  assert.equal(isSeriesTitle("Acme weekly"), true);
});

test("participant emails parse defensively", () => {
  assert.deepEqual(participantEmails(attendees("Dana@acme.com")), ["dana@acme.com"]);
  assert.deepEqual(participantEmails("not json"), []);
  assert.deepEqual(participantEmails(null), []);
  assert.deepEqual(participantEmails(JSON.stringify({ email: "x" })), []);
  assert.deepEqual(participantEmails(JSON.stringify([{ displayName: "No email" }])), []);
});

test("same title matches when either side has no participants", () => {
  const current = note(20, "Acme weekly");
  const past = [note(13, "Acme weekly", attendees("dana@acme.com"))];
  assert.equal(findSeriesOccurrences(current, past).length, 1);
});

test("when both sides know participants, they must share someone", () => {
  // Two different 1:1-style meetings that happen to share a specific title.
  const current = note(20, "Pricing sync", attendees("dana@acme.com", "me@snowy.app"));
  const withDana = note(13, "Pricing sync", attendees("Dana@Acme.com"));
  const withSam = note(12, "Pricing sync", attendees("sam@other.co"));
  const matched = findSeriesOccurrences(current, [withDana, withSam]);
  assert.deepEqual(
    matched.map((occurrence) => occurrence.id),
    [13]
  );
});

test("a generic title matches nothing even with shared participants", () => {
  const current = note(20, "1:1", attendees("dana@acme.com"));
  const past = [note(13, "1:1", attendees("dana@acme.com"))];
  assert.deepEqual(findSeriesOccurrences(current, past), []);
});

test("candidates whose normalized title differs are dropped", () => {
  // The SQL filter is loose (trim + ASCII lower); the module re-verifies.
  const current = note(20, "Acme weekly");
  const past = [note(13, "Acme weekly kickoff")];
  assert.deepEqual(findSeriesOccurrences(current, past), []);
});

test("order of candidates is preserved — the database sends newest first", () => {
  const current = note(20, "Acme weekly");
  const past = [note(13, "Acme weekly"), note(6, "Acme weekly")];
  assert.deepEqual(
    findSeriesOccurrences(current, past).map((occurrence) => occurrence.id),
    [13, 6]
  );
});
