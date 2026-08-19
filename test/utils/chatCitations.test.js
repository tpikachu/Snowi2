const test = require("node:test");
const assert = require("node:assert/strict");

async function load() {
  return await import("../../src/utils/chatCitations.ts");
}

test("rewrites markers into links numbered by first appearance", async () => {
  const { renderCitations } = await load();
  const { content, citedIds } = renderCitations(
    "Revenue was up [[note:7]]. Costs held [[note:12]]. Revenue again [[note:7]].",
    [7, 12]
  );

  assert.equal(
    content,
    "Revenue was up [1](snowy-note:7). Costs held [2](snowy-note:12). Revenue again [1](snowy-note:7)."
  );
  // Repeat citations reuse their number rather than climbing.
  assert.deepEqual(citedIds, [7, 12]);
});

test("drops citations naming a note that was never retrieved", async () => {
  const { renderCitations } = await load();
  // A model citing an id it was not given is inventing a reference; linking it
  // would open an unrelated note that happens to hold that id.
  const { content, citedIds } = renderCitations("Claimed [[note:999]] and real [[note:3]].", [3]);

  assert.equal(content, "Claimed  and real [1](snowy-note:3).");
  assert.deepEqual(citedIds, [3]);
});

test("with no known ids, any well-formed citation is kept", async () => {
  const { renderCitations } = await load();
  // Restored conversations from before sources were persisted have no known
  // set; refusing every citation there would strip working links.
  const { citedIds } = renderCitations("From the sync [[note:4]].", []);
  assert.deepEqual(citedIds, [4]);
});

test("leaves text that is not a citation marker untouched", async () => {
  const { renderCitations } = await load();
  // A note can legitimately contain double brackets; only the exact
  // `[[note:<digits>]]` shape is ours to consume.
  const input = "See [[note:]] and [[note:abc]] and [[wiki link]] here.";
  const { content, citedIds } = renderCitations(input, [1]);

  assert.equal(content, input);
  assert.deepEqual(citedIds, []);
});

test("removes a marker with an impossible id rather than showing it", async () => {
  const { renderCitations } = await load();
  // It is shaped like a citation, so the model meant it as one. Leaving the
  // raw marker in the prose is worse for the reader than dropping it.
  const { content, citedIds } = renderCitations("Discussed [[note:0]].", [1]);

  assert.equal(content, "Discussed .");
  assert.deepEqual(citedIds, []);
});

test("streaming holds back a half-arrived marker", async () => {
  const { renderStreamingCitations } = await load();
  // The marker arrives a token at a time; rendering the fragment as text makes
  // the answer flicker with debris on its way to a real citation.
  for (const tail of ["[", "[[", "[[n", "[[not", "[[note:", "[[note:1"]) {
    const { content } = renderStreamingCitations(`Revenue rose ${tail}`, [12]);
    assert.equal(content, "Revenue rose ", `tail ${JSON.stringify(tail)} leaked into the output`);
  }
});

test("streaming leaves completed markers alone", async () => {
  const { renderStreamingCitations } = await load();
  const { content } = renderStreamingCitations("Revenue rose [[note:12]] and", [12]);
  assert.equal(content, "Revenue rose [1](snowy-note:12) and");
});

test("parseNoteLink accepts only the app's own scheme", async () => {
  const { parseNoteLink } = await load();
  assert.equal(parseNoteLink("snowy-note:42"), 42);
  assert.equal(parseNoteLink("https://example.com"), null);
  assert.equal(parseNoteLink("snowy-note:abc"), null);
  assert.equal(parseNoteLink("snowy-note:0"), null);
  assert.equal(parseNoteLink(undefined), null);
});
