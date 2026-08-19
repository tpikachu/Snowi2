const test = require("node:test");
const assert = require("node:assert/strict");

const {
  chunkNote,
  buildNoteDocument,
  toPlainText,
  CHUNK_CHARS,
  CHUNK_OVERLAP_CHARS,
  MAX_CHUNKS_PER_NOTE,
} = require("../../src/helpers/noteChunker");

const words = (n, word = "alpha") => Array.from({ length: n }, () => word).join(" ");

test("editor HTML is stripped so tags do not eat the chunk budget", () => {
  assert.equal(toPlainText("<p>Hello <b>there</b></p>"), "Hello there");
  assert.equal(toPlainText("a &amp; b &lt;c&gt;"), "a & b <c>");
  assert.equal(toPlainText("lots\n\n  of   space"), "lots of space");
  assert.equal(toPlainText(null), "");
});

// The transcript was previously indexed nowhere, so the substance of every
// meeting was unreachable by meaning.
test("the transcript is part of the searchable document", () => {
  const doc = buildNoteDocument({ content: "typed", transcript: "spoken words" });
  assert.match(doc, /typed/);
  assert.match(doc, /spoken words/);
});

test("generated notes lead, with the transcript behind them", () => {
  const doc = buildNoteDocument({
    content: "raw",
    enhancedContent: "distilled",
    transcript: "verbatim",
  });
  assert.ok(doc.indexOf("distilled") < doc.indexOf("raw"));
  assert.ok(doc.indexOf("raw") < doc.indexOf("verbatim"));
});

test("a short note is a single chunk", () => {
  const chunks = chunkNote({ title: "Standup", content: "We shipped the thing." });
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].chunkIndex, 0);
  assert.match(chunks[0].text, /Standup/);
  assert.match(chunks[0].text, /shipped the thing/);
});

test("a title-only note is still findable by its title", () => {
  const chunks = chunkNote({ title: "Budget review" });
  assert.deepEqual(chunks, [{ chunkIndex: 0, text: "Budget review" }]);
});

test("an entirely empty note produces nothing to index", () => {
  assert.deepEqual(chunkNote({}), []);
  assert.deepEqual(chunkNote({ title: "  ", content: "<p></p>" }), []);
});

// The whole point: a long meeting must not be represented by its opening
// minute alone.
test("a long note is split into several chunks and none of it is lost", () => {
  const transcript = words(4000);
  const chunks = chunkNote({ title: "Q3 review", transcript });

  assert.ok(chunks.length > 5, `expected several chunks, got ${chunks.length}`);
  // The tail of the document has to appear somewhere.
  const joined = chunks.map((c) => c.text).join(" ");
  assert.ok(joined.includes(transcript.slice(-100)));
});

test("chunk indexes are sequential from zero", () => {
  const chunks = chunkNote({ title: "T", transcript: words(2000) });
  assert.deepEqual(
    chunks.map((c) => c.chunkIndex),
    chunks.map((_, i) => i)
  );
});

// A passage lifted from the middle of a meeting arrives with no indication of
// which meeting it came from unless the title rides along.
test("every chunk carries the note title", () => {
  const chunks = chunkNote({ title: "Pricing call", transcript: words(2000) });
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(chunk.text.startsWith("Pricing call\n"), "chunk lost its title");
  }
});

// Chunks larger than the embedding model's window would be silently truncated,
// so the tail of each would never reach the vector.
test("no chunk body exceeds the embedding window", () => {
  const chunks = chunkNote({ title: "T", transcript: words(3000) });
  for (const chunk of chunks) {
    const body = chunk.text.slice("T\n".length);
    assert.ok(body.length <= CHUNK_CHARS, `chunk body was ${body.length}`);
  }
});

test("consecutive chunks overlap so a sentence on a boundary survives whole", () => {
  const chunks = chunkNote({ transcript: words(1000) });
  assert.ok(chunks.length > 1);
  const tail = chunks[0].text.slice(-CHUNK_OVERLAP_CHARS);
  assert.ok(chunks[1].text.startsWith(tail), "second chunk did not carry the overlap");
});

test("a very long note is capped rather than exploding the index", () => {
  const chunks = chunkNote({ transcript: words(400_000) });
  assert.ok(chunks.length <= MAX_CHUNKS_PER_NOTE);
});

// The point-id scheme packs the chunk index into the low digits of the id.
test("the chunk cap stays inside the point-id encoding", () => {
  assert.ok(MAX_CHUNKS_PER_NOTE < 1000);
});

test("a trailing sliver already covered by the overlap is not indexed twice", () => {
  // Length chosen to leave a few characters past the second window's start.
  const body = "x".repeat(CHUNK_CHARS - CHUNK_OVERLAP_CHARS + 5);
  const chunks = chunkNote({ transcript: body });
  assert.equal(chunks.length, 1);
});
