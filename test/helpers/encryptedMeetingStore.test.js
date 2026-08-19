const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  createMeetingKeyService,
  SecureStorageUnavailableError,
  InvalidMeetingIdError,
} = require("../../src/helpers/meetingKeyService.js");
const { createEncryptedMeetingStore } = require("../../src/helpers/encryptedMeetingStore.js");
const { MeetingCryptoError } = require("../../src/helpers/meetingCrypto.js");

/**
 * Stands in for Electron `safeStorage`. The "encryption" is a reversible
 * transform — the point of these tests is the key hierarchy and the file
 * layout, not the OS keychain, which cannot run headless.
 */
function fakeSecureStorage({ available = true } = {}) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value) => Buffer.concat([Buffer.from("SS:"), Buffer.from(value, "utf8")]),
    decryptString: (buffer) => {
      const text = buffer.toString("utf8");
      if (!text.startsWith("SS:")) throw new Error("not a safeStorage blob");
      return text.slice(3);
    },
  };
}

function harness(options) {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "snowy-store-"));
  const keyService = createMeetingKeyService({
    baseDir,
    secureStorage: fakeSecureStorage(options),
  });
  const store = createEncryptedMeetingStore({ baseDir, keyService });
  return {
    baseDir,
    keyService,
    store,
    cleanup: () => fs.rmSync(baseDir, { recursive: true, force: true }),
  };
}

/** Every regular file under a directory, recursively. */
function walkFiles(directory) {
  const out = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else out.push(full);
    }
  };
  if (fs.existsSync(directory)) visit(directory);
  return out;
}

// ---------------------------------------------------------------- key service

test("fails closed when OS secure storage is unavailable", (t) => {
  const h = harness({ available: false });
  t.after(h.cleanup);

  assert.equal(h.keyService.isAvailable(), false);
  // §21.2: no plaintext fallback. A meeting must simply not be creatable.
  assert.throws(() => h.keyService.getInstallationKey(), SecureStorageUnavailableError);
  assert.throws(() => h.store.createMeeting("mtg_1"), SecureStorageUnavailableError);
  assert.equal(fs.existsSync(path.join(h.baseDir, "keys", "installation-key.bin")), false);
});

test("creates the installation key once and reuses it across services", (t) => {
  const h = harness();
  t.after(h.cleanup);

  const first = h.keyService.getInstallationKey();
  assert.equal(first.length, 32);

  const reopened = createMeetingKeyService({
    baseDir: h.baseDir,
    secureStorage: fakeSecureStorage(),
  });
  assert.deepEqual(reopened.getInstallationKey(), first);
});

test("never stores the installation key in the clear", (t) => {
  const h = harness();
  t.after(h.cleanup);

  const key = h.keyService.getInstallationKey();
  const onDisk = fs.readFileSync(path.join(h.baseDir, "keys", "installation-key.bin"));
  assert.equal(onDisk.includes(key), false);
  assert.equal(onDisk.subarray(0, 3).toString(), "SS:");
});

test("rejects meeting ids that could escape the meetings directory", (t) => {
  const h = harness();
  t.after(h.cleanup);

  for (const id of ["../escape", "a/b", "", "with space", "x".repeat(65), "..", "a\\b"]) {
    assert.throws(() => h.store.createMeeting(id), InvalidMeetingIdError, JSON.stringify(id));
  }
});

test("refuses to overwrite an existing meeting data key", (t) => {
  const h = harness();
  t.after(h.cleanup);

  h.store.createMeeting("mtg_1");
  // Clobbering the DEK would strand every blob already sealed under the old one.
  assert.throws(() => h.keyService.createMeetingKey("mtg_1"), /already has a data key/);
});

test("meeting keys differ per meeting and survive a cache drop", (t) => {
  const h = harness();
  t.after(h.cleanup);

  h.store.createMeeting("mtg_1");
  h.store.createMeeting("mtg_2");

  const first = h.keyService.getMeetingKey("mtg_1");
  assert.notDeepEqual(first, h.keyService.getMeetingKey("mtg_2"));

  h.keyService.forget();
  assert.deepEqual(h.keyService.getMeetingKey("mtg_1"), first);
});

// -------------------------------------------------------------------- layout

test("writes the §21.4 file layout", (t) => {
  const h = harness();
  t.after(h.cleanup);

  h.store.createMeeting("mtg_1");
  h.store.putObject("mtg_1", "manifest", { title: "Pricing sync" });
  h.store.putObject("mtg_1", "running-state", { current_topic: "Enterprise pricing" });
  h.store.putObject("mtg_1", "artifact", { schema_version: "snowi.meeting.v1" });
  h.store.putChunk("mtg_1", "audio", { track: "mic", sequence: 1, data: Buffer.from([1, 2, 3]) });
  h.store.putChunk("mtg_1", "audio", { track: "system", sequence: 1, data: Buffer.from([4]) });
  h.store.putChunk("mtg_1", "transcript", { track: "checkpoint", sequence: 1, data: "seg" });

  const relative = walkFiles(h.store.meetingDir("mtg_1"))
    .map((file) => path.relative(h.store.meetingDir("mtg_1"), file).split(path.sep).join("/"))
    .sort();

  assert.deepEqual(relative, [
    "artifact/snowi-meeting-v1.json.enc",
    "audio/mic-000001.enc",
    "audio/system-000001.enc",
    "keys/wrapped-dek.bin",
    "manifest.enc",
    "state/running-state.enc",
    "transcript/checkpoint-000001.enc",
  ]);
});

test("round-trips objects and chunks", (t) => {
  const h = harness();
  t.after(h.cleanup);

  h.store.createMeeting("mtg_1");
  const state = { current_topic: "Enterprise pricing", state_version: 7 };
  h.store.putObject("mtg_1", "running-state", state);
  assert.deepEqual(h.store.getObject("mtg_1", "running-state"), state);

  const audio = crypto.randomBytes(4096);
  h.store.putChunk("mtg_1", "audio", { track: "mic", sequence: 42, data: audio });
  assert.deepEqual(h.store.getChunk("mtg_1", "audio", { track: "mic", sequence: 42 }), audio);
});

test("missing objects and chunks read as null, not as an error", (t) => {
  const h = harness();
  t.after(h.cleanup);

  h.store.createMeeting("mtg_1");
  assert.equal(h.store.getObject("mtg_1", "artifact"), null);
  assert.equal(h.store.getChunk("mtg_1", "audio", { track: "mic", sequence: 1 }), null);
});

// §21.1: nothing readable may reach the disk.
test("no plaintext meeting content appears anywhere on disk", (t) => {
  const h = harness();
  t.after(h.cleanup);

  const secrets = ["Enterprise pricing", "per-seat pricing objection", "Acme Corp"];
  h.store.createMeeting("mtg_1");
  h.store.putObject("mtg_1", "manifest", { title: secrets[2] });
  h.store.putObject("mtg_1", "running-state", { current_topic: secrets[0] });
  h.store.putChunk("mtg_1", "transcript", { track: "checkpoint", sequence: 1, data: secrets[1] });

  for (const file of walkFiles(h.baseDir)) {
    const bytes = fs.readFileSync(file);
    for (const secret of secrets) {
      assert.equal(
        bytes.includes(Buffer.from(secret, "utf8")),
        false,
        `${secret} leaked into ${file}`
      );
    }
  }
});

test("lists chunk sequences per track, in order", (t) => {
  const h = harness();
  t.after(h.cleanup);

  h.store.createMeeting("mtg_1");
  for (const sequence of [3, 1, 2]) {
    h.store.putChunk("mtg_1", "audio", { track: "mic", sequence, data: "x" });
  }
  h.store.putChunk("mtg_1", "audio", { track: "system", sequence: 9, data: "y" });

  assert.deepEqual(h.store.listChunkSequences("mtg_1", "audio", "mic"), [1, 2, 3]);
  assert.deepEqual(h.store.listChunkSequences("mtg_1", "audio", "system"), [9]);
  assert.deepEqual(h.store.listChunkSequences("mtg_1", "transcript", "checkpoint"), []);
});

test("rejects unsafe track names and sequences", (t) => {
  const h = harness();
  t.after(h.cleanup);

  h.store.createMeeting("mtg_1");
  for (const track of ["../mic", "mic/../..", "MIC", "", "a b"]) {
    assert.throws(
      () => h.store.putChunk("mtg_1", "audio", { track, sequence: 1, data: "x" }),
      /invalid track name/,
      JSON.stringify(track)
    );
  }
  assert.throws(
    () => h.store.putChunk("mtg_1", "audio", { track: "mic", sequence: -1, data: "x" }),
    /non-negative integer/
  );
});

// A chunk moved to another sequence number must not read back — the sequence
// is authenticated, so on-disk reordering is detectable.
test("a chunk renamed to another sequence fails to open", (t) => {
  const h = harness();
  t.after(h.cleanup);

  h.store.createMeeting("mtg_1");
  h.store.putChunk("mtg_1", "audio", { track: "mic", sequence: 1, data: "first" });
  const audioDir = path.join(h.store.meetingDir("mtg_1"), "audio");
  fs.renameSync(path.join(audioDir, "mic-000001.enc"), path.join(audioDir, "mic-000002.enc"));

  assert.throws(
    () => h.store.getChunk("mtg_1", "audio", { track: "mic", sequence: 2 }),
    MeetingCryptoError
  );
});

// Same idea across meetings: one meeting's artifact cannot be passed off as another's.
test("an object copied into another meeting fails to open", (t) => {
  const h = harness();
  t.after(h.cleanup);

  h.store.createMeeting("mtg_1");
  h.store.createMeeting("mtg_2");
  h.store.putObject("mtg_1", "manifest", { title: "one" });

  fs.copyFileSync(
    path.join(h.store.meetingDir("mtg_1"), "manifest.enc"),
    path.join(h.store.meetingDir("mtg_2"), "manifest.enc")
  );
  assert.throws(() => h.store.getObject("mtg_2", "manifest"), MeetingCryptoError);
});

test("overwriting an object replaces it atomically, leaving no temp files", (t) => {
  const h = harness();
  t.after(h.cleanup);

  h.store.createMeeting("mtg_1");
  h.store.putObject("mtg_1", "running-state", { state_version: 1 });
  h.store.putObject("mtg_1", "running-state", { state_version: 2 });

  assert.deepEqual(h.store.getObject("mtg_1", "running-state"), { state_version: 2 });
  const strays = walkFiles(h.baseDir).filter((file) => file.endsWith(".tmp"));
  assert.deepEqual(strays, []);
});

// ------------------------------------------------------------------ lifecycle

test("reports usage and lists meetings", (t) => {
  const h = harness();
  t.after(h.cleanup);

  assert.deepEqual(h.store.listMeetingIds(), []);
  h.store.createMeeting("mtg_1");
  h.store.putChunk("mtg_1", "audio", { track: "mic", sequence: 1, data: crypto.randomBytes(1024) });

  assert.deepEqual(h.store.listMeetingIds(), ["mtg_1"]);
  assert.ok(h.store.usageBytes("mtg_1") > 1024);
  assert.equal(h.store.usageBytes("mtg_2"), 0);
});

test("deleting a meeting removes its files and its wrapped key", (t) => {
  const h = harness();
  t.after(h.cleanup);

  h.store.createMeeting("mtg_1");
  h.store.putObject("mtg_1", "manifest", { title: "gone" });

  h.store.deleteMeeting("mtg_1");

  assert.equal(h.store.exists("mtg_1"), false);
  assert.equal(h.keyService.hasMeetingKey("mtg_1"), false);
  assert.deepEqual(h.store.listMeetingIds(), []);
});

test("refuses to create a meeting twice", (t) => {
  const h = harness();
  t.after(h.cleanup);

  h.store.createMeeting("mtg_1");
  assert.throws(() => h.store.createMeeting("mtg_1"), /already exists/);
});
