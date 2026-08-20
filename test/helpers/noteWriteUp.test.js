const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/noteWriteUp.ts");

const LABELS = { you: "You", them: "Them" };

const segments = (items) =>
  JSON.stringify(items.map((item) => ({ text: item.text, source: item.source, ...item })));

test("keeps the diarized speaker names the automatic run uses", async () => {
  const { buildWriteUpRequest } = await load();

  const transcript = segments([
    { text: "Shipping Friday.", source: "mic", speakerName: "Ana" },
    { text: "Works for me.", source: "system", speakerName: "Bruno" },
  ]);
  const request = buildWriteUpRequest("", transcript, LABELS);

  // This is the bug the extraction fixed: the notes editor built its own
  // transcript inline from segment.source alone, so regenerating a diarized
  // meeting by hand replaced "Ana"/"Bruno" with "You"/"Them".
  assert.match(request.input, /Ana: Shipping Friday\./);
  assert.match(request.input, /Bruno: Works for me\./);
  assert.equal(request.input.includes("You:"), false);
  assert.equal(request.isMeetingNote, true);
});

test("falls back to the side labels when a segment has no speaker", async () => {
  const { buildWriteUpRequest } = await load();

  const transcript = segments([
    { text: "Hello.", source: "mic" },
    { text: "Hi.", source: "system" },
  ]);
  const request = buildWriteUpRequest("", transcript, LABELS);

  assert.match(request.input, /You: Hello\./);
  assert.match(request.input, /Them: Hi\./);
});

test("puts the user's own notes before the transcript", async () => {
  const { buildWriteUpRequest } = await load();

  const request = buildWriteUpRequest(
    "Rough outline",
    segments([{ text: "Said something.", source: "mic" }]),
    LABELS
  );

  // The prompt is written around the notes being the outline the transcript
  // fills in, so the order is load-bearing.
  assert.ok(
    request.input.indexOf("Rough outline") < request.input.indexOf("## Meeting Transcript")
  );
});

test("a transcript that does not parse is still sent, not dropped", async () => {
  const { buildWriteUpRequest } = await load();

  // Imported recordings and older notes hold plain text, not a segment array.
  const request = buildWriteUpRequest("", "just a plain transcript", LABELS);

  assert.match(request.input, /just a plain transcript/);
  assert.equal(request.isMeetingNote, false, "no segments means the non-meeting prompt");
});

test("returns null when there is nothing to write up", async () => {
  const { buildWriteUpRequest } = await load();

  assert.equal(buildWriteUpRequest("", "", LABELS), null);
  assert.equal(buildWriteUpRequest("   ", "  ", LABELS), null);
  assert.equal(buildWriteUpRequest(null, null, LABELS), null);
});

test("notes with no transcript are handled without a transcript heading", async () => {
  const { buildWriteUpRequest } = await load();

  const request = buildWriteUpRequest("Only my notes", "", LABELS);
  assert.equal(request.input, "Only my notes");
  assert.equal(request.isMeetingNote, false);
});

test("hashes over the stored transcript, not the formatted one", async () => {
  const { buildWriteUpRequest } = await load();
  const { makeNoteContentHash, noteEnhancementSource } =
    await import("../../src/utils/noteContentHash.ts");

  const raw = segments([{ text: "Said something.", source: "mic", speakerName: "Ana" }]);
  const request = buildWriteUpRequest("Notes", raw, LABELS);

  // Hashing the formatted text would make the note read as stale the moment
  // it reopened, and offer to redo work that was just done.
  assert.equal(request.contentHash, makeNoteContentHash(noteEnhancementSource("Notes", raw)));
});

test("an empty segment does not become a bare speaker label", async () => {
  const { buildWriteUpRequest } = await load();

  const transcript = segments([
    { text: "Real line.", source: "mic" },
    { text: "   ", source: "system" },
  ]);
  const request = buildWriteUpRequest("", transcript, LABELS);

  assert.equal(request.input.includes("Them:"), false, "no 'Them:' with nothing after it");
  assert.match(request.input, /You: Real line\./);
});
