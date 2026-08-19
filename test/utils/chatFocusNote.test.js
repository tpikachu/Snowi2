const test = require("node:test");
const assert = require("node:assert/strict");

async function load() {
  return await import("../../src/utils/chatRetrieval.ts");
}

const TITLES = new Map([
  [3, "Vendor sync"],
  [7, "Q3 planning"],
]);

test("an answer that cited exactly one note makes it the subject", async () => {
  const { resolveFocusNote } = await load();
  assert.deepEqual(resolveFocusNote([3], TITLES, undefined), { id: 3, title: "Vendor sync" });
});

test("two cited notes clear the subject rather than pick one", async () => {
  const { resolveFocusNote } = await load();
  // "This meeting" is genuinely ambiguous after an answer about two of them.
  // Picking either would answer a different question than the user asked
  // without ever saying so; with no subject set, the model asks.
  assert.equal(resolveFocusNote([3, 7], TITLES, { id: 3, title: "Vendor sync" }), undefined);
});

test("the same note cited repeatedly is still one note", async () => {
  const { resolveFocusNote } = await load();
  assert.deepEqual(resolveFocusNote([7, 7, 7], TITLES, undefined), { id: 7, title: "Q3 planning" });
});

test("citing nothing keeps the subject", async () => {
  const { resolveFocusNote } = await load();
  // "And who owned that?" is still about the meeting under discussion, even
  // though the answer had no note to cite.
  const previous = { id: 7, title: "Q3 planning" };
  assert.deepEqual(resolveFocusNote([], TITLES, previous), previous);
});

test("a cited note with no known title sets no subject", async () => {
  const { resolveFocusNote } = await load();
  // Nothing to describe to the model, so claiming a subject would put an id in
  // the prompt with no way for the user or the model to tell what it is.
  assert.equal(resolveFocusNote([99], TITLES, undefined), undefined);
});
