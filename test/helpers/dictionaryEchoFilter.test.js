const test = require("node:test");
const assert = require("node:assert/strict");

test("detects verbatim echo of dictionary prompt", async () => {
  const { matchesDictionaryPrompt } = await import("../../src/utils/dictionaryEchoFilter.js");
  assert.equal(
    matchesDictionaryPrompt("Snowi, Parakeet, Alcahest", "Snowi, Parakeet, Alcahest"),
    true
  );
});

test("detects echo when Whisper adds trailing period", async () => {
  const { matchesDictionaryPrompt } = await import("../../src/utils/dictionaryEchoFilter.js");
  assert.equal(
    matchesDictionaryPrompt("Snowi, Parakeet, Alcahest.", "Snowi, Parakeet, Alcahest"),
    true
  );
});

test("detects echo with different capitalization", async () => {
  const { matchesDictionaryPrompt } = await import("../../src/utils/dictionaryEchoFilter.js");
  assert.equal(
    matchesDictionaryPrompt("snowi, parakeet, alcahest", "Snowi, Parakeet, Alcahest"),
    true
  );
});

test("detects echo when Whisper strips commas", async () => {
  const { matchesDictionaryPrompt } = await import("../../src/utils/dictionaryEchoFilter.js");
  assert.equal(
    matchesDictionaryPrompt("Snowi Parakeet Alcahest", "Snowi, Parakeet, Alcahest"),
    true
  );
});

test("detects echo with extra whitespace", async () => {
  const { matchesDictionaryPrompt } = await import("../../src/utils/dictionaryEchoFilter.js");
  assert.equal(
    matchesDictionaryPrompt("Snowi,  Parakeet,  Alcahest", "Snowi, Parakeet, Alcahest"),
    true
  );
});

test("does not flag legitimate speech containing dictionary words", async () => {
  const { matchesDictionaryPrompt } = await import("../../src/utils/dictionaryEchoFilter.js");
  assert.equal(
    matchesDictionaryPrompt(
      "I just installed Snowi and it works great",
      "Snowi, Parakeet, Alcahest"
    ),
    false
  );
});

test("does not flag speech that partially overlaps with dictionary", async () => {
  const { matchesDictionaryPrompt } = await import("../../src/utils/dictionaryEchoFilter.js");
  assert.equal(
    matchesDictionaryPrompt("Snowi, Parakeet", "Snowi, Parakeet, Alcahest"),
    false
  );
});

test("returns false when dictionary prompt is null", async () => {
  const { matchesDictionaryPrompt } = await import("../../src/utils/dictionaryEchoFilter.js");
  assert.equal(matchesDictionaryPrompt("some text", null), false);
});

test("returns false when text is null", async () => {
  const { matchesDictionaryPrompt } = await import("../../src/utils/dictionaryEchoFilter.js");
  assert.equal(matchesDictionaryPrompt(null, "Snowi"), false);
});

test("returns false when both inputs are empty strings", async () => {
  const { matchesDictionaryPrompt } = await import("../../src/utils/dictionaryEchoFilter.js");
  assert.equal(matchesDictionaryPrompt("", ""), false);
});

test("handles single-word dictionary", async () => {
  const { matchesDictionaryPrompt } = await import("../../src/utils/dictionaryEchoFilter.js");
  assert.equal(matchesDictionaryPrompt("Snowi", "Snowi"), true);
  assert.equal(matchesDictionaryPrompt("Snowi is great", "Snowi"), false);
});

test("handles unicode dictionary words with accents", async () => {
  const { matchesDictionaryPrompt } = await import("../../src/utils/dictionaryEchoFilter.js");
  assert.equal(matchesDictionaryPrompt("Müller, François, José", "Müller, François, José"), true);
  assert.equal(matchesDictionaryPrompt("muller francois jose", "Müller, François, José"), false);
});

test("handles CJK dictionary words", async () => {
  const { matchesDictionaryPrompt } = await import("../../src/utils/dictionaryEchoFilter.js");
  assert.equal(matchesDictionaryPrompt("東京, 大阪", "東京, 大阪"), true);
});

test("detects repeated echo where Whisper loops the dictionary", async () => {
  const { matchesDictionaryPrompt } = await import("../../src/utils/dictionaryEchoFilter.js");
  const dict = "Snowi, Parakeet, Alcahest";
  const repeated = "Snowi, Parakeet, Alcahest, Snowi, Parakeet, Alcahest";
  assert.equal(matchesDictionaryPrompt(repeated, dict), true);
});

test("detects echo with minor Whisper additions among dictionary words", async () => {
  const { matchesDictionaryPrompt } = await import("../../src/utils/dictionaryEchoFilter.js");
  const dict = "Alpha, Bravo, Charlie, Delta, Echo, Foxtrot, Golf, Hotel, India, Juliet";
  const echoWithFiller = "Alpha Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliet the";
  assert.equal(matchesDictionaryPrompt(echoWithFiller, dict), true);
});

test("does not flag completely unrelated text", async () => {
  const { matchesDictionaryPrompt } = await import("../../src/utils/dictionaryEchoFilter.js");
  assert.equal(
    matchesDictionaryPrompt(
      "The quick brown fox jumps over the lazy dog",
      "Snowi, Parakeet, Alcahest"
    ),
    false
  );
});

test("returns false when text or prompt normalizes to empty string (punctuation only)", async () => {
  const { matchesDictionaryPrompt } = await import("../../src/utils/dictionaryEchoFilter.js");
  assert.equal(matchesDictionaryPrompt("...", "..."), false);
  assert.equal(matchesDictionaryPrompt("!!!", ",,,"), false);
  assert.equal(matchesDictionaryPrompt("???", "Snowi, Parakeet"), false);
  assert.equal(matchesDictionaryPrompt("Snowi, Parakeet", "!!!"), false);
});
