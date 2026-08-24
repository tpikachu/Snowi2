const REQUIRED_DB_FAILURE =
  "DB-backed tests were required (REQUIRE_DB_TESTS is set) but the better-sqlite3 native " +
  "binding could not be loaded, so this test would have been skipped instead of run. In CI " +
  "this almost always means the step that rebuilds better-sqlite3 for the runner's Node " +
  '("npm rebuild better-sqlite3", right after "npm ci --ignore-scripts") is missing or ' +
  "failed. Restore that step instead of deleting this check: without it every DB test " +
  "skips and the suite stays green with no database coverage. Underlying error: ";

function isNativeBindingUnavailable(error) {
  const message = String(error?.message || error);
  return (
    message.includes("NODE_MODULE_VERSION") ||
    message.includes("Could not locate the bindings file") ||
    message.includes("ERR_DLOPEN_FAILED") ||
    error?.code === "ERR_DLOPEN_FAILED"
  );
}

// Locally the binding is built for Electron's ABI, so a plain `node` run must skip. In CI the
// rebuild step makes it loadable, so a skip there means that step vanished and must fail.
function skipOrFail(t, error) {
  if (!isNativeBindingUnavailable(error)) {
    throw error;
  }
  if (process.env.REQUIRE_DB_TESTS) {
    throw new Error(REQUIRED_DB_FAILURE + String(error?.message || error), { cause: error });
  }
  t.skip("better-sqlite3 native binding is not available for this Node runtime");
}

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { installElectronStub, setUserDataDir } = require("./electronStub.js");

installElectronStub();
const DatabaseManager = require("../../../src/helpers/database.js");

// Everything one test opened, so it can all be released in one hook.
const openedByTest = new WeakMap();

/**
 * One cleanup hook per test: close every handle it opened, then remove the
 * directory they lived in.
 *
 * Deliberately not two hooks. Node runs `after` callbacks in the order they
 * were registered, so a directory removal registered by `createDb` would run
 * before a later `reopenDb`'s close — and on Windows, deleting a file SQLite
 * still has open fails with EPERM rather than being tolerated.
 */
function tracked(t) {
  const existing = openedByTest.get(t);
  if (existing) return existing;

  const entry = { dir: null, dbs: [] };
  openedByTest.set(t, entry);
  t.after(() => {
    for (const db of entry.dbs) {
      try {
        db.db?.close();
      } catch {
        // an already-closed handle must not mask the test's own failure
      }
    }
    if (entry.dir) {
      // Retries because a WAL sidecar can outlive close() by a moment on
      // Windows; without them this is a rare, confusing failure in teardown.
      fs.rmSync(entry.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
  });
  return entry;
}

// A real DatabaseManager over a private tmpdir. Returns null when the caller
// must bail because skipOrFail marked the test skipped.
function createDb(t) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "snowy-sync-harness-"));
  setUserDataDir(userDataDir);

  // Probe first: a binding failure here is the loader's, not schema setup's.
  try {
    const BetterSqlite = require("better-sqlite3");
    const probe = new BetterSqlite(path.join(userDataDir, "probe.db"));
    probe.close();
    fs.rmSync(path.join(userDataDir, "probe.db"), { force: true });
  } catch (error) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
    skipOrFail(t, error);
    return null;
  }

  let db;
  try {
    db = new DatabaseManager();
  } catch (error) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
    skipOrFail(t, error);
    return null;
  }

  const entry = tracked(t);
  entry.dir = userDataDir;
  entry.dbs.push(db);
  return db;
}

// A private userData dir with no database in it yet, for tests that lay down a
// legacy schema by hand and then let DatabaseManager migrate it. Tracked for
// cleanup like createDb's, so the hand-built database goes with it.
function createUserDataDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "snowy-sync-harness-"));
  setUserDataDir(dir);
  tracked(t).dir = dir;
  return dir;
}

// A second connection to the same userData dir, for tests that prove something
// survives a relaunch — a migration being idempotent, a rollback still being
// there after a restart. Registered for close like the first one, so "reopen"
// never quietly means "leak"; the caller is expected to have closed the
// previous handle first.
function reopenDb(t) {
  const db = new DatabaseManager();
  tracked(t).dbs.push(db);
  return db;
}

module.exports = {
  isNativeBindingUnavailable,
  skipOrFail,
  createDb,
  createUserDataDir,
  reopenDb,
};
