const test = require("node:test");
const assert = require("node:assert/strict");
const { createDb } = require("./harness/db.js");

function findById(rows, id) {
  return rows.find((row) => row.id === id) || null;
}

test("saveTranscription with routeKind translation round-trips route_kind", (t) => {
  const db = createDb(t);
  if (!db) return;

  const { id } = db.saveTranscription("Ciao", "Hello", { routeKind: "translation" });
  const row = findById(db.getTranscriptions(), id);

  assert.ok(row);
  assert.equal(row.route_kind, "translation");
});

test("saveTranscription without routeKind stores route_kind null", (t) => {
  const db = createDb(t);
  if (!db) return;

  const { id } = db.saveTranscription("plain text");
  const row = findById(db.getTranscriptions(), id);

  assert.ok(row);
  assert.equal(row.route_kind, null);
});

test("discarded save keeps its routeKind", (t) => {
  const db = createDb(t);
  if (!db) return;

  const { id } = db.saveTranscription("", "Hello", {
    status: "discarded",
    routeKind: "translation",
  });

  // Discarded rows are filtered out of the default listing.
  assert.equal(findById(db.getTranscriptions(), id), null);

  const row = findById(db.getTranscriptions(50, { includeDiscarded: true }), id);
  assert.ok(row);
  assert.equal(row.status, "discarded");
  assert.equal(row.route_kind, "translation");
});

test("updateTranscriptionText does not clobber route_kind", (t) => {
  const db = createDb(t);
  if (!db) return;

  const { id } = db.saveTranscription("Ciao", "Hello", { routeKind: "translation" });
  db.updateTranscriptionText(id, "Salve", "Hello");

  const row = findById(db.getTranscriptions(), id);
  assert.ok(row);
  assert.equal(row.text, "Salve");
  assert.equal(row.raw_text, "Hello");
  assert.equal(row.route_kind, "translation");
});
