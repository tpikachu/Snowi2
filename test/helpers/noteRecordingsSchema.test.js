const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");

const { NOTE_RECORDINGS_DDL } = require("../../src/helpers/noteRecordingsSchema");

function openDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT)");
  for (const statement of NOTE_RECORDINGS_DDL) db.exec(statement);
  return db;
}

test("the DDL applies twice without complaint", () => {
  const db = openDb();
  for (const statement of NOTE_RECORDINGS_DDL) db.exec(statement);
  const columns = db
    .prepare("PRAGMA table_info(note_recordings)")
    .all()
    .map((c) => c.name);
  assert.deepEqual(columns, [
    "id",
    "note_id",
    "session_id",
    "rel_path",
    "started_at_ms",
    "ended_at_ms",
    "duration_ms",
    "bytes",
    "codec",
    "created_at",
  ]);
});

test("a note's recordings go with the note, through a plain DELETE with foreign keys off", () => {
  const db = openDb();
  db.exec("PRAGMA foreign_keys = OFF");
  db.prepare("INSERT INTO notes (title) VALUES (?)").run("kept");
  db.prepare("INSERT INTO notes (title) VALUES (?)").run("deleted");
  const insert = db.prepare(
    "INSERT INTO note_recordings (note_id, session_id, rel_path, started_at_ms, duration_ms, bytes) VALUES (?, ?, ?, ?, ?, ?)"
  );
  insert.run(1, "diar-1", "1/100.mp3", 100, 60_000, 480_000);
  insert.run(2, "diar-2", "2/200.mp3", 200, 60_000, 480_000);
  insert.run(2, "diar-3", "2/300.mp3", 300, 30_000, 240_000);

  db.prepare("DELETE FROM notes WHERE id = ?").run(2);
  const left = db
    .prepare("SELECT note_id, rel_path FROM note_recordings ORDER BY id")
    .all()
    .map((row) => ({ ...row }));
  assert.deepEqual(left, [{ note_id: 1, rel_path: "1/100.mp3" }]);
});

test("one file, one row: the stored path is unique", () => {
  const db = openDb();
  db.prepare("INSERT INTO notes (title) VALUES (?)").run("n");
  const insert = db.prepare(
    "INSERT INTO note_recordings (note_id, rel_path, started_at_ms) VALUES (?, ?, ?)"
  );
  insert.run(1, "1/100.mp3", 100);
  assert.throws(() => insert.run(1, "1/100.mp3", 100), /UNIQUE/);
});
