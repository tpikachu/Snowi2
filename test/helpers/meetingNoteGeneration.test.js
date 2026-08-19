const test = require("node:test");
const assert = require("node:assert/strict");

// Only the pure formatting helpers are exercised here; the trigger itself
// needs the settings store and Electron.
const load = () => import("../../src/utils/meetingNoteInput.ts");
const loadHash = () => import("../../src/utils/noteContentHash.ts");

const labels = { you: "You", them: "Them" };

test("mic and system segments are labelled as the two sides of the call", async () => {
  const { formatMeetingTranscript } = await load();
  const out = formatMeetingTranscript(
    [
      { id: "1", text: "Shall we start?", source: "mic" },
      { id: "2", text: "Yes, go ahead.", source: "system" },
    ],
    labels
  );

  assert.equal(out, "You: Shall we start?\nThem: Yes, go ahead.");
});

// Diarization is the whole point of naming speakers — a resolved name must
// beat the generic side-of-the-call label.
test("a resolved speaker name wins over the generic label", async () => {
  const { formatMeetingTranscript } = await load();
  const out = formatMeetingTranscript(
    [
      { id: "1", text: "Numbers are up.", source: "system", speakerName: "Priya" },
      { id: "2", text: "Good.", source: "system" },
    ],
    labels
  );

  assert.equal(out, "Priya: Numbers are up.\nThem: Good.");
});

test("a blank speaker name falls back rather than producing an empty label", async () => {
  const { formatMeetingTranscript } = await load();
  const out = formatMeetingTranscript(
    [{ id: "1", text: "Hello.", source: "system", speakerName: "   " }],
    labels
  );

  assert.equal(out, "Them: Hello.");
});

// Streaming transcripts emit stray fragments; a line that is only a label and
// a stray character is noise the model should not have to reason about.
test("segments with no real text are dropped", async () => {
  const { formatMeetingTranscript } = await load();
  const out = formatMeetingTranscript(
    [
      { id: "1", text: "Real content here.", source: "mic" },
      { id: "2", text: "", source: "mic" },
      { id: "3", text: "   ", source: "system" },
    ],
    labels
  );

  assert.equal(out, "You: Real content here.");
});

test("an empty transcript formats to an empty string", async () => {
  const { formatMeetingTranscript } = await load();
  assert.equal(formatMeetingTranscript([], labels), "");
});

test("the user's own notes lead, with the transcript under its own heading", async () => {
  const { buildMeetingActionInput } = await load();
  const out = buildMeetingActionInput("  My rough notes  ", "You: Hello");

  assert.equal(out, "My rough notes\n\n## Meeting Transcript\nYou: Hello");
});

// Granola's shape: the user's outline is what the transcript fills in, so a
// meeting with no typed notes must still send the transcript.
test("a transcript with no typed notes still produces input", async () => {
  const { buildMeetingActionInput } = await load();
  assert.equal(buildMeetingActionInput("", "You: Hello"), "## Meeting Transcript\nYou: Hello");
});

test("notes with no transcript carry no empty heading", async () => {
  const { buildMeetingActionInput } = await load();
  assert.equal(buildMeetingActionInput("Just notes", "   "), "Just notes");
});

// The two paths must agree, or every auto-generated note reads as stale the
// moment it is opened and offers to redo work that was just done.
test("the enhancement hash depends on both the note and its transcript", async () => {
  const { makeNoteContentHash, noteEnhancementSource } = await loadHash();
  const a = makeNoteContentHash(noteEnhancementSource("notes", "transcript"));

  assert.equal(a, makeNoteContentHash(noteEnhancementSource("notes", "transcript")));
  assert.notEqual(a, makeNoteContentHash(noteEnhancementSource("notes", "different")));
  assert.notEqual(a, makeNoteContentHash(noteEnhancementSource("edited", "transcript")));
});

test("the hash separates the note from the transcript", async () => {
  const { noteEnhancementSource } = await loadHash();
  // Without a separator "ab" + "c" and "a" + "bc" would be the same string.
  assert.notEqual(noteEnhancementSource("ab", "c"), noteEnhancementSource("a", "bc"));
});
