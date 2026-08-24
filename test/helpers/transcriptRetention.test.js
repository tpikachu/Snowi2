const test = require("node:test");
const assert = require("node:assert/strict");
const { createDb } = require("./harness/db.js");

function insert(db, text, ageDays, cloudId = null) {
  const { lastInsertRowid } = db.db
    .prepare(
      "INSERT INTO transcriptions (text, created_at, cloud_id) VALUES (?, datetime('now', ?), ?)"
    )
    .run(text, `-${ageDays} days`, cloudId);
  return lastInsertRowid;
}

test("purges local transcriptions past the retention window and keeps the rest", (t) => {
  const db = createDb(t);
  if (!db) return;

  const stale = insert(db, "two days old", 2);
  const fresh = insert(db, "a few hours old", 0);

  const { ids } = db.deleteTranscriptionsExpiredBefore(1);

  assert.deepEqual(ids, [stale]);
  const remaining = db.db
    .prepare("SELECT id FROM transcriptions")
    .all()
    .map((r) => r.id);
  assert.deepEqual(remaining, [fresh]);
});

test("tombstones synced transcriptions instead of deleting them so the cloud copy is removed too", (t) => {
  const db = createDb(t);
  if (!db) return;

  const synced = insert(db, "synced and stale", 10, "cloud-1");
  db.deleteTranscriptionsExpiredBefore(7);

  const row = db.db
    .prepare("SELECT deleted_at, sync_status FROM transcriptions WHERE id = ?")
    .get(synced);
  assert.ok(row.deleted_at, "synced row should be tombstoned, not hard-deleted");
  assert.equal(row.sync_status, "pending");
});

test("ignores rows that are already tombstoned", (t) => {
  const db = createDb(t);
  if (!db) return;

  const synced = insert(db, "already gone", 10, "cloud-1");
  db.deleteTranscriptionsExpiredBefore(7);

  assert.deepEqual(db.deleteTranscriptionsExpiredBefore(7).ids, []);
  assert.equal(
    db.db.prepare("SELECT COUNT(*) c FROM transcriptions WHERE id = ?").get(synced).c,
    1
  );
});
