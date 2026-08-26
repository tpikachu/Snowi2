const test = require("node:test");
const assert = require("node:assert/strict");

const { createDb } = require("./harness/db.js");

// The loose half of series matching: which past notes the database even offers
// to meetingSeries.findSeriesOccurrences. The strict half (generic titles,
// attendee overlap) is tested in meetingSeries.test.js.

function saveMeeting(db, title, createdAt) {
  const { note } = db.saveNote(title, "", "meeting");
  db.db.prepare("UPDATE notes SET created_at = ? WHERE id = ?").run(createdAt, note.id);
  return note.id;
}

test("candidates: same trimmed title, meetings only, self and deleted excluded, newest first", (t) => {
  const db = createDb(t);
  if (!db) return;

  const older = saveMeeting(db, "Acme weekly", "2026-08-05 10:00:00");
  const newer = saveMeeting(db, "  acme WEEKLY ", "2026-08-12 10:00:00");
  const deleted = saveMeeting(db, "Acme weekly", "2026-08-14 10:00:00");
  db.deleteNote(deleted);
  const otherTitle = saveMeeting(db, "Acme kickoff", "2026-08-13 10:00:00");
  const personal = db.saveNote("Acme weekly", "", "personal").note.id;
  const current = saveMeeting(db, "Acme weekly", "2026-08-19 10:00:00");

  const candidates = db.getMeetingSeriesCandidates("Acme weekly", current);
  const ids = candidates.map((row) => row.id);

  assert.deepEqual(ids, [newer, older]);
  assert.ok(!ids.includes(current), "the meeting being briefed is not its own occurrence");
  assert.ok(!ids.includes(deleted));
  assert.ok(!ids.includes(otherTitle));
  assert.ok(!ids.includes(personal));
  // The rows carry what findSeriesOccurrences needs to decide.
  assert.ok("participants" in candidates[0]);
  assert.ok("created_at" in candidates[0]);
});

test("candidates: blank titles and a missing table degrade to empty, not a throw", (t) => {
  const db = createDb(t);
  if (!db) return;

  assert.deepEqual(db.getMeetingSeriesCandidates("", null), []);
  assert.deepEqual(db.getMeetingSeriesCandidates("   ", null), []);
  assert.deepEqual(db.getMeetingSeriesCandidates(null, null), []);
});

test("candidates carry the stored write-up template, so a series can inherit it", (t) => {
  const db = createDb(t);
  if (!db) return;

  const previous = saveMeeting(db, "Acme weekly", "2026-08-12 10:00:00");
  db.updateNote(previous, { meeting_template: "sales" });
  const current = saveMeeting(db, "Acme weekly", "2026-08-19 10:00:00");

  // As the engine calls it: the just-created meeting excludes itself, so the
  // newest remaining candidate is the previous occurrence.
  const [candidate] = db.getMeetingSeriesCandidates("Acme weekly", current, 1);
  assert.equal(candidate.meeting_template, "sales");

  // Choosing the default again stores NULL, not the string "default".
  db.updateNote(previous, { meeting_template: null });
  assert.equal(db.getNote(previous).meeting_template, null);
});

test("candidates respect the limit, keeping the newest", (t) => {
  const db = createDb(t);
  if (!db) return;

  for (let day = 1; day <= 12; day += 1) {
    saveMeeting(db, "Daily standup review", `2026-08-${String(day).padStart(2, "0")} 09:00:00`);
  }

  const candidates = db.getMeetingSeriesCandidates("Daily standup review", null, 3);
  assert.equal(candidates.length, 3);
  assert.equal(candidates[0].created_at, "2026-08-12 09:00:00");
});
