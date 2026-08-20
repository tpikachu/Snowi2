const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { skipOrFail } = require("./harness/db.js");

const {
  createDevDbExplorer,
  formatCell,
  partitionTables,
  isRedacted,
  clampLimit,
  clampOffset,
  MAX_CELL_CHARS,
  MAX_LIMIT,
  DEFAULT_LIMIT,
} = require("../../src/helpers/devDbExplorer.js");

/**
 * The explorer's whole safety claim is "SQLite refuses the write", so the
 * write-rejection tests are the ones that matter most here.
 */

// A plain SQLite file, no DatabaseManager: these tests are about the explorer,
// not the app schema.
function createFixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "snowy-devdb-"));
  const dbPath = path.join(dir, "fixture.db");

  let Database;
  try {
    Database = require("better-sqlite3");
    const seed = new Database(dbPath);
    seed.exec(`
      CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT, body TEXT, blob BLOB);
      CREATE TABLE google_calendar_tokens (
        id INTEGER PRIMARY KEY, google_email TEXT, access_token TEXT, refresh_token TEXT
      );
      CREATE VIRTUAL TABLE notes_fts USING fts5(title, body);
    `);
    seed.prepare("INSERT INTO notes (title, body, blob) VALUES (?, ?, ?)").run("one", null, null);
    seed.prepare("INSERT INTO notes (title, body, blob) VALUES (?, ?, ?)").run("two", "b", null);
    seed
      .prepare(
        "INSERT INTO google_calendar_tokens (google_email, access_token, refresh_token) VALUES (?, ?, ?)"
      )
      .run("a@example.com", "ya29.SECRET", "1//SECRET");
    seed.pragma("user_version = 7");
    seed.close();
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    skipOrFail(t, error);
    return null;
  }

  const explorer = createDevDbExplorer({ databasePath: dbPath });
  t.after(() => {
    explorer.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { explorer, dbPath };
}

test("refuses every write, because the connection is read-only", (t) => {
  const fixture = createFixture(t);
  if (!fixture) return;

  for (const sql of [
    "DELETE FROM notes",
    "DROP TABLE notes",
    "UPDATE notes SET title = 'x'",
    "INSERT INTO notes (title) VALUES ('x')",
    "CREATE TABLE evil (id INTEGER)",
  ]) {
    assert.throws(() => fixture.explorer.runQuery(sql), new RegExp("read", "i"), sql);
  }

  // Still there: the rejection happened before anything ran.
  assert.equal(fixture.explorer.readTable("notes").total, 2);
});

test("a write hidden in a CTE is refused too", (t) => {
  const fixture = createFixture(t);
  if (!fixture) return;

  // The point of leaning on SQLite rather than inspecting the string: this
  // starts with WITH, and a naive "does it start with SELECT" check passes it.
  assert.throws(() =>
    fixture.explorer.runQuery("WITH x AS (SELECT 1) DELETE FROM notes WHERE id IN (SELECT 1)")
  );
  assert.equal(fixture.explorer.readTable("notes").total, 2);
});

test("redacts token columns when browsing", (t) => {
  const fixture = createFixture(t);
  if (!fixture) return;

  const page = fixture.explorer.readTable("google_calendar_tokens");
  const row = page.rows[0];
  const at = page.columns.indexOf("access_token");
  const rt = page.columns.indexOf("refresh_token");
  const email = page.columns.indexOf("google_email");

  assert.equal(row[at].kind, "redacted");
  assert.equal(row[rt].kind, "redacted");
  assert.equal(JSON.stringify(page).includes("SECRET"), false);
  // The row is still worth showing — only the credential is withheld.
  assert.equal(row[email].text, "a@example.com");
});

test("an alias does not smuggle a token past redaction", (t) => {
  const fixture = createFixture(t);
  if (!fixture) return;

  const result = fixture.explorer.runQuery(
    "SELECT refresh_token AS harmless FROM google_calendar_tokens"
  );
  assert.equal(result.columns[0], "harmless");
  assert.equal(result.rows[0][0].kind, "redacted");
});

test("caps an unbounded query instead of loading the table", (t) => {
  const fixture = createFixture(t);
  if (!fixture) return;

  const result = fixture.explorer.runQuery("SELECT * FROM notes", { limit: 1 });
  assert.equal(result.rows.length, 1);
  assert.equal(result.truncated, true);

  const all = fixture.explorer.runQuery("SELECT * FROM notes", { limit: 10 });
  assert.equal(all.truncated, false);
  assert.equal(all.rows.length, 2);
});

test("lists real tables with counts, and hides fts shadow tables", (t) => {
  const fixture = createFixture(t);
  if (!fixture) return;

  const { tables, schemaVersion } = fixture.explorer.listTables();
  const names = tables.map((table) => table.name);

  assert.equal(schemaVersion, 7);
  assert.ok(names.includes("notes"));
  assert.ok(names.includes("notes_fts"), "the virtual table itself is useful");
  // notes_fts_data / _idx / _config are fts5 internals, not schema.
  assert.equal(
    names.some((name) => name.startsWith("notes_fts_")),
    false
  );
  assert.equal(tables.find((table) => table.name === "notes").rows, 2);
});

test("marks which columns are withheld, so the schema view is honest", (t) => {
  const fixture = createFixture(t);
  if (!fixture) return;

  const { tables } = fixture.explorer.listTables();
  const tokens = tables.find((table) => table.name === "google_calendar_tokens");
  const byName = Object.fromEntries(tokens.columns.map((c) => [c.name, c]));

  assert.equal(byName.refresh_token.redacted, true);
  assert.equal(byName.google_email.redacted, false);
  assert.equal(byName.id.primaryKey, true);
});

test("paginates without losing the total", (t) => {
  const fixture = createFixture(t);
  if (!fixture) return;

  const page = fixture.explorer.readTable("notes", { limit: 1, offset: 1 });
  assert.equal(page.total, 2, "total is the table's, not the page's");
  assert.equal(page.rows.length, 1);
});

test("rejects a table that is not in the schema", (t) => {
  const fixture = createFixture(t);
  if (!fixture) return;

  // The name is interpolated as an identifier, so a bad one must never reach
  // the query.
  assert.throws(() => fixture.explorer.readTable('notes"; DROP TABLE notes; --'), /No such table/);
  assert.equal(fixture.explorer.readTable("notes").total, 2);
});

test("only orders by a column the table actually has", (t) => {
  const fixture = createFixture(t);
  if (!fixture) return;

  const injected = fixture.explorer.readTable("notes", { orderBy: "id) --" });
  assert.equal(injected.orderBy, null, "an unknown column is dropped, not interpolated");

  const sorted = fixture.explorer.readTable("notes", { orderBy: "title", direction: "asc" });
  assert.equal(sorted.orderBy, "title");
  assert.equal(sorted.rows[0][sorted.columns.indexOf("title")].text, "one");
});

test("formatCell distinguishes null, blob and truncated text", () => {
  assert.equal(formatCell(null).kind, "null");
  assert.equal(formatCell(undefined).kind, "null");

  const blob = formatCell(Buffer.alloc(12));
  assert.equal(blob.kind, "blob");
  assert.match(blob.text, /12 bytes/);

  // Empty string is a value, not a null — the view must not conflate them.
  assert.deepEqual(formatCell(""), { kind: "text", text: "" });
  assert.deepEqual(formatCell(0), { kind: "text", text: "0" });

  const long = formatCell("x".repeat(MAX_CELL_CHARS + 50));
  assert.equal(long.truncated, true);
  assert.equal(long.text.length, MAX_CELL_CHARS);
  assert.equal(long.full, MAX_CELL_CHARS + 50);

  // BigInt would crash the renderer if it arrived unconverted.
  assert.deepEqual(formatCell(9007199254740993n), { kind: "text", text: "9007199254740993" });
});

test("clamps paging arguments to something a renderer can hold", () => {
  assert.equal(clampLimit(undefined), DEFAULT_LIMIT);
  assert.equal(clampLimit(0), DEFAULT_LIMIT);
  assert.equal(clampLimit(-5), DEFAULT_LIMIT);
  assert.equal(clampLimit("abc"), DEFAULT_LIMIT);
  assert.equal(clampLimit(1e9), MAX_LIMIT);
  assert.equal(clampLimit(10), 10);

  assert.equal(clampOffset(undefined), 0);
  assert.equal(clampOffset(-1), 0);
  assert.equal(clampOffset(25), 25);
});

test("partitionTables keeps a table that merely shares a prefix", () => {
  const rows = [
    { name: "notes", sql: "CREATE TABLE notes (id)" },
    { name: "notes_fts", sql: "CREATE VIRTUAL TABLE notes_fts USING fts5(title)" },
    { name: "notes_fts_data", sql: "CREATE TABLE notes_fts_data (id)" },
    { name: "sqlite_sequence", sql: "CREATE TABLE sqlite_sequence(name,seq)" },
  ];

  const names = partitionTables(rows).map((table) => table.name);
  assert.deepEqual(names, ["notes", "notes_fts"]);
  assert.equal(partitionTables(rows).find((t) => t.name === "notes_fts").virtual, true);
});

test("isRedacted covers both calendar providers and nothing else", () => {
  assert.equal(isRedacted("google_calendar_tokens", "refresh_token"), true);
  assert.equal(isRedacted("microsoft_calendar_tokens", "access_token"), true);
  assert.equal(isRedacted("notes", "refresh_token"), false, "keyed by table, not column name");
  assert.equal(isRedacted(null, "access_token"), false, "a computed column has no origin table");
});
