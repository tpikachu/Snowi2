const test = require("node:test");
const assert = require("node:assert/strict");

async function load() {
  return await import("../../src/helpers/meetingSegments.js");
}

function blob(segments) {
  return JSON.stringify(segments);
}

test("projects a transcript into ordered, addressable rows", async () => {
  const { parseTranscriptSegments } = await load();
  const rows = parseTranscriptSegments(
    7,
    blob([
      { id: "seg-1", text: "Shall we start?", source: "mic", timestamp: 0, speakerName: "You" },
      { id: "seg-2", text: "Yes.", source: "system", timestamp: 2400, speaker: "spk_1" },
    ])
  );

  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.id),
    ["7:seg-1", "7:seg-2"]
  );
  assert.deepEqual(
    rows.map((r) => r.seq),
    [0, 1]
  );
  assert.equal(rows[0].speaker_name, "You");
  assert.equal(rows[1].source, "system");
  assert.equal(rows[1].start_ms, 2400);
});

test("row ids are scoped to the note, because capture numbers per session", async () => {
  const { parseTranscriptSegments } = await load();
  // `seg-1` is the first line of every meeting ever recorded.
  const a = parseTranscriptSegments(1, blob([{ id: "seg-1", text: "hello" }]));
  const b = parseTranscriptSegments(2, blob([{ id: "seg-1", text: "different meeting" }]));

  assert.notEqual(a[0].id, b[0].id);
});

test("ids survive a rewrite that only changes speaker labels", async () => {
  const { parseTranscriptSegments } = await load();
  // Diarization rebuilds the array. A citation written before it ran has to
  // still resolve afterwards.
  const before = parseTranscriptSegments(3, blob([{ id: "seg-4", text: "we agreed on Friday" }]));
  const after = parseTranscriptSegments(
    3,
    blob([{ id: "seg-4", text: "we agreed on Friday", speaker: "spk_2", speakerName: "Dana" }])
  );

  assert.equal(before[0].id, after[0].id);
  assert.equal(after[0].speaker_name, "Dana");
});

test("two capture sessions appended to one note do not collide", async () => {
  const { parseTranscriptSegments } = await load();
  // Both sessions count from seg-1; dropping the duplicate would silently lose
  // half the meeting from the index.
  const rows = parseTranscriptSegments(
    9,
    blob([
      { id: "seg-1", text: "first session" },
      { id: "seg-1", text: "second session" },
    ])
  );

  assert.equal(rows.length, 2);
  assert.equal(new Set(rows.map((r) => r.id)).size, 2);
  assert.deepEqual(
    rows.map((r) => r.text),
    ["first session", "second session"]
  );
});

test("segments with no words are not indexed", async () => {
  const { parseTranscriptSegments } = await load();
  // Citing one would show the user an empty line as evidence.
  const rows = parseTranscriptSegments(
    1,
    blob([{ id: "a", text: "   " }, { id: "b", text: "real" }, { id: "c" }])
  );

  assert.deepEqual(
    rows.map((r) => r.text),
    ["real"]
  );
  assert.equal(rows[0].seq, 0, "sequence numbers the kept rows, not the discarded ones");
});

test("a corrupt blob yields no rows instead of throwing", async () => {
  const { parseTranscriptSegments } = await load();
  // One unparseable note must not abort a backfill over the whole library.
  for (const bad of ["not json", "{}", "null", '"a string"', "[1,2,3]", "", null, undefined]) {
    assert.deepEqual(parseTranscriptSegments(1, bad), [], `input ${JSON.stringify(bad)}`);
  }
});

test("non-finite timestamps become null rather than NaN", async () => {
  const { parseTranscriptSegments } = await load();
  const rows = parseTranscriptSegments(
    1,
    blob([
      { id: "a", text: "x", timestamp: Number.NaN },
      { id: "b", text: "y", timestamp: "12" },
    ])
  );

  assert.equal(rows[0].start_ms, null);
  assert.equal(rows[1].start_ms, null);
});

test("an unknown source is dropped, not stored as-is", async () => {
  const { parseTranscriptSegments } = await load();
  const rows = parseTranscriptSegments(1, blob([{ id: "a", text: "x", source: "bluetooth" }]));
  assert.equal(rows[0].source, null);
});

test("evidence reads as who said it, when", async () => {
  const { formatSegmentEvidence, formatOffset } = await load();

  assert.equal(
    formatSegmentEvidence({ start_ms: 754_000, speaker_name: "Dana", text: "ship it Friday" }),
    "[12:34 Dana] ship it Friday"
  );
  // No speaker and no clock is still usable evidence, just barer.
  assert.equal(formatSegmentEvidence({ start_ms: null, text: "ship it" }), "ship it");
  assert.equal(formatOffset(0), "00:00");
  assert.equal(formatOffset(-500), "00:00");
});
