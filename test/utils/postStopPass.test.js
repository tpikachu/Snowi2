const test = require("node:test");
const assert = require("node:assert/strict");

const { createPassWaiters } = require("../../src/utils/postStopPass.ts");

test("a waiter receives the pass result for its session and nothing else", async () => {
  const waiters = createPassWaiters();
  const mine = waiters.wait("session-1", 5000);
  const other = waiters.wait("session-2", 50);

  assert.equal(waiters.settle("session-1", ["refined"]), 1);
  assert.deepEqual(await mine, ["refined"]);
  // The other session was never settled: it times out to null.
  assert.equal(await other, null);
  assert.equal(waiters.pending, 0);
});

test("a completion after the timeout is dropped, not resolved twice", async () => {
  const waiters = createPassWaiters();
  const late = waiters.wait("session-1", 10);
  assert.equal(await late, null);
  assert.equal(waiters.settle("session-1", ["too late"]), 0);
  assert.equal(waiters.pending, 0);
});

test("several waiters on one session all settle together", async () => {
  const waiters = createPassWaiters();
  const a = waiters.wait("s", 5000);
  const b = waiters.wait("s", 5000);
  assert.equal(waiters.settle("s", null), 2);
  assert.deepEqual(await Promise.all([a, b]), [null, null]);
});
