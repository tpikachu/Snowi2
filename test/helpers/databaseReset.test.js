const test = require("node:test");
const assert = require("node:assert/strict");
const { createDb } = require("./harness/db.js");

test("reset leaves an open connection, not a closed handle", (t) => {
  const db = createDb(t);
  if (!db) return;

  db.saveNote("Vendor review", "pricing", "meeting");
  db.reset();

  // The exact failure this pins: "reset app data" only reloads the renderer,
  // so a manager that closed its handle without reopening stays broken for the
  // rest of the session. `this.db` is still truthy, so every "not initialized"
  // guard passes and the query dies deeper down with "the database connection
  // is not open" — which the user sees on every read until they quit the app.
  assert.equal(db.db.open, true);
  assert.doesNotThrow(() => db.getNotes());
});

test("reset clears the data but keeps the schema and its seeds", (t) => {
  const db = createDb(t);
  if (!db) return;

  const seededActions = db.getActions().length;
  db.saveNote("Vendor review", "pricing", "meeting");
  db.saveTranscription("hello there");

  db.reset();

  assert.equal(db.getNotes().length, 0);
  assert.equal(db.getTranscriptions().length, 0);
  // The built-in "Generate Notes" action is seeded by initDatabase. Losing it
  // would leave note formatting with nothing to run after a reset.
  assert.equal(db.getActions().length, seededActions);
});

test("reset does not resurrect rows from a stale WAL", (t) => {
  const db = createDb(t);
  if (!db) return;

  // WAL mode is on, so committed rows can still be sitting in the -wal sidecar
  // rather than the main file. Deleting only the database and reopening would
  // replay them straight back into the "empty" one.
  for (let i = 0; i < 25; i++) db.saveTranscription(`entry ${i}`);
  assert.ok(db.getTranscriptions().length >= 25);

  db.reset();

  assert.equal(db.getTranscriptions().length, 0);
});
