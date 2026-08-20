// A read-only window onto the SQLite file, for development only.
//
// Two things make this safe enough to exist:
//
//   1. It opens its OWN connection with `readonly: true`. SQLite itself refuses
//      the write, so there is no list of dangerous statements to keep in sync
//      and no regex to outsmart. `DROP TABLE` fails in the engine, not here.
//   2. ipcHandlers only registers it when `!app.isPackaged`. That check cannot
//      be flipped from `.env` the way NODE_ENV can, and it matters: this file
//      holds live OAuth refresh tokens, so an arbitrary-SQL channel in a
//      shipped build would hand the whole database to anything that reached
//      the renderer.
//
// Redaction (below) is a guard rail, not a boundary. It stops a token landing
// in a screenshot while someone browses; it does not stop someone who sets out
// to read one.

const Database = require("better-sqlite3");
const debugLogger = require("./debugLogger");

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
// Transcripts run to tens of thousands of characters. Whole ones would make
// every page a multi-megabyte IPC message to render as one unreadable cell.
const MAX_CELL_CHARS = 400;

/**
 * Columns whose values are credentials. Keyed by the table the value comes
 * *from*, not the name it is selected as — better-sqlite3 reports each result
 * column's origin, so `SELECT refresh_token AS x` is still caught.
 */
const REDACTED_COLUMNS = {
  google_calendar_tokens: new Set(["access_token", "refresh_token"]),
  microsoft_calendar_tokens: new Set(["access_token", "refresh_token"]),
};

const REDACTION_MARKER = "<redacted>";

/**
 * Tables whose rows are only half the record. Shown beside the table so nobody
 * concludes the data was lost when it is merely somewhere else.
 */
const TABLE_NOTES = {
  memory_objects:
    "Content, owner and source_segments are NOT here — §21.1 seals them per meeting in the " +
    "encrypted store. These columns are the indexed half: enums, dates and a one-way hash.",
  notes_fts: "FTS5 index over notes. Rebuilt by trigger; not a source of truth.",
  google_calendar_tokens: "Token columns are redacted in this view.",
  microsoft_calendar_tokens: "Token columns are redacted in this view.",
};

function isRedacted(originTable, columnName) {
  const columns = REDACTED_COLUMNS[originTable];
  return Boolean(columns && columns.has(columnName));
}

/**
 * One SQLite value as something a table cell can render and IPC can carry.
 * Returns the marker shape rather than a bare string so the UI can style a
 * truncated or elided value differently from text that happens to say "<blob>".
 */
function formatCell(value, { redact = false } = {}) {
  if (redact) return { kind: "redacted", text: REDACTION_MARKER };
  if (value === null || value === undefined) return { kind: "null" };
  if (Buffer.isBuffer(value)) return { kind: "blob", text: `${value.length} bytes` };
  // better-sqlite3 only yields BigInt under safeIntegers, but a value React
  // cannot render is worth one line to rule out.
  if (typeof value === "bigint") return { kind: "text", text: value.toString() };
  if (typeof value === "number" || typeof value === "boolean") {
    return { kind: "text", text: String(value) };
  }

  const text = String(value);
  if (text.length > MAX_CELL_CHARS) {
    return {
      kind: "text",
      text: text.slice(0, MAX_CELL_CHARS),
      truncated: true,
      full: text.length,
    };
  }
  return { kind: "text", text };
}

function clampLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function clampOffset(offset) {
  const n = Number(offset);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * fts5 keeps its b-tree in shadow tables (`notes_fts_data`, `_idx`, `_config`
 * …). They are real rows in sqlite_master and pure noise in a table list, so
 * anything prefixed with a virtual table's name is dropped.
 */
function partitionTables(rows) {
  const virtualNames = rows
    .filter((row) => /^\s*CREATE\s+VIRTUAL\s+TABLE/i.test(row.sql || ""))
    .map((row) => row.name);

  return rows
    .filter((row) => !row.name.startsWith("sqlite_"))
    .filter((row) => !virtualNames.some((v) => row.name !== v && row.name.startsWith(`${v}_`)))
    .map((row) => ({
      name: row.name,
      virtual: virtualNames.includes(row.name),
    }));
}

function createDevDbExplorer({ databasePath }) {
  let db = null;

  /**
   * Opened lazily and kept: WAL allows concurrent readers, so this coexists
   * with the app's writable connection. Reopened if a previous open failed.
   */
  function connection() {
    if (db && db.open) return db;
    db = new Database(databasePath, { readonly: true, fileMustExist: true });
    return db;
  }

  function close() {
    try {
      db?.close();
    } catch {
      // closing an already-closed handle is not worth surfacing
    }
    db = null;
  }

  /** Every table, with its row count and column definitions. */
  function listTables() {
    const conn = connection();
    const tables = partitionTables(
      conn.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name").all()
    );

    const described = tables.map(({ name, virtual }) => {
      let rows = null;
      try {
        // Identifier, not a bindable parameter. The name came from
        // sqlite_master, so it exists; quoting handles the rest.
        rows = conn.prepare(`SELECT COUNT(*) AS n FROM "${name.replace(/"/g, '""')}"`).get().n;
      } catch (error) {
        // A corrupt fts index makes COUNT throw. The table still belongs in
        // the list — losing the count is better than losing the row.
        debugLogger.warn("Row count failed", { table: name, error: error.message }, "devDb");
      }

      const columns = conn.pragma(`table_info("${name.replace(/"/g, '""')}")`).map((column) => ({
        name: column.name,
        type: column.type || "",
        notNull: Boolean(column.notnull),
        primaryKey: Boolean(column.pk),
        defaultValue: column.dflt_value,
        redacted: isRedacted(name, column.name),
      }));

      return { name, virtual, rows, columns, note: TABLE_NOTES[name] || null };
    });

    return {
      path: databasePath,
      schemaVersion: conn.pragma("user_version", { simple: true }),
      tables: described,
    };
  }

  /** One page of a table, newest first when the table has an obvious ordering. */
  function readTable(table, options = {}) {
    const conn = connection();
    const known = conn
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name = ?")
      .get(table);
    if (!known) throw new Error(`No such table: ${table}`);

    const quoted = `"${table.replace(/"/g, '""')}"`;
    const limit = clampLimit(options.limit);
    const offset = clampOffset(options.offset);

    const columns = conn.pragma(`table_info(${quoted})`).map((c) => c.name);
    const orderBy = columns.includes(options.orderBy) ? options.orderBy : null;
    const direction = options.direction === "asc" ? "ASC" : "DESC";
    const orderClause = orderBy ? ` ORDER BY "${orderBy.replace(/"/g, '""')}" ${direction}` : "";

    const total = conn.prepare(`SELECT COUNT(*) AS n FROM ${quoted}`).get().n;
    const rows = conn
      .prepare(`SELECT * FROM ${quoted}${orderClause} LIMIT ? OFFSET ?`)
      .raw()
      .all(limit, offset);

    const redactedAt = columns.map((column) => isRedacted(table, column));

    return {
      table,
      columns,
      total,
      limit,
      offset,
      orderBy,
      direction: orderBy ? direction.toLowerCase() : null,
      note: TABLE_NOTES[table] || null,
      rows: rows.map((row) => row.map((value, i) => formatCell(value, { redact: redactedAt[i] }))),
    };
  }

  /**
   * An arbitrary statement. The connection is read-only, so a write fails in
   * SQLite; `reader` is checked first only to give a clearer message than
   * "attempt to write a readonly database".
   */
  function runQuery(sql, options = {}) {
    const conn = connection();
    const limit = clampLimit(options.limit);
    const statement = conn.prepare(String(sql || "").trim());

    if (!statement.reader) {
      throw new Error("This view runs read-only queries. Use a SELECT (or PRAGMA) statement.");
    }

    // Origin table/column, so an alias cannot rename a token column out of
    // redaction. Both are null for computed columns, which fall back to the
    // result name and are therefore not redacted — see the header comment.
    const meta = statement.columns();
    const columns = meta.map((c) => c.name);
    const redactedAt = meta.map((c) => isRedacted(c.table, c.column ?? c.name));

    // Iterated, not `.all()`: an unbounded SELECT over meeting_segments would
    // otherwise pull every row into memory before the limit is applied. One
    // row past the limit is fetched so "there were more" can be reported
    // without counting an arbitrary statement a second time.
    const rows = [];
    for (const row of statement.raw().iterate()) {
      rows.push(row);
      if (rows.length > limit) break;
    }
    const truncated = rows.length > limit;
    const page = truncated ? rows.slice(0, limit) : rows;

    return {
      columns,
      returned: page.length,
      truncated,
      limit,
      rows: page.map((row) => row.map((value, i) => formatCell(value, { redact: redactedAt[i] }))),
    };
  }

  return { listTables, readTable, runQuery, close };
}

module.exports = {
  createDevDbExplorer,
  // exported for tests
  formatCell,
  partitionTables,
  isRedacted,
  clampLimit,
  clampOffset,
  REDACTED_COLUMNS,
  MAX_CELL_CHARS,
  MAX_LIMIT,
  DEFAULT_LIMIT,
};
