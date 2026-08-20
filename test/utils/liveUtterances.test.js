const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/utils/liveUtterances.ts");

const AT = 1_760_000_000_000;

test("a provider without utterance ids keeps one line per source", async () => {
  const { applyPartial } = await load();

  // This is exactly what micPartial/systemPartial did, and it has to keep
  // working: not every provider names its utterances.
  let live = applyPartial([], { text: "hello", source: "mic", at: AT });
  live = applyPartial(live, { text: "hello there", source: "mic", at: AT + 100 });
  live = applyPartial(live, { text: "on my side", source: "system", at: AT + 150 });

  assert.equal(live.length, 2);
  assert.equal(live[0].text, "hello there");
  assert.equal(live[1].text, "on my side");
});

test("two utterances on one source no longer collapse into one line", async () => {
  const { applyPartial } = await load();

  // The headline bug: two people talking at once over system audio used to
  // overwrite each other, because the source was the only key.
  let live = applyPartial([], { text: "I think we should", source: "system", utteranceId: "u1", at: AT });
  live = applyPartial(live, { text: "sorry, go ahead", source: "system", utteranceId: "u2", at: AT + 50 });

  assert.equal(live.length, 2);
  assert.deepEqual(
    live.map((u) => u.text),
    ["I think we should", "sorry, go ahead"]
  );
});

test("a late partial cannot overwrite newer text", async () => {
  const { applyPartial } = await load();

  let live = applyPartial([], { text: "first", source: "mic", utteranceId: "u1", seq: 1, at: AT });
  live = applyPartial(live, { text: "first draft", source: "mic", utteranceId: "u1", seq: 2, at: AT + 10 });
  // Arrives out of order — the provider does not guarantee delivery order, and
  // taking it would read as the transcript losing words.
  live = applyPartial(live, { text: "fir", source: "mic", utteranceId: "u1", seq: 1, at: AT + 20 });

  assert.equal(live.length, 1);
  assert.equal(live[0].text, "first draft");
});

test("a repeated sequence number is a revision, and is taken", async () => {
  const { applyPartial } = await load();

  let live = applyPartial([], { text: "teh", source: "mic", utteranceId: "u1", seq: 4, at: AT });
  live = applyPartial(live, { text: "the", source: "mic", utteranceId: "u1", seq: 4, at: AT + 5 });

  assert.equal(live[0].text, "the");
});

test("empty text withdraws a partial", async () => {
  const { applyPartial } = await load();

  // Main sends text:"" to retract a partial it suppressed — echo bleed, or a
  // mic segment that duplicated system audio.
  let live = applyPartial([], { text: "leaked audio", source: "mic", at: AT });
  live = applyPartial(live, { text: "", source: "mic", at: AT + 10 });

  assert.deepEqual(live, []);
});

test("a withdrawal with no utterance id still clears a keyed caption", async () => {
  const { applyPartial } = await load();

  // The suppression withdrawals in ipcHandlers fire from the *final* path and
  // have no utterance id in hand. Matching on the bare source key would hit
  // nothing and leave the suppressed caption on screen for good.
  let live = applyPartial([], { text: "echo bleed", source: "mic", utteranceId: "u1", at: AT });
  live = applyPartial(live, { text: "", source: "mic", at: AT + 10 });

  assert.deepEqual(live, []);
});

test("a withdrawal clears only its own source", async () => {
  const { applyPartial } = await load();

  let live = applyPartial([], { text: "mine", source: "mic", utteranceId: "m1", at: AT });
  live = applyPartial(live, { text: "theirs", source: "system", utteranceId: "s1", at: AT });
  live = applyPartial(live, { text: "", source: "mic", at: AT + 10 });

  assert.equal(live.length, 1);
  assert.equal(live[0].source, "system");
});

test("a final with no utterance id retires every caption on its source", async () => {
  const { applyPartial, settleUtterance } = await load();

  // Finals carry no utterance id — the provider callbacks hand back accumulated
  // text and a timestamp, nothing more. Keying on the bare source would match
  // nothing now that partials are keyed, so every bubble would persist for the
  // whole meeting while its text was also committed as a segment.
  let live = applyPartial([], { text: "one", source: "system", utteranceId: "u1", at: AT });
  live = applyPartial(live, { text: "two", source: "system", utteranceId: "u2", at: AT + 10 });
  live = applyPartial(live, { text: "mine", source: "mic", utteranceId: "m1", at: AT + 20 });

  live = settleUtterance(live, { source: "system" });

  assert.equal(live.length, 1);
  assert.equal(live[0].source, "mic");
});

test("a final that does name its utterance retires only that one", async () => {
  const { applyPartial, settleUtterance } = await load();

  // No provider does this today; the path exists so one that starts naming its
  // finals gets precise retirement without another change here.
  let live = applyPartial([], { text: "one", source: "system", utteranceId: "u1", at: AT });
  live = applyPartial(live, { text: "two", source: "system", utteranceId: "u2", at: AT + 10 });

  live = settleUtterance(live, { source: "system", utteranceId: "u1" });

  assert.equal(live.length, 1);
  assert.equal(live[0].text, "two");
});

test("speaker identity arriving late does not erase, and absent does not clear", async () => {
  const { applyPartial } = await load();

  let live = applyPartial([], { text: "hi", source: "system", utteranceId: "u1", at: AT });
  assert.equal(live[0].speakerId, null);

  live = applyPartial(live, {
    text: "hi there",
    source: "system",
    utteranceId: "u1",
    speakerId: "spk-2",
    speakerName: "Dana",
    at: AT + 10,
  });
  assert.equal(live[0].speakerName, "Dana");

  // A later partial that simply does not carry speaker fields must not undo it.
  live = applyPartial(live, { text: "hi there again", source: "system", utteranceId: "u1", at: AT + 20 });
  assert.equal(live[0].speakerId, "spk-2");
  assert.equal(live[0].speakerName, "Dana");

  // An explicit null does clear it, which is how a misattribution gets undone.
  live = applyPartial(live, {
    text: "hi there again",
    source: "system",
    utteranceId: "u1",
    speakerId: null,
    speakerName: null,
    at: AT + 30,
  });
  assert.equal(live[0].speakerId, null);
});

test("stale utterances are pruned, and a clean list keeps its identity", async () => {
  const { applyPartial, pruneStaleUtterances } = await load();

  let live = applyPartial([], { text: "old", source: "mic", utteranceId: "u1", at: AT });
  live = applyPartial(live, { text: "new", source: "system", utteranceId: "u2", at: AT + 9_000 });

  const pruned = pruneStaleUtterances(live, AT + 10_000, 5_000);
  assert.equal(pruned.length, 1);
  assert.equal(pruned[0].text, "new");

  // Identity preserved when nothing is dropped, so this can run on a timer
  // without waking every subscriber.
  assert.equal(pruneStaleUtterances(pruned, AT + 10_000, 5_000), pruned);
});

test("applying a system speaker touches system utterances only", async () => {
  const { applyPartial, applySpeakerToLiveUtterances } = await load();

  let live = applyPartial([], { text: "mine", source: "mic", utteranceId: "m1", at: AT });
  live = applyPartial(live, { text: "theirs", source: "system", utteranceId: "s1", at: AT });

  const next = applySpeakerToLiveUtterances(live, "spk-3", "Marcus");
  assert.equal(next.find((u) => u.source === "mic").speakerId, null);
  assert.equal(next.find((u) => u.source === "system").speakerName, "Marcus");

  // No-op returns the same array so an unchanged store does not re-render.
  assert.equal(applySpeakerToLiveUtterances(next, "spk-3", "Marcus"), next);
});

test("a speaker label lands on the utterance being spoken, not every system line", async () => {
  const { applyPartial, applySpeakerToLiveUtterances } = await load();

  // Stamping every system caption would hand one speaker's name to another's
  // line the moment two are in flight — exactly what the keying prevents.
  let live = applyPartial([], { text: "earlier", source: "system", utteranceId: "s1", at: AT });
  live = applyPartial(live, { text: "later", source: "system", utteranceId: "s2", at: AT + 500 });

  const next = applySpeakerToLiveUtterances(live, "spk-9", "Dana");
  assert.equal(next.find((u) => u.key === "system:s1").speakerName, null);
  assert.equal(next.find((u) => u.key === "system:s2").speakerName, "Dana");
});

test("removals that remove nothing keep the array identity", async () => {
  const { applyPartial, settleUtterance, pruneStaleUtterances } = await load();

  // Identity is the store's re-render signal, and these are usually no-ops:
  // main emits a withdrawal for every mic interim while echo bleed is
  // suspected, and finals arrive for sources whose caption is already gone. A
  // fresh array each time repaints the transcript pane several times a second.
  const live = applyPartial([], { text: "theirs", source: "system", utteranceId: "s1", at: AT });

  assert.equal(applyPartial(live, { text: "", source: "mic", at: AT + 1 }), live);
  assert.equal(settleUtterance(live, { source: "mic" }), live);
  assert.equal(settleUtterance(live, { source: "system", utteranceId: "nope" }), live);
  assert.equal(pruneStaleUtterances(live, AT + 1, 30_000), live);
});
