const test = require("node:test");
const assert = require("node:assert/strict");

const { assistStatesEqual, IDLE_ASSIST } = require("../../src/utils/meetingAssistState.ts");

const withSuggestion = (patch = {}) => ({
  ...IDLE_ASSIST,
  configured: true,
  suggestion: { text: "Ask for the renewal date.", sources: [], stale: false, ...patch },
});

const withAnswer = (patch = {}) => ({
  ...IDLE_ASSIST,
  configured: true,
  answer: {
    question: "what did we agree?",
    text: "15% through Q3.",
    streaming: false,
    sources: [],
    errorKey: null,
    ...patch,
  },
});

test("a rebuilt but identical state is not worth an IPC hop", () => {
  assert.equal(assistStatesEqual(withSuggestion(), withSuggestion()), true);
  assert.equal(assistStatesEqual(withAnswer(), withAnswer()), true);
});

test("one more streamed token counts as a change", () => {
  assert.equal(assistStatesEqual(withAnswer(), withAnswer({ text: "15% through Q3. " })), false);
});

test("an answer finishing counts as a change even with the same text", () => {
  // The panel drops its caret and reveals the sources on this transition, so
  // treating it as no change would leave an answer permanently mid-stream.
  assert.equal(
    assistStatesEqual(withAnswer({ streaming: true }), withAnswer({ streaming: false })),
    false
  );
});

test("a suggestion going stale counts as a change", () => {
  assert.equal(assistStatesEqual(withSuggestion(), withSuggestion({ stale: true })), false);
});

test("different sources behind the same text count as a change", () => {
  assert.equal(
    assistStatesEqual(
      withSuggestion({ sources: [{ noteId: 1, title: "Acme" }] }),
      withSuggestion({ sources: [{ noteId: 2, title: "Acme" }] })
    ),
    false
  );
});

test("appearing and disappearing are both changes", () => {
  assert.equal(assistStatesEqual(IDLE_ASSIST, withSuggestion()), false);
  assert.equal(assistStatesEqual(withAnswer(), IDLE_ASSIST), false);
  assert.equal(assistStatesEqual(null, IDLE_ASSIST), false);
  assert.equal(assistStatesEqual(null, null), true);
});

test("configuring a model mid-meeting reaches the panel", () => {
  assert.equal(assistStatesEqual(IDLE_ASSIST, { ...IDLE_ASSIST, configured: true }), false);
});

test("a suggestion being prepared is distinct from none at all", () => {
  assert.equal(assistStatesEqual(IDLE_ASSIST, { ...IDLE_ASSIST, suggestionPending: true }), false);
});
