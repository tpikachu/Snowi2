const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const { createDb } = require("./harness/db.js");
const { createMeetingKeyService } = require("../../src/helpers/meetingKeyService.js");
const { createEncryptedMeetingStore } = require("../../src/helpers/encryptedMeetingStore.js");
const { createMemoryStore, mintMeetingId } = require("../../src/helpers/memoryStore.js");

// Stands in for Electron safeStorage: the crypto under test is ours, not the OS
// keychain's, so a deterministic local cipher keeps the test hermetic.
function fakeSecureStorage() {
  const key = crypto.createHash("sha256").update("test-wrapping-key").digest();
  return {
    isEncryptionAvailable: () => true,
    encryptString: (plain) => {
      const iv = Buffer.alloc(16, 7);
      const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
      return Buffer.concat([cipher.update(Buffer.from(plain, "utf8")), cipher.final()]);
    },
    decryptString: (buf) => {
      const iv = Buffer.alloc(16, 7);
      const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
      return Buffer.concat([decipher.update(buf), decipher.final()]).toString("utf8");
    },
  };
}

function setup(t) {
  const database = createDb(t);
  if (!database) return null;

  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "snowi-memory-"));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  const keyService = createMeetingKeyService({ baseDir, secureStorage: fakeSecureStorage() });
  const store = createEncryptedMeetingStore({ baseDir, keyService });
  const memory = createMemoryStore({ database, store });
  const { note } = database.saveNote("Vendor review", "", "meeting");

  return { database, memory, baseDir, noteId: note.id, meetingId: mintMeetingId() };
}

function object(overrides = {}) {
  return {
    type: "action_item",
    content: "Send the revised pricing proposal",
    subject: "user",
    owner: "Dana Ruiz",
    source_segments: ["1:seg-12"],
    confidence: 0.9,
    ...overrides,
  };
}

test("an ingested object is queryable and its content round-trips", (t) => {
  const ctx = setup(t);
  if (!ctx) return;

  const summary = ctx.memory.ingest({
    meetingId: ctx.meetingId,
    noteId: ctx.noteId,
    objects: [object({ due_at: "2026-08-25T17:00:00Z" })],
  });

  assert.equal(summary.inserted, 1);
  const [row] = ctx.memory.listForNote(ctx.noteId);
  assert.equal(row.content, "Send the revised pricing proposal");
  assert.equal(row.owner, "Dana Ruiz");
  assert.deepEqual(row.source_segments, ["1:seg-12"]);
  assert.equal(row.due_at, "2026-08-25T17:00:00Z");
  assert.equal(row.sync_status, "local_only");
});

test("the claim never touches the database in plaintext", (t) => {
  const ctx = setup(t);
  if (!ctx) return;

  ctx.memory.ingest({
    meetingId: ctx.meetingId,
    noteId: ctx.noteId,
    objects: [object({ content: "PRICING-SECRET-40K", owner: "OWNER-SECRET" })],
  });

  // §21.1. Read the file itself: an ORM-level assertion would only prove the
  // column is absent from a SELECT, not that the bytes are absent from disk.
  const raw = fs.readFileSync(ctx.database.db.name);
  assert.equal(raw.includes(Buffer.from("PRICING-SECRET-40K")), false);
  assert.equal(raw.includes(Buffer.from("OWNER-SECRET")), false);
});

test("the sealed document is not readable on disk either", (t) => {
  const ctx = setup(t);
  if (!ctx) return;

  ctx.memory.ingest({
    meetingId: ctx.meetingId,
    noteId: ctx.noteId,
    objects: [object({ content: "PRICING-SECRET-40K" })],
  });

  const file = path.join(ctx.baseDir, "meetings", ctx.meetingId, "memory", "memory-v1.json.enc");
  assert.ok(fs.existsSync(file), "the sealed document should have been written");
  assert.equal(fs.readFileSync(file).includes(Buffer.from("PRICING-SECRET-40K")), false);
});

test("open commitments answer from the index, without decrypting anything", (t) => {
  const ctx = setup(t);
  if (!ctx) return;

  ctx.memory.ingest({
    meetingId: ctx.meetingId,
    noteId: ctx.noteId,
    objects: [
      object({ content: "Later task", due_at: "2026-12-01T00:00:00Z" }),
      object({ content: "Sooner task", due_at: "2026-08-20T00:00:00Z" }),
      object({ type: "decision", content: "Chose the annual plan" }),
    ],
  });

  const open = ctx.database.getOpenMemoryActions("user");
  assert.deepEqual(
    open.map((r) => r.due_at),
    ["2026-08-20T00:00:00Z", "2026-12-01T00:00:00Z"],
    "soonest first"
  );
  assert.equal(open.every((r) => r.content === undefined), true, "the index carries no content");
});

test("a fact restated in a later meeting supersedes rather than duplicates", (t) => {
  const ctx = setup(t);
  if (!ctx) return;

  const fact = { type: "project_fact", subject: "other", content: "Pricing is $40k", owner: null };
  ctx.memory.ingest({ meetingId: ctx.meetingId, noteId: ctx.noteId, objects: [object(fact)] });

  const second = mintMeetingId();
  const { note } = ctx.database.saveNote("Follow-up", "", "meeting");
  const summary = ctx.memory.ingest({
    meetingId: second,
    noteId: note.id,
    objects: [object({ ...fact, content: "Pricing is $55k" })],
  });

  assert.equal(summary.superseded, 1);
  const [old] = ctx.memory.listForNote(ctx.noteId);
  assert.equal(old.status, "superseded");
  assert.ok(old.superseded_by, "the replacement is recorded, so history stays traceable");
});

test("the identical fact twice stores one row and records the sighting", (t) => {
  const ctx = setup(t);
  if (!ctx) return;

  const fact = object({ type: "project_fact", subject: "other", content: "Pricing is $40k" });
  ctx.memory.ingest({ meetingId: ctx.meetingId, noteId: ctx.noteId, objects: [fact] });

  const second = mintMeetingId();
  const { note } = ctx.database.saveNote("Follow-up", "", "meeting");
  const summary = ctx.memory.ingest({ meetingId: second, noteId: note.id, objects: [fact] });

  assert.equal(summary.duplicates, 1);
  assert.equal(summary.inserted, 0);
  assert.equal(ctx.memory.listForNote(note.id).length, 0, "no second row for one fact");
});

test("unsourced and low-confidence objects are rejected, the rest of the batch survives", (t) => {
  const ctx = setup(t);
  if (!ctx) return;

  const summary = ctx.memory.ingest({
    meetingId: ctx.meetingId,
    noteId: ctx.noteId,
    objects: [
      object({ source_segments: [] }),
      object({ type: "person_fact", confidence: 0.7, content: "Works in Berlin" }),
      object({ content: "A real commitment" }),
    ],
  });

  assert.equal(summary.inserted, 1);
  assert.deepEqual(summary.rejected, ["no_source_segments", "low_confidence"]);
});

test("deleting the note takes its memory rows with it", (t) => {
  const ctx = setup(t);
  if (!ctx) return;

  ctx.memory.ingest({ meetingId: ctx.meetingId, noteId: ctx.noteId, objects: [object()] });
  ctx.database.db.prepare("DELETE FROM notes WHERE id = ?").run(ctx.noteId);

  assert.deepEqual(ctx.memory.listForNote(ctx.noteId), []);
});

test("a row whose content cannot be decrypted still reports itself honestly", (t) => {
  const ctx = setup(t);
  if (!ctx) return;

  ctx.memory.ingest({
    meetingId: ctx.meetingId,
    noteId: ctx.noteId,
    objects: [object({ due_at: "2026-08-25T17:00:00Z" })],
  });
  // A restored backup without its keys, or a cleared keychain.
  fs.rmSync(path.join(ctx.baseDir, "meetings", ctx.meetingId, "memory", "memory-v1.json.enc"), {
    force: true,
  });

  const [row] = ctx.memory.listForNote(ctx.noteId);
  assert.equal(row.content, null);
  assert.equal(row.content_available, false);
  // The commitment and its deadline are still real and still known.
  assert.equal(row.due_at, "2026-08-25T17:00:00Z");
});
