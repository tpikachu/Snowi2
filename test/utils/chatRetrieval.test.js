const test = require("node:test");
const assert = require("node:assert/strict");

async function load() {
  return await import("../../src/utils/chatRetrieval.ts");
}

test("a short follow-up is searched together with the previous turn", async () => {
  const { buildRetrievalQuery } = await load();
  // "the second one" names nothing on its own; the subject is in the lead-in.
  const query = buildRetrievalQuery(
    "what about the second one?",
    "what did we decide in the vendor review?"
  );
  assert.equal(query, "what did we decide in the vendor review?\nwhat about the second one?");
});

test("a self-contained question stands alone", async () => {
  const { buildRetrievalQuery } = await load();
  // By this length the user has restated the subject, and folding in history
  // only blurs the query away from what was actually asked.
  const current = "what did the pricing team commit to for the enterprise tier renewal";
  assert.equal(buildRetrievalQuery(current, "earlier unrelated question"), current);
});

test("no history and empty input are handled", async () => {
  const { buildRetrievalQuery } = await load();
  assert.equal(buildRetrievalQuery("what about it?"), "what about it?");
  assert.equal(buildRetrievalQuery("   ", "prior"), "");
});

test("keyword-only hits are never used as grounding", async () => {
  const { filterGrounding } = await load();
  // Meeting transcripts are full of ordinary words, so an unscored keyword hit
  // on "thanks" is exactly the match that should not reach the prompt.
  const kept = filterGrounding([
    { noteId: 1, title: "Standup" },
    { noteId: 2, title: "Vendor review", semanticScore: 0.62 },
  ]);
  assert.deepEqual(
    kept.map((n) => n.noteId),
    [2]
  );
});

test("weak semantic hits are dropped at the grounding bar", async () => {
  const { filterGrounding, MIN_GROUNDING_SCORE } = await load();
  const kept = filterGrounding([
    { noteId: 1, title: "Barely related", semanticScore: 0.31 },
    { noteId: 2, title: "On point", semanticScore: MIN_GROUNDING_SCORE },
  ]);
  // The index-wide 0.3 filter is right for a search UI the user can judge;
  // silent injection needs a stricter bar.
  assert.deepEqual(
    kept.map((n) => n.noteId),
    [2]
  );
});

test("fresh retrieval outranks notes carried from earlier turns", async () => {
  const { mergeGrounding } = await load();
  const merged = mergeGrounding(
    [{ noteId: 5, title: "Fresh" }],
    [{ noteId: 9, title: "Carried" }]
  );
  assert.deepEqual(
    merged.map((n) => n.noteId),
    [5, 9]
  );
});

test("a note retrieved again is not carried twice", async () => {
  const { mergeGrounding } = await load();
  const merged = mergeGrounding(
    [{ noteId: 5, title: "Fresh", semanticScore: 0.7 }],
    [{ noteId: 5, title: "Stale copy" }]
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].title, "Fresh");
});

test("a poorly-retrieving follow-up keeps the notes the answer was built on", async () => {
  const { mergeGrounding } = await load();
  // This is the whole point: retrieve nothing this turn, still be grounded.
  const carried = [
    { noteId: 1, title: "Vendor review" },
    { noteId: 2, title: "Pricing sync" },
  ];
  const merged = mergeGrounding([], carried);
  assert.deepEqual(
    merged.map((n) => n.noteId),
    [1, 2]
  );
});

test("carried context is bounded so a long conversation cannot grow its own prompt", async () => {
  const { mergeGrounding } = await load();
  const carried = Array.from({ length: 12 }, (_, i) => ({ noteId: 100 + i, title: `Old ${i}` }));
  const merged = mergeGrounding([{ noteId: 1, title: "Fresh" }], carried);

  assert.equal(merged.length, 5, "one fresh plus at most four carried");
});

test("total grounding is capped even when retrieval is generous", async () => {
  const { mergeGrounding } = await load();
  const fresh = Array.from({ length: 20 }, (_, i) => ({ noteId: i + 1, title: `Fresh ${i}` }));
  const merged = mergeGrounding(fresh, [{ noteId: 500, title: "Carried" }]);

  assert.equal(merged.length, 8);
  assert.ok(!merged.some((n) => n.noteId === 500));
});

test("formats grounding with the ids citations resolve against", async () => {
  const { formatGroundingContext } = await load();
  const out = formatGroundingContext([{ noteId: 4, title: "Vendor review", snippet: "we agreed" }]);
  assert.equal(out, '<note id="4" title="Vendor review">\nwe agreed\n</note>');
});
