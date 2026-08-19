const test = require("node:test");
const assert = require("node:assert/strict");
const { createDb } = require("./harness/db.js");

function makeMeeting(db, title, createdAt) {
  const { note } = db.saveNote(title, "", "meeting");
  if (createdAt) {
    db.db.prepare("UPDATE notes SET created_at = ? WHERE id = ?").run(createdAt, note.id);
  }
  return note.id;
}

test("reports the true total even when the page is smaller", (t) => {
  const db = createDb(t);
  if (!db) return;

  for (let i = 0; i < 12; i++) makeMeeting(db, `Meeting ${i}`);

  const { total, meetings } = db.listMeetings({ limit: 5 });

  // The reason this method exists. An agent handed only the rows would say
  // "you had 5 meetings" — which is exactly the mistake semantic search makes
  // and the mistake a paged list would reintroduce.
  assert.equal(total, 12);
  assert.equal(meetings.length, 5);
});

test("counts only meetings, and only live ones", (t) => {
  const db = createDb(t);
  if (!db) return;

  makeMeeting(db, "Vendor sync");
  db.saveNote("Shopping list", "milk", "personal");
  const deleted = makeMeeting(db, "Cancelled");
  db.deleteNote(deleted);

  const { total, meetings } = db.listMeetings({});
  assert.equal(total, 1);
  assert.equal(meetings[0].title, "Vendor sync");
});

test("a date range includes meetings recorded on its last day", (t) => {
  const db = createDb(t);
  if (!db) return;

  makeMeeting(db, "Early", "2026-08-01 09:00:00");
  makeMeeting(db, "Last day", "2026-08-19 16:45:00");
  makeMeeting(db, "After", "2026-08-20 09:00:00");

  // created_at carries a time, so a bare "to" compared as a string would drop
  // everything recorded after midnight on the final day.
  const { total } = db.listMeetings({ from: "2026-08-01", to: "2026-08-19" });
  assert.equal(total, 2);
});

test("newest first", (t) => {
  const db = createDb(t);
  if (!db) return;

  makeMeeting(db, "Older", "2026-08-01 09:00:00");
  makeMeeting(db, "Newer", "2026-08-18 09:00:00");

  const { meetings } = db.listMeetings({});
  assert.deepEqual(
    meetings.map((m) => m.title),
    ["Newer", "Older"]
  );
});

test("flags whether a meeting has notes and a transcript", (t) => {
  const db = createDb(t);
  if (!db) return;

  makeMeeting(db, "Bare"); // left without notes or transcript on purpose
  const full = makeMeeting(db, "Full");
  db.updateNote(full, { enhanced_content: "## Decisions", transcript: "[]" });

  const byTitle = new Map(db.listMeetings({}).meetings.map((m) => [m.title, m]));
  assert.equal(!!byTitle.get("Full").has_notes, true);
  assert.equal(!!byTitle.get("Full").has_transcript, true);
  assert.equal(!!byTitle.get("Bare").has_notes, false);
  assert.equal(!!byTitle.get("Bare").has_transcript, false);
});
