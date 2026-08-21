const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPanelTranscript,
  panelTranscriptsEqual,
  PANEL_TRANSCRIPT_LINES,
} = require("../../src/utils/meetingPanelTranscript.ts");

const segment = (text, source = "system", timestamp = 0) => ({ text, source, timestamp });
const utterance = (text, source = "system", key = "system") => ({ key, source, text });

const state = (segments = [], liveUtterances = []) => ({ segments, liveUtterances });

test("settled lines and live captions arrive in speaking order", () => {
  const result = buildPanelTranscript(
    state([segment("settled one"), segment("settled two")], [utterance("still talking")])
  );

  assert.deepEqual(
    result.lines.map((l) => l.text),
    ["settled one", "settled two", "still talking"]
  );
  assert.deepEqual(
    result.lines.map((l) => l.live),
    [false, false, true]
  );
});

test("the tail is kept, not the head", () => {
  // A panel showing the first forty lines of an hour-long meeting is showing
  // the wrong end of it.
  const segments = Array.from({ length: PANEL_TRANSCRIPT_LINES + 10 }, (_, i) =>
    segment(`line ${i}`)
  );

  const result = buildPanelTranscript(state(segments));

  assert.equal(result.lines.length, PANEL_TRANSCRIPT_LINES);
  assert.equal(result.lines[result.lines.length - 1].text, `line ${segments.length - 1}`);
  assert.equal(result.hiddenCount, 10);
});

test("live captions survive the trim, settled lines give way", () => {
  // The in-flight text is the reason to look at this pane; dropping it to make
  // room for finished lines would be exactly backwards.
  const segments = Array.from({ length: 100 }, (_, i) => segment(`line ${i}`));
  const live = [utterance("half a sen", "system", "a"), utterance("and me too", "mic", "b")];

  const result = buildPanelTranscript(state(segments, live), 5);

  assert.equal(result.lines.length, 5);
  assert.equal(result.lines.filter((l) => l.live).length, 2);
  assert.deepEqual(
    result.lines.filter((l) => !l.live).map((l) => l.text),
    ["line 97", "line 98", "line 99"]
  );
});

test("more live captions than the limit still all arrive", () => {
  const live = [
    utterance("one", "system", "a"),
    utterance("two", "mic", "b"),
    utterance("three", "system", "c"),
  ];

  const result = buildPanelTranscript(state([segment("dropped")], live), 2);

  assert.equal(result.lines.length, 3);
  assert.ok(result.lines.every((l) => l.live));
});

test("blank text never becomes a row", () => {
  // Main withdraws a caption by sending empty text; an empty bubble is not a
  // thing to render.
  const result = buildPanelTranscript(
    state([segment("real"), segment("   "), segment("")], [utterance("")])
  );

  assert.deepEqual(
    result.lines.map((l) => l.text),
    ["real"]
  );
});

test("text is trimmed", () => {
  const result = buildPanelTranscript(state([segment("  padded  ")]));
  assert.equal(result.lines[0].text, "padded");
});

test("an unknown source is treated as the other side, not as the user", () => {
  // Mislabelling someone else's words as the user's is the worse mistake: it
  // puts words in their mouth in their own transcript.
  const result = buildPanelTranscript(state([segment("who said this", "unknown")]));
  assert.equal(result.lines[0].source, "system");
});

test("keys are stable across rebuilds so rows are not remounted", () => {
  const input = state([segment("one", "system", 100)], [utterance("two")]);

  const first = buildPanelTranscript(input);
  const second = buildPanelTranscript(input);

  assert.deepEqual(
    first.lines.map((l) => l.key),
    second.lines.map((l) => l.key)
  );
});

test("a segment id is preferred as the key once it has one", () => {
  const result = buildPanelTranscript(state([{ ...segment("x"), id: "seg-7" }]));
  assert.equal(result.lines[0].key, "seg-7");
});

test("an unchanged transcript is not worth republishing", () => {
  // The bridge rebuilds on a timer, so without a content comparison every tick
  // of a silent meeting would cross the IPC boundary.
  const input = state([segment("same", "system", 1)], [utterance("live")]);

  assert.equal(
    panelTranscriptsEqual(buildPanelTranscript(input), buildPanelTranscript(input)),
    true
  );
});

test("a changed word is worth republishing", () => {
  const before = buildPanelTranscript(state([], [utterance("so the")]));
  const after = buildPanelTranscript(state([], [utterance("so the plan")]));

  assert.equal(panelTranscriptsEqual(before, after), false);
});

test("a caption settling into a line is a change", () => {
  // Same text, different status — the panel styles live text differently, so
  // this has to cross even though the words did not move.
  const before = buildPanelTranscript(state([], [utterance("agreed")]));
  const after = buildPanelTranscript(state([segment("agreed")], []));

  assert.equal(panelTranscriptsEqual(before, after), false);
});

test("a change in what was trimmed away is a change", () => {
  const a = buildPanelTranscript(state([segment("1"), segment("2")]), 1);
  const b = buildPanelTranscript(state([segment("0"), segment("1"), segment("2")]), 1);

  assert.equal(a.lines[0].text, b.lines[0].text, "same visible line");
  assert.equal(panelTranscriptsEqual(a, b), false, "but a different amount hidden");
});

test("null compares safely", () => {
  const built = buildPanelTranscript(state([segment("x")]));
  assert.equal(panelTranscriptsEqual(null, null), true);
  assert.equal(panelTranscriptsEqual(null, built), false);
  assert.equal(panelTranscriptsEqual(built, null), false);
});
