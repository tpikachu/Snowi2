const test = require("node:test");
const assert = require("node:assert/strict");

const { resolvePanelBoundsFromAnchor } = require("../../src/helpers/barPanelHandoff");

const WORK_AREA = { x: 0, y: 0, width: 1920, height: 1080 };
const PANEL = { width: 400, height: 620 };

test("the panel opens centred on the bar, growing down from its top edge", () => {
  const bar = { x: 700, y: 200, width: 560, height: 56 };
  const bounds = resolvePanelBoundsFromAnchor(bar, WORK_AREA, PANEL);
  assert.deepEqual(bounds, { x: 780, y: 200, width: 400, height: 620 });
});

test("a bar near the right edge does not push the panel off-screen", () => {
  const bar = { x: 1700, y: 100, width: 560, height: 56 };
  const bounds = resolvePanelBoundsFromAnchor(bar, WORK_AREA, PANEL);
  assert.equal(bounds.x + bounds.width <= WORK_AREA.x + WORK_AREA.width, true);
  assert.equal(bounds.x >= WORK_AREA.x, true);
});

test("a bar near the bottom pulls the panel up so it fits", () => {
  const bar = { x: 700, y: 900, width: 560, height: 56 };
  const bounds = resolvePanelBoundsFromAnchor(bar, WORK_AREA, PANEL);
  assert.equal(bounds.y + bounds.height <= WORK_AREA.y + WORK_AREA.height, true);
});

test("negative-origin displays clamp into their own area, not toward zero", () => {
  // A monitor above the primary one: its work area starts at a negative y.
  const workArea = { x: -1920, y: -1080, width: 1920, height: 1080 };
  const bar = { x: -1900, y: -1070, width: 560, height: 56 };
  const bounds = resolvePanelBoundsFromAnchor(bar, workArea, PANEL);
  assert.equal(bounds.x >= workArea.x, true);
  assert.equal(bounds.y >= workArea.y, true);
  assert.equal(bounds.x + bounds.width <= workArea.x + workArea.width, true);
  assert.equal(bounds.y + bounds.height <= workArea.y + workArea.height, true);
});

test("panel size passes through untouched", () => {
  const bar = { x: 100, y: 100, width: 560, height: 56 };
  const bounds = resolvePanelBoundsFromAnchor(bar, WORK_AREA, { width: 320, height: 500 });
  assert.equal(bounds.width, 320);
  assert.equal(bounds.height, 500);
});
