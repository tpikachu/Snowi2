const test = require("node:test");
const assert = require("node:assert/strict");

const { createGlobeTapTracker } = require("../../src/helpers/globeTapTracker.js");

test("Fn pressed and released on its own is a tap", () => {
  const tap = createGlobeTapTracker();
  tap.down();
  assert.equal(tap.up(), true);
});

test("a key pressed while Fn is held makes the release a combo, not a tap", () => {
  // The client's case: Fn+Left, Fn+F5, Fn+C — the bar must stay put.
  const tap = createGlobeTapTracker();
  tap.down();
  tap.interrupt();
  assert.equal(tap.up(), false);
});

test("several keys during one hold still count as one combo", () => {
  const tap = createGlobeTapTracker();
  tap.down();
  tap.interrupt();
  tap.interrupt();
  assert.equal(tap.up(), false);
});

test("a release without a press is nothing", () => {
  const tap = createGlobeTapTracker();
  assert.equal(tap.up(), false);
  // And an interrupt with nothing held does not poison the next press.
  tap.interrupt();
  tap.down();
  assert.equal(tap.up(), true);
});

test("a combo does not poison the next press", () => {
  const tap = createGlobeTapTracker();
  tap.down();
  tap.interrupt();
  tap.up();
  tap.down();
  assert.equal(tap.up(), true);
});

test("reset forgets a hold in progress", () => {
  const tap = createGlobeTapTracker();
  tap.down();
  tap.reset();
  assert.equal(tap.up(), false);
});
