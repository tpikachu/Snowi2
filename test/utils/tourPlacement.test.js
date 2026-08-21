const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer } = require("../lib/rendererTestHarness");

async function load(t) {
  const vite = await createRendererServer(t, { cachePrefix: "snowy-tour-placement-" });
  return await vite.ssrLoadModule("/utils/tourPlacement.ts");
}

const VIEWPORT = { width: 1200, height: 800 };
const POPOVER = { top: 0, left: 0, width: 288, height: 160 };

const rect = (top, left, width = 40, height = 40) => ({ top, left, width, height });

test("uses the preferred side when it fits", async (t) => {
  const { placePopover } = await load(t);

  const placed = placePopover("right", rect(400, 20), POPOVER, VIEWPORT);

  assert.equal(placed.placement, "right");
  assert.equal(placed.left, 20 + 40 + 12);
});

test("flips to the opposite side rather than overflowing", async (t) => {
  const { placePopover } = await load(t);

  // A rail button hard against the left edge: "left" has nowhere to go.
  const placed = placePopover("left", rect(400, 8), POPOVER, VIEWPORT);

  assert.equal(placed.placement, "right");
  assert.ok(placed.left >= 12);
});

test("a popover always lands inside the viewport, wherever the anchor is", async (t) => {
  const { placePopover } = await load(t);

  const corners = [
    rect(0, 0),
    rect(0, VIEWPORT.width - 40),
    rect(VIEWPORT.height - 40, 0),
    rect(VIEWPORT.height - 40, VIEWPORT.width - 40),
    rect(VIEWPORT.height / 2, VIEWPORT.width / 2),
  ];

  // The whole point of the module: an explanation the user cannot read is
  // worse than no tour.
  for (const anchor of corners) {
    for (const preferred of ["top", "bottom", "left", "right"]) {
      const p = placePopover(preferred, anchor, POPOVER, VIEWPORT);
      assert.ok(p.top >= 0, `${preferred} at ${anchor.top},${anchor.left}: top ${p.top}`);
      assert.ok(p.left >= 0, `${preferred} at ${anchor.top},${anchor.left}: left ${p.left}`);
      assert.ok(
        p.top + POPOVER.height <= VIEWPORT.height,
        `${preferred}: bottom ${p.top + POPOVER.height}`
      );
      assert.ok(
        p.left + POPOVER.width <= VIEWPORT.width,
        `${preferred}: right ${p.left + POPOVER.width}`
      );
    }
  }
});

test("a popover taller than the window keeps its top-left visible", async (t) => {
  const { placePopover } = await load(t);

  const tiny = { width: 320, height: 240 };
  const huge = { top: 0, left: 0, width: 288, height: 400 };

  const placed = placePopover("bottom", rect(100, 100), huge, tiny);

  // Clamping to a negative max would push the title off the top of the screen,
  // which is the half the user needs.
  assert.ok(placed.top >= 0);
  assert.ok(placed.left >= 0);
});

test("centres on the anchor along the cross axis", async (t) => {
  const { placePopover } = await load(t);

  const anchor = rect(400, 500, 100, 40);
  const placed = placePopover("bottom", anchor, POPOVER, VIEWPORT);

  assert.equal(placed.left, 500 + 50 - 144);
});

test("the highlight ring is padded but never leaves the viewport", async (t) => {
  const { highlightRect } = await load(t);

  const flush = highlightRect(rect(0, 0), VIEWPORT);
  assert.equal(flush.top, 0, "no negative offsets at the window edge");
  assert.equal(flush.left, 0);

  const inset = highlightRect(rect(100, 100), VIEWPORT);
  assert.equal(inset.top, 94);
  assert.equal(inset.width, 52);
});

test("an unrendered or off-screen anchor is not worth pointing at", async (t) => {
  const { isAnchorVisible } = await load(t);

  assert.equal(isAnchorVisible(rect(400, 400), VIEWPORT), true);
  // display:none and friends measure as a zero box; pointing at it would draw
  // a ring in the top-left corner.
  assert.equal(isAnchorVisible(rect(0, 0, 0, 0), VIEWPORT), false);
  assert.equal(isAnchorVisible(rect(-100, 400), VIEWPORT), false, "scrolled above");
  assert.equal(
    isAnchorVisible(rect(400, VIEWPORT.width + 10), VIEWPORT),
    false,
    "off to the right"
  );
  assert.equal(isAnchorVisible(rect(-20, 400), VIEWPORT), true, "partly visible still counts");
});
