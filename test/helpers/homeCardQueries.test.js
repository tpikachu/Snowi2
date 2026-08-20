const test = require("node:test");
const assert = require("node:assert/strict");
const { createDb } = require("./harness/db.js");

/**
 * The queries behind the two home cards, plus the deleted-note fix that came
 * with them.
 */

function addNote(db, { title = "Meeting", transcript = null, enhanced = null } = {}) {
  const result = db.saveNote(title, "", "meeting");
  const id = result.note.id;
  db.updateNote(id, { transcript, enhanced_content: enhanced });
  return id;
}

function addMemory(db, { id, noteId, type = "action_item", status = "open", dueAt = null }) {
  db.db
    .prepare(
      `INSERT INTO memory_objects
       (id, meeting_id, note_id, type, subject, status, due_at, content_hash, created_at, updated_at)
       VALUES (?, 'mtg_test', ?, ?, 'user', ?, ?, 'hash', '2026-08-01', '2026-08-01')`
    )
    .run(id, noteId, type, status, dueAt);
}

test("lists only meetings with a transcript and no write-up", async (t) => {
  const db = createDb(t);
  if (!db) return;

  const missing = addNote(db, { title: "Never written up", transcript: "words" });
  addNote(db, { title: "Written up", transcript: "words", enhanced: "# Notes" });
  addNote(db, { title: "No transcript at all", transcript: null });
  // Whitespace is not a write-up: a run that produced nothing must still show
  // up as needing one.
  addNote(db, { title: "Blank write-up", transcript: "words", enhanced: "   " });

  const { total, meetings } = db.getMeetingsNeedingWriteUp(10);
  const titles = meetings.map((m) => m.title);

  assert.equal(total, 2);
  assert.ok(titles.includes("Never written up"));
  assert.ok(titles.includes("Blank write-up"));
  assert.equal(titles.includes("Written up"), false);
  assert.equal(titles.includes("No transcript at all"), false);
  assert.ok(meetings.some((m) => m.id === missing));
});

test("a whitespace-only transcript does not count as recorded", async (t) => {
  const db = createDb(t);
  if (!db) return;

  addNote(db, { title: "Empty recording", transcript: "   " });

  // Otherwise every abandoned recording shows up as a repair job that has
  // nothing to repair.
  assert.equal(db.getMeetingsNeedingWriteUp(10).total, 0);
});

test("a deleted meeting leaves the backlog", async (t) => {
  const db = createDb(t);
  if (!db) return;

  const id = addNote(db, { transcript: "words" });
  assert.equal(db.getMeetingsNeedingWriteUp(10).total, 1);

  db.deleteNote(id);
  assert.equal(db.getMeetingsNeedingWriteUp(10).total, 0);
});

test("reports the whole backlog even when the page is smaller", async (t) => {
  const db = createDb(t);
  if (!db) return;

  for (let i = 0; i < 5; i += 1) addNote(db, { title: `M${i}`, transcript: "words" });

  const { total, meetings } = db.getMeetingsNeedingWriteUp(2);
  assert.equal(total, 5, "the count describes the backlog, not the page");
  assert.equal(meetings.length, 2);
});

test("open commitments carry the meeting they came from", async (t) => {
  const db = createDb(t);
  if (!db) return;

  const noteId = addNote(db, { title: "Pricing call", transcript: "words" });
  addMemory(db, { id: "m1", noteId });

  const [row] = db.getOpenMemoryActions("user", 10);
  assert.equal(row.note_title, "Pricing call");
  assert.equal(row.note_id, noteId);
});

test("a commitment whose meeting was deleted stops being quoted", async (t) => {
  const db = createDb(t);
  if (!db) return;

  const noteId = addNote(db, { title: "Deleted call", transcript: "words" });
  addMemory(db, { id: "m1", noteId });
  addMemory(db, { id: "m2", noteId: null });

  assert.equal(db.getOpenMemoryActions("user", 10).length, 2);

  db.deleteNote(noteId);
  const rows = db.getOpenMemoryActions("user", 10);

  // It was still being pinned into every chat prompt after the user deleted
  // the meeting it came from. searchMemoryObjects already excluded these.
  assert.deepEqual(
    rows.map((r) => r.id),
    ["m2"],
    "an object with no note at all is unaffected"
  );
});

test("only open action-shaped objects are listed", async (t) => {
  const db = createDb(t);
  if (!db) return;

  const noteId = addNote(db, { transcript: "words" });
  addMemory(db, { id: "open", noteId });
  addMemory(db, { id: "done", noteId, status: "done" });
  addMemory(db, { id: "dismissed", noteId, status: "dismissed" });
  addMemory(db, { id: "decision", noteId, type: "decision" });
  addMemory(db, { id: "commitment", noteId, type: "commitment" });
  addMemory(db, { id: "deadline", noteId, type: "deadline" });

  const ids = db.getOpenMemoryActions("user", 10).map((r) => r.id);

  assert.deepEqual(new Set(ids), new Set(["open", "commitment", "deadline"]));
});

test("marking one done takes it out of the list", async (t) => {
  const db = createDb(t);
  if (!db) return;

  const noteId = addNote(db, { transcript: "words" });
  addMemory(db, { id: "m1", noteId });

  assert.deepEqual(db.setMemoryObjectStatus("m1", "done"), { success: true });
  assert.equal(db.getOpenMemoryActions("user", 10).length, 0);

  const row = db.db.prepare("SELECT status, sync_status FROM memory_objects WHERE id = 'm1'").get();
  assert.equal(row.status, "done");
  // Reset so a future sync carries the new state rather than skipping it.
  assert.equal(row.sync_status, "local_only");
});

test("refuses a status the schema does not define", async (t) => {
  const db = createDb(t);
  if (!db) return;

  const noteId = addNote(db, { transcript: "words" });
  addMemory(db, { id: "m1", noteId });

  const result = db.setMemoryObjectStatus("m1", "completed");
  assert.equal(result.success, false);
  assert.match(result.error, /Unknown memory status/);
  // Unchanged: a typo must not quietly hide a commitment by writing a status
  // no query filters on.
  assert.equal(db.getOpenMemoryActions("user", 10).length, 1);
});

test("reports a miss rather than claiming success", async (t) => {
  const db = createDb(t);
  if (!db) return;

  const result = db.setMemoryObjectStatus("nope", "done");
  assert.equal(result.success, false);
  assert.match(result.error, /No such memory object/);
});

test("open commitments come back soonest-due first, undated last", async (t) => {
  const db = createDb(t);
  if (!db) return;

  const noteId = addNote(db, { transcript: "words" });
  addMemory(db, { id: "undated", noteId });
  addMemory(db, { id: "later", noteId, dueAt: "2026-09-01" });
  addMemory(db, { id: "sooner", noteId, dueAt: "2026-08-21" });

  assert.deepEqual(
    db.getOpenMemoryActions("user", 10).map((r) => r.id),
    ["sooner", "later", "undated"]
  );
});
