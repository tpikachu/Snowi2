const test = require("node:test");
const assert = require("node:assert/strict");

const {
  formatAssistTranscript,
  buildAssistRetrievalQuery,
  formatAssistNotes,
  buildSuggestionMessages,
  buildAnswerMessages,
  toAssistSegments,
  parseSuggestion,
  NO_SUGGESTION,
  ASSIST_NOTE_SNIPPET_CHARS,
} = require("../../src/utils/meetingAssistPrompt.ts");

const NOW = 1_000_000;

const seg = (text, source, timestamp) => ({ text, source, timestamp });

test("the transcript is attributed to two sides only", () => {
  const text = formatAssistTranscript([
    seg("we should ship friday", "system", NOW),
    seg("that works", "mic", NOW + 1),
  ]);
  assert.equal(text, "Others: we should ship friday\nYou: that works");
});

test("blank segments never reach the model", () => {
  const text = formatAssistTranscript([
    seg("   ", "mic", NOW),
    seg("real line", "system", NOW + 1),
  ]);
  assert.equal(text, "Others: real line");
});

test("a suggestion searches on what the other side just said", () => {
  const query = buildAssistRetrievalQuery([
    seg("what did we agree on pricing", "system", NOW),
    seg("um", "mic", NOW + 1),
  ]);
  // The user's own "um" is not what they need help with.
  assert.equal(query, "what did we agree on pricing");
});

test("a question searches on the question plus the meeting tail", () => {
  const query = buildAssistRetrievalQuery(
    [seg("the renewal date", "mic", NOW), seg("is it march", "system", NOW + 1)],
    "did we agree that?"
  );
  assert.equal(query, "did we agree that?\nthe renewal date\nis it march");
});

test("the retrieval query is trimmed from the end", () => {
  const segments = [
    seg("x".repeat(400), "system", NOW),
    seg("the newest thing said", "system", NOW + 1),
  ];
  const query = buildAssistRetrievalQuery(segments, undefined, 100);
  assert.equal(query, "the newest thing said");
});

test("a passage longer than the budget is cut, not dropped", () => {
  const rendered = formatAssistNotes([
    { noteId: 7, title: "Acme kickoff", snippet: "y".repeat(ASSIST_NOTE_SNIPPET_CHARS + 200) },
  ]);
  assert.match(rendered, /^<note id="7" title="Acme kickoff">/);
  assert.equal(rendered.includes("y".repeat(ASSIST_NOTE_SNIPPET_CHARS)), true);
  assert.equal(rendered.includes("y".repeat(ASSIST_NOTE_SNIPPET_CHARS + 1)), false);
});

test("both prompts lead with the live meeting and follow with the notes", () => {
  const input = {
    meetingTitle: "Acme weekly",
    segments: [seg("what about the discount", "system", NOW)],
    notes: [{ noteId: 3, title: "Acme pricing", snippet: "agreed 15% through Q3" }],
  };

  for (const built of [
    buildSuggestionMessages(input),
    buildAnswerMessages({ ...input, question: "what did we say?", mode: "thinking" }),
  ]) {
    const user = built.messages[1].content;
    assert.equal(built.messages[0].role, "system");
    assert.equal(built.messages[0].content, built.systemPrompt);
    assert.ok(user.includes("Meeting: Acme weekly"));
    assert.ok(
      user.indexOf("Others: what about the discount") < user.indexOf("Acme pricing"),
      "the transcript must come before the retrieved notes"
    );
  }
});

test("an answer prompt carries the question last", () => {
  const built = buildAnswerMessages({
    meetingTitle: null,
    segments: [seg("hello", "system", NOW)],
    notes: [],
    question: "  what should I say?  ",
    mode: "fast",
  });
  assert.ok(built.messages[1].content.endsWith("My question: what should I say?"));
});

test("the two answer modes get different prompts, and only thinking mentions notes", () => {
  const input = {
    meetingTitle: null,
    segments: [seg("hello", "system", NOW)],
    notes: [],
    question: "what did we agree?",
  };
  const fast = buildAnswerMessages({ ...input, mode: "fast" });
  const thinking = buildAnswerMessages({ ...input, mode: "thinking" });

  assert.notEqual(fast.systemPrompt, thinking.systemPrompt);
  // The fast prompt must not tempt the model into hedging about a note
  // library it was never given — its instruction is the transcript is enough.
  assert.ok(!fast.systemPrompt.includes("past notes"));
  assert.ok(thinking.systemPrompt.includes("past notes"));
});

test("a meeting with nothing said yet still produces a usable prompt", () => {
  const built = buildSuggestionMessages({ meetingTitle: null, segments: [], notes: [] });
  assert.ok(built.messages[1].content.includes("(nothing said yet)"));
});

test("segments without a timestamp inherit the previous one", () => {
  // The store appends timestamp-less segments last, so they are the newest
  // thing said — falling out of the window would make the assistant deaf to it.
  const segments = toAssistSegments(
    [
      { text: "first", source: "system", timestamp: NOW },
      { text: "second", source: "mic" },
    ],
    NOW + 5_000
  );
  assert.deepEqual(
    segments.map((s) => s.timestamp),
    [NOW, NOW]
  );
});

test("an unknown source is treated as the other side", () => {
  const [only] = toAssistSegments([{ text: "hi", source: "speaker-2" }], NOW);
  assert.equal(only.source, "system");
});

test("a declined suggestion is not shown as advice", () => {
  assert.equal(parseSuggestion(NO_SUGGESTION), null);
  assert.equal(parseSuggestion(" none. "), null);
  assert.equal(parseSuggestion("\n\n"), null);
});

test("quotes around a line are stripped, the line is kept", () => {
  assert.equal(
    parseSuggestion('"Ask them for the renewal date."'),
    "Ask them for the renewal date."
  );
  assert.equal(parseSuggestion("None of that is settled yet."), "None of that is settled yet.");
});
