const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer } = require("../lib/rendererTestHarness");

async function load(t) {
  const vite = await createRendererServer(t, { cachePrefix: "snowy-chat-context-" });
  return await vite.ssrLoadModule("/services/chatContext.ts");
}

function anchor(overrides = {}) {
  return {
    noteId: 42,
    folderId: 7,
    title: "Acme kickoff",
    content: "Agreed to start in September.",
    transcript: "You: shall we start?\nOthers: september works.",
    ...overrides,
  };
}

test("every surface has a contract, and unknown surfaces read as global chat", async (t) => {
  const { CHAT_CONTEXT_CONTRACTS, contractFor } = await load(t);

  for (const surface of ["chat-view", "agent-overlay", "container-chat", "note-chat"]) {
    assert.ok(CHAT_CONTEXT_CONTRACTS[surface], `${surface} has a contract`);
  }
  assert.equal(contractFor("chat-view").commitments, "global");
  assert.equal(contractFor("container-chat").commitments, "container");
  assert.equal(contractFor("note-chat").commitments, "note");
  // The fallback assumes least: an unnamed surface behaves like global chat
  // rather than inheriting some other surface's scoped slice.
  assert.deepEqual(contractFor("something-new"), contractFor("chat-view"));
  assert.deepEqual(contractFor(undefined), contractFor("chat-view"));
});

test("a small note is pinned whole, structure lines included", async (t) => {
  const { buildNoteAnchorText } = await load(t);

  const built = buildNoteAnchorText(anchor());
  assert.equal(built.truncated, false);
  // The id lines are what let the model call get_note / update_note directly.
  assert.match(built.text, /^Note ID: 42\nFolder ID: 7\nTitle: Acme kickoff/);
  assert.match(built.text, /Content:\nAgreed to start in September\./);
  assert.match(built.text, /Transcript:\nYou: shall we start\?/);
});

test("a long transcript is pinned as a tail and says where the rest lives", async (t) => {
  const { buildNoteAnchorText, NOTE_ANCHOR_TRANSCRIPT_MAX } = await load(t);

  const transcript = `${"early words ".repeat(500)}THE FINAL EXCHANGE`;
  const built = buildNoteAnchorText(anchor({ transcript }));

  assert.equal(built.truncated, true);
  // The tail is the part a follow-up question quotes; the head used to be
  // re-sent whole on every turn of a 90-minute meeting's chat.
  assert.ok(built.text.endsWith("THE FINAL EXCHANGE"));
  assert.match(built.text, /final part only — search_notes finds earlier passages/);
  const shown = built.text.split(/Transcript \(final part only[^\n]*\n/)[1];
  assert.ok(shown.length <= NOTE_ANCHOR_TRANSCRIPT_MAX);
});

test("overlong content is cut and the model is told how to get the rest", async (t) => {
  const { buildNoteAnchorText, NOTE_ANCHOR_CONTENT_MAX } = await load(t);

  const built = buildNoteAnchorText(anchor({ content: "x".repeat(NOTE_ANCHOR_CONTENT_MAX + 10) }));
  assert.equal(built.truncated, true);
  assert.match(built.text, /Content truncated\. Use get_note/);
  assert.ok(!built.text.includes("x".repeat(NOTE_ANCHOR_CONTENT_MAX + 1)));
});

test("a note without transcript pins no transcript block", async (t) => {
  const { buildNoteAnchorText } = await load(t);

  const built = buildNoteAnchorText(anchor({ transcript: null }));
  assert.ok(!built.text.includes("Transcript"));
  assert.equal(built.truncated, false);
});

test("retrieved hits on a whole anchor are duplication; on a truncated one, the missing pages", async (t) => {
  const { dedupeAgainstAnchor } = await load(t);

  const hits = [
    { noteId: 42, title: "Acme kickoff", snippet: "from the anchored note" },
    { noteId: 9, title: "Other note", snippet: "elsewhere" },
  ];

  assert.deepEqual(
    dedupeAgainstAnchor(hits, 42, false).map((n) => n.noteId),
    [9],
    "anchor pinned whole: its own passages add nothing"
  );
  assert.deepEqual(
    dedupeAgainstAnchor(hits, 42, true).map((n) => n.noteId),
    [42, 9],
    "anchor truncated: its passages carry what was cut"
  );
  assert.deepEqual(
    dedupeAgainstAnchor(hits, null, false).map((n) => n.noteId),
    [42, 9],
    "no anchor: nothing to dedupe against"
  );
});
