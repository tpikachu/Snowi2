const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/utils/meetingGaps.ts");

test("opening a gap records the pause start and leaves it open", async () => {
  const { openGap, hasOpenGap } = await load();
  const gaps = openGap([], 1_000);

  assert.deepEqual(gaps, [{ startedAt: 1_000, endedAt: null }]);
  assert.equal(hasOpenGap(gaps), true);
});

test("closing a gap stamps the resume", async () => {
  const { openGap, closeGap, hasOpenGap } = await load();
  const gaps = closeGap(openGap([], 1_000), 4_000);

  assert.deepEqual(gaps, [{ startedAt: 1_000, endedAt: 4_000 }]);
  assert.equal(hasOpenGap(gaps), false);
});

test("pause and resume can repeat, each span kept separately", async () => {
  const { openGap, closeGap } = await load();
  let gaps = closeGap(openGap([], 1_000), 2_000);
  gaps = closeGap(openGap(gaps, 5_000), 9_000);

  assert.deepEqual(gaps, [
    { startedAt: 1_000, endedAt: 2_000 },
    { startedAt: 5_000, endedAt: 9_000 },
  ]);
});

// Two open gaps would make recorded time ambiguous and strand the first one.
test("pausing twice does not stack a second open gap", async () => {
  const { openGap } = await load();
  const gaps = openGap(openGap([], 1_000), 3_000);

  assert.deepEqual(gaps, [{ startedAt: 1_000, endedAt: null }]);
});

test("resuming when nothing is paused is a no-op", async () => {
  const { closeGap } = await load();
  assert.deepEqual(closeGap([], 1_000), []);
  assert.deepEqual(closeGap([{ startedAt: 1, endedAt: 2 }], 9), [{ startedAt: 1, endedAt: 2 }]);
});

// A clock adjustment mid-pause must not yield a span that ran backwards.
test("a resume earlier than its pause is clamped, never negative", async () => {
  const { openGap, closeGap, totalPausedMs } = await load();
  const gaps = closeGap(openGap([], 5_000), 1_000);

  assert.deepEqual(gaps, [{ startedAt: 5_000, endedAt: 5_000 }]);
  assert.equal(totalPausedMs(gaps, 10_000), 0);
});

test("totals sum closed spans and count an open one up to now", async () => {
  const { totalPausedMs } = await load();
  const gaps = [
    { startedAt: 1_000, endedAt: 2_500 },
    { startedAt: 5_000, endedAt: null },
  ];

  assert.equal(totalPausedMs([], 9_999), 0);
  assert.equal(totalPausedMs(gaps, 6_000), 1_500 + 1_000);
});

test("inputs are never mutated", async () => {
  const { openGap, closeGap } = await load();
  const original = [{ startedAt: 1, endedAt: null }];
  const frozen = JSON.parse(JSON.stringify(original));

  closeGap(original, 5);
  openGap(original, 5);

  assert.deepEqual(original, frozen);
});
