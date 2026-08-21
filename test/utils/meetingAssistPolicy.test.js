const test = require("node:test");
const assert = require("node:assert/strict");

const {
  selectAssistWindow,
  decideAssistRequest,
  markRequested,
  markSettled,
  isSuggestionStale,
  IDLE_SCHEDULER,
  ASSIST_WINDOW_MS,
  ASSIST_WINDOW_CHARS,
  MIN_REQUEST_INTERVAL_MS,
  MIN_NEW_WORDS,
  SUGGESTION_STALE_MS,
} = require("../../src/utils/meetingAssistPolicy.ts");

const NOW = 1_000_000;

const seg = (text, source, timestamp) => ({ text, source, timestamp });

/** A sentence long enough to clear MIN_NEW_WORDS on its own. */
const sentence = (n) => Array.from({ length: MIN_NEW_WORDS + 2 }, (_, i) => `w${n}x${i}`).join(" ");

test("the window keeps only recent talk", () => {
  const segments = [
    seg("ancient", "system", NOW - ASSIST_WINDOW_MS - 1),
    seg("recent", "system", NOW - 1_000),
  ];

  const window = selectAssistWindow(segments, NOW);

  assert.deepEqual(
    window.map((s) => s.text),
    ["recent"]
  );
});

test("the window is trimmed from the front, keeping the newest talk", () => {
  // What survives the cap has to be what was just said. Trimming the other way
  // would advise on the oldest thing still in the window.
  const segments = [
    seg("A".repeat(2_000), "system", NOW - 3_000),
    seg("B".repeat(2_000), "system", NOW - 1_000),
  ];

  const window = selectAssistWindow(segments, NOW, { maxChars: ASSIST_WINDOW_CHARS });

  assert.equal(window.length, 1);
  assert.ok(window[0].text.startsWith("B"));
});

test("a single oversized segment is still included", () => {
  // Otherwise one long monologue produces an empty window and the assistant
  // goes silent exactly when there is most to respond to.
  const segments = [seg("C".repeat(5_000), "system", NOW - 1_000)];

  const window = selectAssistWindow(segments, NOW);

  assert.equal(window.length, 1);
});

test("the window is in speaking order", () => {
  const segments = [
    seg("first", "system", NOW - 3_000),
    seg("second", "mic", NOW - 2_000),
    seg("third", "system", NOW - 1_000),
  ];

  assert.deepEqual(
    selectAssistWindow(segments, NOW).map((s) => s.text),
    ["first", "second", "third"]
  );
});

test("a suggestion is computed when the other side stops talking", () => {
  const window = [seg(sentence(1), "system", NOW - 500)];

  const decision = decideAssistRequest({
    isRecording: true,
    isPaused: false,
    window,
    scheduler: IDLE_SCHEDULER,
    now: NOW,
  });

  assert.equal(decision.request, true);
  assert.equal(decision.reason, "theyStoppedTalking");
});

test("nothing is computed right after the user speaks", () => {
  // The whole feature is for the moment someone is put on the spot. Just after
  // speaking they need nothing, and precomputing there would spend half the
  // meeting's calls on the half where the answer is never read.
  const window = [seg(sentence(1), "system", NOW - 2_000), seg(sentence(2), "mic", NOW - 500)];

  const decision = decideAssistRequest({
    isRecording: true,
    isPaused: false,
    window,
    scheduler: IDLE_SCHEDULER,
    now: NOW,
  });

  assert.equal(decision.request, false);
  assert.equal(decision.reason, "youSpokeLast");
});

test("calls are throttled even when the other side keeps talking", () => {
  const window = [seg(sentence(1), "system", NOW - 100)];
  const scheduler = { ...IDLE_SCHEDULER, lastRequestAt: NOW - (MIN_REQUEST_INTERVAL_MS - 1) };

  const decision = decideAssistRequest({
    isRecording: true,
    isPaused: false,
    window,
    scheduler,
    now: NOW,
  });

  assert.equal(decision.request, false);
  assert.equal(decision.reason, "throttled");
});

test("the throttle lifts once the interval has passed", () => {
  const window = [seg(sentence(1), "system", NOW - 100)];
  const scheduler = { ...IDLE_SCHEDULER, lastRequestAt: NOW - MIN_REQUEST_INTERVAL_MS };

  assert.equal(
    decideAssistRequest({
      isRecording: true,
      isPaused: false,
      window,
      scheduler,
      now: NOW,
    }).request,
    true
  );
});

test("a few new words are not worth a call", () => {
  const window = [seg(sentence(1), "system", NOW - 100)];
  const scheduler = markSettled(markRequested(IDLE_SCHEDULER, window, NOW - 10_000));

  const nudged = [...window, seg("mm hm", "system", NOW - 100)];
  const decision = decideAssistRequest({
    isRecording: true,
    isPaused: false,
    window: nudged,
    scheduler,
    now: NOW,
  });

  assert.equal(decision.request, false);
  assert.equal(decision.reason, "tooLittleNew");
});

test("short exchanges accumulate into one call instead of never firing", () => {
  // Measured against the last request rather than the last segment, so a run of
  // three-word segments eventually adds up to something worth answering.
  const base = [seg(sentence(1), "system", NOW - 20_000)];
  const scheduler = markSettled(markRequested(IDLE_SCHEDULER, base, NOW - 20_000));

  // Three short segments, together comfortably past MIN_NEW_WORDS. None of
  // them would clear the bar alone, which is the point.
  const grown = [
    ...base,
    seg("yes but", "system", NOW - 3_000),
    seg("the other thing here", "system", NOW - 2_000),
    seg("is what really worries me the most about all of it", "system", NOW - 1_000),
  ];

  const decision = decideAssistRequest({
    isRecording: true,
    isPaused: false,
    window: grown,
    scheduler,
    now: NOW,
  });

  assert.equal(decision.request, true);
});

test("only one request is outstanding at a time", () => {
  const window = [seg(sentence(1), "system", NOW - 100)];
  const scheduler = markRequested(IDLE_SCHEDULER, window, NOW - 10_000);

  const decision = decideAssistRequest({
    isRecording: true,
    isPaused: false,
    window: [...window, seg(sentence(2), "system", NOW - 50)],
    scheduler,
    now: NOW,
  });

  assert.equal(decision.request, false);
  assert.equal(decision.reason, "inFlight");
});

test("a failed request does not immediately retry itself", () => {
  // markSettled clears the in-flight flag but keeps the word mark, so the same
  // input cannot bounce straight back into the call that just failed.
  const window = [seg(sentence(1), "system", NOW - 10_000)];
  const scheduler = markSettled(markRequested(IDLE_SCHEDULER, window, NOW - 10_000));

  const decision = decideAssistRequest({
    isRecording: true,
    isPaused: false,
    window,
    scheduler,
    now: NOW,
  });

  assert.equal(decision.request, false);
  assert.equal(decision.reason, "tooLittleNew");
});

test("a paused or stopped meeting computes nothing", () => {
  const window = [seg(sentence(1), "system", NOW - 100)];

  assert.equal(
    decideAssistRequest({
      isRecording: true,
      isPaused: true,
      window,
      scheduler: IDLE_SCHEDULER,
      now: NOW,
    }).reason,
    "paused"
  );
  assert.equal(
    decideAssistRequest({
      isRecording: false,
      isPaused: false,
      window,
      scheduler: IDLE_SCHEDULER,
      now: NOW,
    }).reason,
    "notRecording"
  );
});

test("an empty window computes nothing", () => {
  assert.equal(
    decideAssistRequest({
      isRecording: true,
      isPaused: false,
      window: [],
      scheduler: IDLE_SCHEDULER,
      now: NOW,
    }).request,
    false
  );
});

test("staleness is measured by conversation, not by the clock", () => {
  // A meeting that goes quiet for two minutes has not invalidated the advice —
  // nobody said anything to invalidate it with.
  assert.equal(
    isSuggestionStale({
      suggestedAtSegmentTime: NOW - SUGGESTION_STALE_MS - 1,
      newestSegmentAt: NOW - SUGGESTION_STALE_MS - 1,
    }),
    false,
    "no new talk means not stale"
  );

  assert.equal(
    isSuggestionStale({
      suggestedAtSegmentTime: NOW - SUGGESTION_STALE_MS - 1,
      newestSegmentAt: NOW,
    }),
    true,
    "a minute of new talk means stale"
  );
});

test("a suggestion with nothing to compare against is not stale", () => {
  assert.equal(isSuggestionStale({ suggestedAtSegmentTime: null, newestSegmentAt: NOW }), false);
});
