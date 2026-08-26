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

test("memory sits between the transcript and the notes, and claims ride inside their note", () => {
  const input = {
    meetingTitle: "Acme weekly",
    segments: [seg("what about the discount", "system", NOW)],
    notes: [
      {
        noteId: 3,
        title: "Acme pricing",
        snippet: "agreed 15% through Q3",
        claims: "- [decision] Discount set at 12% — SUPERSEDED, no longer true",
      },
    ],
    memory: {
      profile: "- Works in enterprise sales",
      openCommitments: "- Send the revised quote — due today",
    },
    question: "what did we agree?",
    mode: "thinking",
  };
  const user = buildAnswerMessages(input).messages[1].content;

  // Transcript (primary) → durable memory (exact, current) → notes (recall).
  const transcriptAt = user.indexOf("Others: what about the discount");
  const profileAt = user.indexOf("Works in enterprise sales");
  const commitmentsAt = user.indexOf("Send the revised quote");
  const notesAt = user.indexOf("agreed 15% through Q3");
  assert.ok(transcriptAt < profileAt && profileAt < commitmentsAt && commitmentsAt < notesAt);

  // The correction arrives with the passage it corrects, not in a distant
  // section the model has to cross-reference mid-answer.
  const noteBlock = user.slice(user.indexOf('<note id="3"'), user.indexOf("</note>"));
  assert.match(noteBlock, /SUPERSEDED, no longer true/);
});

test("the previous occurrence sits between the transcript and the general memory", () => {
  // A recurring meeting's own history is more specific than the profile or
  // the global commitment slate, so it outranks them — but never the live
  // transcript.
  const user = buildAnswerMessages({
    meetingTitle: "Acme weekly",
    segments: [seg("shall we start", "system", NOW)],
    notes: [],
    memory: {
      previousMeeting: { date: "2026-08-19", claims: "- [decision] Ship on Friday" },
      profile: "- Works in enterprise sales",
    },
    question: "what did we agree last time?",
    mode: "thinking",
  }).messages[1].content;

  assert.ok(user.includes("Last time this meeting met (2026-08-19)"));
  const transcriptAt = user.indexOf("Others: shall we start");
  const previousAt = user.indexOf("Ship on Friday");
  const profileAt = user.indexOf("Works in enterprise sales");
  assert.ok(transcriptAt < previousAt && previousAt < profileAt);
});

test("a claim-less previous occurrence falls back to its own notes, labeled stale", () => {
  // Hand-typed notes never went through extraction; their substance still
  // reaches the assistant, under a heading that says it may be out of date.
  const user = buildAnswerMessages({
    meetingTitle: null,
    segments: [seg("hello", "system", NOW)],
    notes: [],
    memory: {
      previousMeeting: { date: "2026-08-19", notes: "Dana wants the quote by Friday" },
    },
    question: "what did we agree?",
    mode: "thinking",
  }).messages[1].content;
  assert.ok(user.includes("own notes last time this meeting met (2026-08-19)"));
  assert.ok(user.includes("may be out of date"));
  assert.ok(user.includes("Dana wants the quote by Friday"));
});

test("claims win over the notes excerpt when both are present", () => {
  // Claims carry current statuses; rendering the raw text beside them would
  // put stale wording next to its own correction as a peer.
  const user = buildAnswerMessages({
    meetingTitle: null,
    segments: [seg("hello", "system", NOW)],
    notes: [],
    memory: {
      previousMeeting: {
        date: "2026-08-19",
        claims: "- [decision] Quote due Friday",
        notes: "old free-text version",
      },
    },
    question: "what did we agree?",
    mode: "thinking",
  }).messages[1].content;
  assert.ok(user.includes("Quote due Friday"));
  assert.ok(!user.includes("old free-text version"));
});

test("an empty previous occurrence renders no heading", () => {
  const user = buildAnswerMessages({
    meetingTitle: null,
    segments: [seg("hello", "system", NOW)],
    notes: [],
    memory: { previousMeeting: { date: "2026-08-19", claims: "  " } },
    question: "hi?",
    mode: "thinking",
  }).messages[1].content;
  assert.ok(!user.includes("Last time this meeting met"));
});

test("a fast answer carries no memory block even if one is passed", () => {
  // The fast path never fetches memory; this guards the prompt side of that
  // promise — buildContext renders only what the caller supplies.
  const user = buildAnswerMessages({
    meetingTitle: null,
    segments: [seg("hello", "system", NOW)],
    notes: [],
    question: "what did we agree?",
    mode: "fast",
  }).messages[1].content;
  assert.ok(!user.includes("Open commitments"));
  assert.ok(!user.includes("About the user"));
});

test("both answer prompts authorize advice instead of abstaining on it", () => {
  // The regression this guards: the abstain rule ("say so if it is not in the
  // transcript") was unscoped, so "what should I say next?" — an advisory
  // question whose answer is never IN the transcript — got "there is no such
  // context" instead of a recommendation.
  const input = {
    meetingTitle: null,
    segments: [seg("hello", "system", NOW)],
    notes: [],
    question: "what should I say next?",
  };
  for (const mode of ["fast", "thinking"]) {
    const prompt = buildAnswerMessages({ ...input, mode }).systemPrompt;
    assert.match(prompt, /NEVER answered with/, `${mode}: advice is never an abstain`);
    assert.match(prompt, /your input, not where the answer lives/, `${mode}: input vs location`);
    // The abstain rule survives, scoped to questions about the record.
    assert.match(prompt, /Asked what happened/, `${mode}: factual abstain still present`);
  }
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
