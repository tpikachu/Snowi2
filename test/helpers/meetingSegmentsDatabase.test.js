const test = require("node:test");
const assert = require("node:assert/strict");
const { createDb } = require("./harness/db.js");

function transcript(segments) {
  return JSON.stringify(segments);
}

function makeNote(db, title = "Vendor review") {
  const { note } = db.saveNote(title, "", "meeting");
  return note.id;
}

test("writing a transcript projects its segments", (t) => {
  const db = createDb(t);
  if (!db) return;

  const noteId = makeNote(db);
  db.updateNote(noteId, {
    transcript: transcript([
      { id: "seg-1", text: "Shall we start?", timestamp: 0 },
      { id: "seg-2", text: "Pricing first.", timestamp: 5000 },
    ]),
  });

  const rows = db.getNoteSegments(noteId);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].text, "Shall we start?");
  assert.equal(rows[1].start_ms, 5000);
});

test("re-writing a transcript replaces rather than accumulates", (t) => {
  const db = createDb(t);
  if (!db) return;

  const noteId = makeNote(db);
  // Capture rewrites the whole array on every append, so a projection that
  // inserted without clearing would multiply the transcript.
  db.updateNote(noteId, { transcript: transcript([{ id: "seg-1", text: "one" }]) });
  db.updateNote(noteId, {
    transcript: transcript([
      { id: "seg-1", text: "one" },
      { id: "seg-2", text: "two" },
    ]),
  });

  assert.equal(db.getNoteSegments(noteId).length, 2);
});

test("a note update that does not touch the transcript leaves segments alone", (t) => {
  const db = createDb(t);
  if (!db) return;

  const noteId = makeNote(db);
  db.updateNote(noteId, { transcript: transcript([{ id: "seg-1", text: "kept" }]) });
  db.updateNote(noteId, { title: "Renamed" });

  assert.equal(db.getNoteSegments(noteId).length, 1);
});

test("clearing a transcript clears its segments", (t) => {
  const db = createDb(t);
  if (!db) return;

  const noteId = makeNote(db);
  db.updateNote(noteId, { transcript: transcript([{ id: "seg-1", text: "gone" }]) });
  db.updateNote(noteId, { transcript: "" });

  assert.deepEqual(db.getNoteSegments(noteId), []);
});

test("deleting a note takes its segments with it", (t) => {
  const db = createDb(t);
  if (!db) return;

  const noteId = makeNote(db);
  db.updateNote(noteId, { transcript: transcript([{ id: "seg-1", text: "orphan risk" }]) });
  assert.equal(db.getNoteSegments(noteId).length, 1);

  // Deletes happen from many paths, some with foreign keys off; the trigger is
  // what makes this hold everywhere.
  db.db.prepare("DELETE FROM notes WHERE id = ?").run(noteId);
  assert.deepEqual(db.getNoteSegments(noteId), []);
});

test("segments resolve by id, across notes, skipping ids that do not exist", (t) => {
  const db = createDb(t);
  if (!db) return;

  const a = makeNote(db, "Meeting A");
  const b = makeNote(db, "Meeting B");
  db.updateNote(a, { transcript: transcript([{ id: "seg-1", text: "from A" }]) });
  db.updateNote(b, { transcript: transcript([{ id: "seg-1", text: "from B" }]) });

  const rows = db.getSegmentsByIds([`${a}:seg-1`, `${b}:seg-1`, "999:seg-1"]);
  assert.deepEqual(
    rows.map((r) => r.text),
    ["from A", "from B"]
  );
});

test("notes missing segments are reported for backfill, and only until projected", (t) => {
  const db = createDb(t);
  if (!db) return;

  const noteId = makeNote(db);
  // Write the blob without going through updateNote, standing in for a note
  // recorded before the projection existed.
  db.db
    .prepare("UPDATE notes SET transcript = ? WHERE id = ?")
    .run(transcript([{ id: "seg-1", text: "legacy" }]), noteId);

  assert.deepEqual(db.getNoteIdsMissingSegments(), [noteId]);

  db.replaceNoteSegments(noteId, db.getNote(noteId).transcript);
  assert.deepEqual(db.getNoteIdsMissingSegments(), []);
  assert.equal(db.getNoteSegments(noteId)[0].text, "legacy");
});

test("a note with no transcript is never queued for backfill", (t) => {
  const db = createDb(t);
  if (!db) return;

  makeNote(db, "Typed note");
  assert.deepEqual(db.getNoteIdsMissingSegments(), []);
});

test("a corrupt transcript projects to nothing without failing the note write", (t) => {
  const db = createDb(t);
  if (!db) return;

  const noteId = makeNote(db);
  const result = db.updateNote(noteId, { transcript: "{not json" });

  assert.equal(result.success, true);
  assert.equal(result.note.transcript, "{not json");
  assert.deepEqual(db.getNoteSegments(noteId), []);
});
