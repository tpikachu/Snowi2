const test = require("node:test");
const assert = require("node:assert/strict");

async function load() {
  return await import("../../src/utils/memoryExtraction.ts");
}

const LABELS = { you: "You", them: "Them" };

test("every line carries the id the model must cite", async () => {
  const { formatSegmentsForExtraction } = await load();
  const out = formatSegmentsForExtraction(
    [
      { id: "7:seg-1", text: "Shall we start?", source: "mic" },
      { id: "7:seg-2", text: "Pricing first.", source: "system", speakerName: "Dana" },
    ],
    LABELS
  );

  assert.equal(out, "[7:seg-1] You: Shall we start?\n[7:seg-2] Dana: Pricing first.");
});

test("truncation keeps the end of the meeting", async () => {
  const { formatSegmentsForExtraction } = await load();
  // Decisions, owners and next steps cluster at the end; a truncated head
  // costs less than a truncated conclusion.
  const segments = Array.from({ length: 50 }, (_, i) => ({
    id: `7:seg-${i}`,
    text: `line ${i} padded out to take up a reasonable amount of room`,
    source: "mic",
  }));

  const out = formatSegmentsForExtraction(segments, LABELS, 300);
  assert.ok(out.includes("seg-49"), "the last line must survive");
  assert.ok(!out.includes("seg-0]"), "the first line should have been dropped");
  assert.ok(out.length <= 300);
});

test("a bare JSON array parses", async () => {
  const { parseExtractionResponse } = await load();
  const objects = parseExtractionResponse(
    '[{"type":"decision","content":"Ship Friday","source_segments":["7:seg-3"],"confidence":0.9}]'
  );
  assert.equal(objects.length, 1);
  assert.equal(objects[0].content, "Ship Friday");
});

test("a fenced array parses", async () => {
  const { parseExtractionResponse } = await load();
  const objects = parseExtractionResponse(
    '```json\n[{"type":"decision","content":"Ship Friday","source_segments":["7:seg-3"]}]\n```'
  );
  assert.equal(objects.length, 1);
});

test("leading prose does not lose the array", async () => {
  const { parseExtractionResponse } = await load();
  const objects = parseExtractionResponse(
    'Here are the memory objects:\n[{"type":"risk","content":"Vendor may slip","source_segments":["7:seg-9"]}]'
  );
  assert.equal(objects.length, 1);
  assert.equal(objects[0].type, "risk");
});

test("a single object instead of an array is accepted", async () => {
  const { parseExtractionResponse } = await load();
  const objects = parseExtractionResponse(
    '{"type":"decision","content":"Ship Friday","source_segments":["7:seg-3"]}'
  );
  assert.equal(objects.length, 1);
});

test("junk yields nothing rather than throwing", async () => {
  const { parseExtractionResponse } = await load();
  for (const bad of ["", "   ", "I could not find anything.", "{", "null", "[1,2,3]", 42, null]) {
    assert.deepEqual(parseExtractionResponse(bad), [], `input ${JSON.stringify(bad)}`);
  }
});

test("entries missing type or content are discarded, the rest survive", async () => {
  const { parseExtractionResponse } = await load();
  const objects = parseExtractionResponse(
    '[{"content":"no type"},{"type":"decision"},{"type":"decision","content":"kept"}]'
  );
  assert.deepEqual(
    objects.map((o) => o.content),
    ["kept"]
  );
});

test("a hallucinated segment id is stripped", async () => {
  const { pruneUnknownCitations } = await load();
  // This is the failure that matters: it would validate, be stored as
  // evidence, and resolve to nothing the first time the user clicked it.
  const pruned = pruneUnknownCitations(
    [{ type: "decision", content: "Ship Friday", source_segments: ["7:seg-3", "7:seg-999"] }],
    ["7:seg-3"]
  );
  assert.deepEqual(pruned[0].source_segments, ["7:seg-3"]);
});

test("an object left with no real evidence is dropped entirely", async () => {
  const { pruneUnknownCitations } = await load();
  const pruned = pruneUnknownCitations(
    [
      { type: "decision", content: "Invented", source_segments: ["7:seg-999"] },
      { type: "decision", content: "Real", source_segments: ["7:seg-1"] },
    ],
    new Set(["7:seg-1"])
  );
  assert.deepEqual(
    pruned.map((o) => o.content),
    ["Real"]
  );
});

test("a missing source_segments field does not throw", async () => {
  const { pruneUnknownCitations } = await load();
  assert.deepEqual(pruneUnknownCitations([{ type: "decision", content: "x" }], ["7:seg-1"]), []);
});

test("the prompt names every §19.2 type and demands citations", async () => {
  const { MEMORY_EXTRACTION_PROMPT } = await load();
  for (const type of [
    "decision",
    "action_item",
    "commitment",
    "deadline",
    "project_fact",
    "person_fact",
    "preference",
    "risk",
    "open_question",
  ]) {
    assert.ok(MEMORY_EXTRACTION_PROMPT.includes(type), `prompt should name ${type}`);
  }
  assert.match(MEMORY_EXTRACTION_PROMPT, /MUST cite at least one segment id/);
});
