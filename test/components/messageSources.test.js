const test = require("node:test");
const assert = require("node:assert/strict");

async function load() {
  return await import("../../src/components/chat/messageSources.ts");
}

const RETRIEVED = [
  { noteId: 3, title: "Q3 planning", snippet: "revenue projections for Q3" },
  { noteId: 7, title: "Vendor sync", snippet: "pricing was renegotiated" },
  { noteId: 9, title: "Standup" },
];

test("lists exactly the cited notes, in citation order", async () => {
  const { resolveMessageSources } = await load();
  const { items, cited } = resolveMessageSources(RETRIEVED, undefined, [7, 3], "Untitled");

  assert.equal(cited, true);
  assert.deepEqual(
    items.map((i) => i.noteId),
    [7, 3]
  );
});

test("falls back to what was retrieved when the model cited nothing", async () => {
  const { resolveMessageSources } = await load();
  // A small local model often ignores the citation format. It still helps the
  // user to see what was searched — but the caller must be told these were not
  // cited, so the UI does not claim the answer used them.
  const { items, cited } = resolveMessageSources(RETRIEVED, undefined, [], "Untitled");

  assert.equal(cited, false);
  assert.equal(items.length, 3);
});

test("merges tool-touched notes with retrieved ones, retrieved copy winning", async () => {
  const { resolveMessageSources } = await load();
  const toolCalls = [
    {
      id: "t1",
      name: "search_notes",
      arguments: "{}",
      status: "completed",
      metadata: [
        { id: 7, title: "Vendor sync (stale title)" },
        { id: 21, title: "Roadmap" },
      ],
    },
  ];
  const { items } = resolveMessageSources(RETRIEVED, toolCalls, [], "Untitled");

  const ids = items.map((i) => i.noteId);
  assert.ok(ids.includes(21), "a note only a tool found should still be listed");
  // The retrieved copy carries the passage that matched, so it must not be
  // overwritten by the tool hit's barer record.
  const vendor = items.find((i) => i.noteId === 7);
  assert.equal(vendor.title, "Vendor sync");
  assert.equal(vendor.snippet, "pricing was renegotiated");
});

test("a citation to a note with no record is skipped, not rendered blank", async () => {
  const { resolveMessageSources } = await load();
  const { items, cited } = resolveMessageSources(RETRIEVED, undefined, [999, 3], "Untitled");

  assert.equal(cited, true);
  assert.deepEqual(
    items.map((i) => i.noteId),
    [3]
  );
});

test("caps the uncited list so the strip cannot bury the answer", async () => {
  const { resolveMessageSources } = await load();
  const many = Array.from({ length: 8 }, (_, i) => ({ noteId: i + 1, title: `Note ${i + 1}` }));
  const { items } = resolveMessageSources(many, undefined, [], "Untitled");

  assert.equal(items.length, 5);
});

test("returns nothing when there was no grounding at all", async () => {
  const { resolveMessageSources } = await load();
  const { items, cited } = resolveMessageSources(undefined, undefined, [], "Untitled");

  assert.deepEqual(items, []);
  assert.equal(cited, false);
});
