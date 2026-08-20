const test = require("node:test");
const assert = require("node:assert/strict");
const { createDb } = require("./harness/db.js");

/**
 * The rename that fixes "Personal > Personal". Every assertion here is about a
 * guard: the migration runs on every launch, so anything it touches that it
 * should not, it touches forever.
 */

function addFolder(db, name, { isDefault = 1, spaceId = null } = {}) {
  const result = db.db
    .prepare("INSERT INTO folders (name, is_default, sort_order, space_id) VALUES (?, ?, 0, ?)")
    .run(name, isDefault, spaceId);
  return Number(result.lastInsertRowid);
}

function folderName(db, id) {
  return db.db.prepare("SELECT name FROM folders WHERE id = ?").get(id)?.name;
}

test("renames the inherited default folders", (t) => {
  const db = createDb(t);
  if (!db) return;

  db.db.prepare("DELETE FROM folders").run();
  const personal = addFolder(db, "Personal");
  const videos = addFolder(db, "Videos");

  db._renameLegacyContainers();

  assert.equal(folderName(db, personal), "Notes");
  assert.equal(folderName(db, videos), "Uploads");
});

test("never renames a folder the user made themselves", (t) => {
  const db = createDb(t);
  if (!db) return;

  db.db.prepare("DELETE FROM folders").run();
  // Same name, but is_default = 0: someone deliberately created this.
  const mine = addFolder(db, "Personal", { isDefault: 0 });

  db._renameLegacyContainers();

  assert.equal(folderName(db, mine), "Personal");
});

test("does not create a duplicate when the destination already exists", (t) => {
  const db = createDb(t);
  if (!db) return;

  db.db.prepare("DELETE FROM folders").run();
  const legacy = addFolder(db, "Personal");
  addFolder(db, "Notes", { isDefault: 0 });

  db._renameLegacyContainers();

  // Two folders called "Notes" in one space is worse than one called
  // "Personal": the user cannot tell them apart, and routing picks by name.
  assert.equal(folderName(db, legacy), "Personal");
  const notes = db.db.prepare("SELECT COUNT(*) AS n FROM folders WHERE name = 'Notes'").get();
  assert.equal(notes.n, 1);
});

test("renames the private space, but only while it still has the old name", (t) => {
  const db = createDb(t);
  if (!db) return;

  db.db.prepare("UPDATE spaces SET name = 'Personal' WHERE kind = 'private'").run();
  db._renameLegacyContainers();
  assert.equal(
    db.db.prepare("SELECT name FROM spaces WHERE kind = 'private'").get().name,
    "My Workspace"
  );

  // Someone who renamed their own space keeps that name forever, not just
  // until the next launch.
  db.db.prepare("UPDATE spaces SET name = 'Acme' WHERE kind = 'private'").run();
  db._renameLegacyContainers();
  assert.equal(db.db.prepare("SELECT name FROM spaces WHERE kind = 'private'").get().name, "Acme");
});

test("is a no-op when run again", (t) => {
  const db = createDb(t);
  if (!db) return;

  db.db.prepare("DELETE FROM folders").run();
  const personal = addFolder(db, "Personal");

  db._renameLegacyContainers();
  const afterFirst = folderName(db, personal);
  db._renameLegacyContainers();
  db._renameLegacyContainers();

  assert.equal(folderName(db, personal), afterFirst);
  assert.equal(db.db.prepare("SELECT COUNT(*) AS n FROM folders").get().n, 1);
});

test("fresh installs seed the meeting-first folders, and only those", (t) => {
  const db = createDb(t);
  if (!db) return;

  const names = db.db
    .prepare("SELECT name FROM folders WHERE is_default = 1 ORDER BY sort_order")
    .all()
    .map((row) => row.name);

  // The user_version 1 migration seeds a downloads folder too. It has to
  // recognise the renamed one, or a fresh install ends up with both Uploads
  // and Videos and the rename refuses to merge them.
  assert.deepEqual(names, ["Meetings", "Notes", "Uploads"]);
});

test("an install that still calls it Videos does not gain a second folder", (t) => {
  const db = createDb(t);
  if (!db) return;

  // Reproduce a pre-rename install: legacy names, migration not yet run.
  db.db.prepare("DELETE FROM folders").run();
  addFolder(db, "Personal");
  addFolder(db, "Videos");
  db.db.pragma("user_version = 0");

  // Closed first: initDatabase opens a fresh connection, and the leaked handle
  // stops the harness removing its temp directory on Windows.
  db.db.close();
  db.initDatabase();

  const names = db.db
    .prepare("SELECT name FROM folders ORDER BY sort_order")
    .all()
    .map((row) => row.name);

  assert.deepEqual(names.filter((n) => n === "Uploads").length, 1, "exactly one downloads folder");
  assert.equal(names.includes("Videos"), false, "the old one was renamed, not left beside it");
  assert.equal(names.includes("Notes"), true);
});

test("the rename runs only after folders.space_id exists", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(
    path.join(__dirname, "..", "..", "src", "helpers", "database.js"),
    "utf8"
  );

  const addsColumn = source.indexOf("ALTER TABLE folders ADD COLUMN space_id");
  const renames = source.indexOf("this._renameLegacyContainers();");

  // The duplicate guard compares folders per space. Called before the column
  // is added, the whole statement throws "no such column: other.space_id" —
  // and because the rename catches its own errors, it does nothing at all
  // while looking like it ran.
  assert.ok(addsColumn > 0, "the space_id migration is still there");
  assert.ok(renames > addsColumn, "the rename must come after the column it reads");
});
