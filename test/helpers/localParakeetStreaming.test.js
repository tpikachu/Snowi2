const test = require("node:test");
const assert = require("node:assert/strict");

const { LocalParakeetStreaming } = require("../../src/helpers/localParakeetStreaming.js");

/**
 * Stand-in for the online websocket server. `emit` plays server messages
 * through the same path `createOnlineStream` calls `onResult` from, so these
 * tests exercise the caption behaviour without a model or a socket.
 */
function fakeWsServer() {
  const sent = [];
  let handlers = null;
  let finished = false;

  return {
    sent,
    get finished() {
      return finished;
    },
    emit(result) {
      handlers.onResult(result);
    },
    fail(error) {
      handlers.onError(error);
    },
    createOnlineStream(h) {
      handlers = h;
      return {
        sendPcm16: (buffer) => sent.push(buffer),
        finish: async () => {
          finished = true;
          return { text: "", truncated: false };
        },
        abort: () => {},
      };
    },
  };
}

async function connected() {
  const server = fakeWsServer();
  const client = new LocalParakeetStreaming(server);
  const partials = [];
  const finals = [];
  client.onPartialTranscript = (text, meta) => partials.push({ text, ...meta });
  client.onFinalTranscript = (text) => finals.push(text);
  await client.connect({ source: "system" });
  return { server, client, partials, finals };
}

test("a refining segment streams as partials, not as finished sentences", async () => {
  // The whole point of the change: text has to reach the screen while the
  // sentence is still being spoken. Each of these is one server message.
  const { server, partials, finals } = await connected();

  server.emit({ text: "so", segment: 0, isFinal: false });
  server.emit({ text: "so the", segment: 0, isFinal: false });
  server.emit({ text: "so the plan", segment: 0, isFinal: false });

  assert.deepEqual(
    partials.map((p) => p.text),
    ["so", "so the", "so the plan"]
  );
  assert.equal(finals.length, 0, "nothing is committed until the server says final");
});

test("partials carry a stable utterance id and a rising sequence", async () => {
  // Identity is what keeps one segment's refinements replacing each other
  // instead of stacking up as separate caption lines; the sequence is what lets
  // the renderer drop one that arrives late.
  const { server, partials } = await connected();

  server.emit({ text: "one", segment: 7, isFinal: false });
  server.emit({ text: "one two", segment: 7, isFinal: false });

  assert.equal(partials[0].utteranceId, "7");
  assert.equal(partials[1].utteranceId, "7");
  assert.ok(partials[1].seq > partials[0].seq);
});

test("two segments get different ids", async () => {
  const { server, partials } = await connected();

  server.emit({ text: "first", segment: 0, isFinal: false });
  server.emit({ text: "second", segment: 1, isFinal: false });

  assert.notEqual(partials[0].utteranceId, partials[1].utteranceId);
});

test("a final commits the line and withdraws its own caption", async () => {
  // Without the withdrawal the partial bubble stays on screen directly above
  // the settled line it just became — the same text twice.
  const { server, client, partials, finals } = await connected();

  server.emit({ text: "so the plan", segment: 0, isFinal: false });
  server.emit({ text: "So the plan is Thursday.", segment: 0, isFinal: true });

  assert.deepEqual(finals, ["So the plan is Thursday."]);
  assert.deepEqual(client.completedSegments, ["So the plan is Thursday."]);

  const withdrawal = partials[partials.length - 1];
  assert.equal(withdrawal.text, "", "the caption for this segment must be cleared");
  assert.equal(withdrawal.utteranceId, "0", "and cleared by id, not by clearing the source");
});

test("a revised final replaces its line instead of appending a second one", async () => {
  const { server, client } = await connected();

  server.emit({ text: "meet at nine", segment: 0, isFinal: true });
  server.emit({ text: "meet at 9.", segment: 0, isFinal: true });

  assert.deepEqual(client.completedSegments, ["meet at 9."]);
});

test("an identical repeat of a final changes nothing", async () => {
  const { server, client, finals } = await connected();

  server.emit({ text: "agreed", segment: 0, isFinal: true });
  const after = finals.length;
  server.emit({ text: "agreed", segment: 0, isFinal: true });

  assert.deepEqual(client.completedSegments, ["agreed"]);
  assert.equal(finals.length, after, "a duplicate must not re-fire the final handler");
});

test("revising an older segment does not republish the newest one", async () => {
  // The consumer reads completedSegments[length - 1] to decide what just
  // landed. Announcing a revision of an older line would hand it the newest
  // line a second time, putting a duplicate in the transcript.
  const { server, client, finals } = await connected();

  server.emit({ text: "first", segment: 0, isFinal: true });
  server.emit({ text: "second", segment: 1, isFinal: true });
  const before = finals.length;

  server.emit({ text: "first, corrected", segment: 0, isFinal: true });

  assert.equal(finals.length, before, "no announcement for a stale segment");
  assert.deepEqual(client.completedSegments, ["first, corrected", "second"]);
  assert.ok(
    client.accumulatedText.includes("first, corrected"),
    "the correction still reaches the stored transcript"
  );
});

test("segments keep their order across interleaved finals", async () => {
  const { server, client } = await connected();

  server.emit({ text: "first line", segment: 0, isFinal: true });
  server.emit({ text: "second line", segment: 1, isFinal: true });
  server.emit({ text: "first line, revised", segment: 0, isFinal: true });

  assert.deepEqual(client.completedSegments, ["first line, revised", "second line"]);
});

test("unlabelled finals each become their own line", async () => {
  // A server message with no segment id must not fold every result into one.
  const { server, client } = await connected();

  server.emit({ text: "alpha", segment: null, isFinal: true });
  server.emit({ text: "beta", segment: null, isFinal: true });

  assert.deepEqual(client.completedSegments, ["alpha", "beta"]);
});

test("empty results are ignored", async () => {
  const { server, partials, finals } = await connected();

  server.emit({ text: "", segment: 0, isFinal: false });
  server.emit({ text: "", segment: 0, isFinal: true });

  assert.equal(partials.length, 0);
  assert.equal(finals.length, 0);
});

test("audio is downsampled from the meeting's 24 kHz to the model's 16 kHz", async () => {
  // Sending 24 kHz audio to a 16 kHz model does not fail — it transcribes
  // sped-up nonsense, which is far harder to notice than a crash.
  const { server, client } = await connected();

  // 240 samples = 10 ms at 24 kHz, so 160 samples = 320 bytes at 16 kHz.
  const sent = client.sendAudio(Buffer.alloc(240 * 2));

  assert.equal(sent, true);
  assert.equal(server.sent.length, 1);
  assert.equal(server.sent[0].length, 160 * 2);
});

test("audio sent before connect or after close is dropped, not thrown", async () => {
  const server = fakeWsServer();
  const client = new LocalParakeetStreaming(server);

  assert.equal(client.sendAudio(Buffer.alloc(480)), false, "before connect");

  await client.connect({ source: "mic" });
  await client.disconnect();
  assert.equal(client.sendAudio(Buffer.alloc(480)), false, "after close");
});

test("disconnect flushes rather than aborting, so the last words still land", async () => {
  // Stop is pressed right after someone finishes talking; the tail of that
  // sentence is still in the server. Aborting would discard it.
  const { server, client } = await connected();

  await client.disconnect();

  assert.equal(server.finished, true);
  assert.equal(client.isConnected, false);
});

test("a stream error is reported without tearing down the meeting", async () => {
  const { server, client } = await connected();
  const errors = [];
  client.onError = (error) => errors.push(error.message);

  server.fail(new Error("socket died"));

  assert.deepEqual(errors, ["socket died"]);
});
