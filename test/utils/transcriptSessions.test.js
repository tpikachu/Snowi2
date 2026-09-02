const test = require("node:test");
const assert = require("node:assert");

const { buildSessionClock, SESSION_BREAK_MS } = require("../../src/utils/transcriptSessions.ts");

const MIN = 60_000;

const seg = (id, timestamp) => ({ id, timestamp });

test("a single session counts every line from its first timestamp", () => {
  const t0 = 1_000_000;
  const clock = buildSessionClock([seg("a", t0), seg("b", t0 + MIN), seg("c", t0 + 5 * MIN)]);
  assert.strictEqual(clock.baseById.get("a"), t0);
  assert.strictEqual(clock.baseById.get("b"), t0);
  assert.strictEqual(clock.baseById.get("c"), t0);
  assert.strictEqual(clock.resumeStartIds.size, 0);
});

test("a jump past the break restarts the clock and marks the session start", () => {
  const t0 = 1_000_000;
  const t1 = t0 + 3 * 60 * MIN; // resumed three hours later
  const clock = buildSessionClock([
    seg("a", t0),
    seg("b", t0 + MIN),
    seg("c", t1),
    seg("d", t1 + MIN),
  ]);
  assert.strictEqual(clock.baseById.get("b"), t0);
  assert.strictEqual(clock.baseById.get("c"), t1);
  assert.strictEqual(clock.baseById.get("d"), t1);
  assert.deepStrictEqual([...clock.resumeStartIds], ["c"]);
});

test("a gap at exactly the threshold is silence, just past it a new session", () => {
  const t0 = 1_000_000;
  const atThreshold = buildSessionClock([seg("a", t0), seg("b", t0 + SESSION_BREAK_MS)]);
  assert.strictEqual(atThreshold.resumeStartIds.size, 0);
  assert.strictEqual(atThreshold.baseById.get("b"), t0);

  const pastThreshold = buildSessionClock([seg("a", t0), seg("b", t0 + SESSION_BREAK_MS + 1)]);
  assert.deepStrictEqual([...pastThreshold.resumeStartIds], ["b"]);
  assert.strictEqual(pastThreshold.baseById.get("b"), t0 + SESSION_BREAK_MS + 1);
});

test("untimestamped segments carry no clock and never break a session", () => {
  const t0 = 1_000_000;
  const clock = buildSessionClock([
    seg("a", t0),
    seg("legacy", null),
    seg("legacy2", undefined),
    seg("b", t0 + MIN),
  ]);
  assert.strictEqual(clock.baseById.has("legacy"), false);
  assert.strictEqual(clock.baseById.has("legacy2"), false);
  assert.strictEqual(clock.baseById.get("b"), t0);
  assert.strictEqual(clock.resumeStartIds.size, 0);
});

test("three sessions each restart at their own base", () => {
  const t0 = 1_000_000;
  const t1 = t0 + 2 * 60 * MIN;
  const t2 = t1 + 24 * 60 * MIN;
  const clock = buildSessionClock([seg("a", t0), seg("b", t1), seg("c", t2)]);
  assert.deepStrictEqual([...clock.resumeStartIds], ["b", "c"]);
  assert.strictEqual(clock.baseById.get("b"), t1);
  assert.strictEqual(clock.baseById.get("c"), t2);
});
