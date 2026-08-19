const test = require("node:test");
const assert = require("node:assert/strict");
const { createDb } = require("./harness/db.js");

let seq = 0;

/**
 * Writes an indexed memory row directly. The sealed half lives in the encrypted
 * store and is irrelevant here: this method's whole contract is that it filters
 * without touching it.
 */
function addObject(db, { type, subject = "user", status = "open", dueAt = null, noteId = null }) {
  const id = `mem_${++seq}`;
  const now = new Date().toISOString();
  db.db
    .prepare(
      `INSERT INTO memory_objects
       (id, meeting_id, note_id, type, subject, status, due_at, confidence, content_hash,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0.9, ?, ?, ?)`
    )
    .run(id, `mtg_${id}`, noteId, type, subject, status, dueAt, `hash_${id}`, now, now);
  return id;
}

function makeNote(db, title, type = "meeting") {
  return db.saveNote(title, "", type).note.id;
}

/** Spaces have no create method on the manager; tests insert them directly. */
function makeSpace(db, name) {
  const maxOrder = db.db.prepare("SELECT MAX(sort_order) AS max_order FROM spaces").get();
  const result = db.db
    .prepare(
      "INSERT INTO spaces (client_space_id, kind, name, sort_order) VALUES (?, 'team', ?, ?)"
    )
    .run(`test-space-${++seq}`, name, (maxOrder?.max_order ?? 0) + 1);
  return Number(result.lastInsertRowid);
}

test("reports the true total even when the page is smaller", (t) => {
  const db = createDb(t);
  if (!db) return;

  for (let i = 0; i < 9; i++) addObject(db, { type: "decision" });

  const { total, objects } = db.searchMemoryObjects({ limit: 4 });

  // Same contract as list_meetings: an agent handed only the rows would answer
  // "you have 4 open decisions" with complete confidence.
  assert.equal(total, 9);
  assert.equal(objects.length, 4);
});

test("superseded and dismissed claims are invisible unless asked for by name", (t) => {
  const db = createDb(t);
  if (!db) return;

  addObject(db, { type: "decision", status: "open" });
  addObject(db, { type: "decision", status: "superseded" });
  addObject(db, { type: "decision", status: "dismissed" });

  // The point: answering with a decision that was later reversed is worse than
  // not answering at all.
  assert.equal(db.searchMemoryObjects({}).total, 1);
  assert.equal(db.searchMemoryObjects({ status: "superseded" }).total, 1);
  assert.equal(db.searchMemoryObjects({ includeSuperseded: true }).total, 3);
});

test("filters by type, and by several types at once", (t) => {
  const db = createDb(t);
  if (!db) return;

  addObject(db, { type: "decision" });
  addObject(db, { type: "commitment" });
  addObject(db, { type: "action_item" });
  addObject(db, { type: "risk" });

  assert.equal(db.searchMemoryObjects({ types: ["decision"] }).total, 1);
  assert.equal(
    db.searchMemoryObjects({ types: ["commitment", "action_item", "deadline"] }).total,
    2
  );
  assert.equal(db.searchMemoryObjects({ types: [] }).total, 4, "an empty list is not a filter");
});

test("finds what is overdue, which is the query the tool exists for", (t) => {
  const db = createDb(t);
  if (!db) return;

  addObject(db, { type: "commitment", dueAt: "2026-01-10" });
  addObject(db, { type: "commitment", dueAt: "2026-03-01" });
  addObject(db, { type: "commitment", dueAt: null });

  const overdue = db.searchMemoryObjects({ status: "open", dueBefore: "2026-02-01" });
  assert.equal(overdue.total, 1);
  assert.equal(overdue.objects[0].due_at, "2026-01-10");

  // An undated commitment is not overdue, and must not be swept in by a bound.
  assert.equal(db.searchMemoryObjects({ dueAfter: "2020-01-01" }).total, 2);
});

test("dated claims lead, soonest first, undated last", (t) => {
  const db = createDb(t);
  if (!db) return;

  addObject(db, { type: "deadline", dueAt: null });
  addObject(db, { type: "deadline", dueAt: "2026-09-01" });
  addObject(db, { type: "deadline", dueAt: "2026-06-01" });

  const { objects } = db.searchMemoryObjects({});
  assert.deepEqual(
    objects.map((o) => o.due_at),
    ["2026-06-01", "2026-09-01", null]
  );
});

test("separates the user's claims from everyone else's", (t) => {
  const db = createDb(t);
  if (!db) return;

  addObject(db, { type: "commitment", subject: "user" });
  addObject(db, { type: "commitment", subject: "other" });

  assert.equal(db.searchMemoryObjects({ subject: "user" }).total, 1);
  assert.equal(db.searchMemoryObjects({ subject: "other" }).total, 1);
  assert.equal(db.searchMemoryObjects({}).total, 2);
});

test("a claim from a deleted note is gone", (t) => {
  const db = createDb(t);
  if (!db) return;

  const kept = makeNote(db, "Vendor sync");
  const dropped = makeNote(db, "Cancelled");
  addObject(db, { type: "decision", noteId: kept });
  addObject(db, { type: "decision", noteId: dropped });

  db.deleteNote(dropped);

  // Soft-deleted notes stay in the table, so without the join condition their
  // claims would keep being quoted back at the user after they deleted them.
  const { total, objects } = db.searchMemoryObjects({});
  assert.equal(total, 1);
  assert.equal(objects[0].note_id, kept);
});

test("scoping to a space excludes claims from notes outside it", (t) => {
  const db = createDb(t);
  if (!db) return;

  const idA = makeSpace(db, "Work");
  const idB = makeSpace(db, "Personal");

  const noteA = makeNote(db, "Work meeting");
  const noteB = makeNote(db, "Personal meeting");
  db.updateNote(noteA, { space_id: idA });
  db.updateNote(noteB, { space_id: idB });

  addObject(db, { type: "decision", noteId: noteA });
  addObject(db, { type: "decision", noteId: noteB });
  // Orphan: extracted before its note existed, belongs to no container.
  addObject(db, { type: "decision", noteId: null });

  // The leak this prevents: a container chat enumerating claims from meetings
  // it is not allowed to see.
  const scoped = db.searchMemoryObjects({ spaceId: idA });
  assert.equal(scoped.total, 1);
  assert.equal(scoped.objects[0].note_id, noteA);

  assert.equal(db.searchMemoryObjects({}).total, 3, "unscoped still sees the orphan");
});
