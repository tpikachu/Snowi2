const test = require("node:test");
const assert = require("node:assert/strict");

async function load() {
  return await import("../../src/components/shell/macChrome.ts");
}

// The rail's own width, restated rather than imported: IconRail pulls in
// lucide, i18next and the dev hooks, and this file only needs the number.
const ICON_RAIL_WIDTH_PX = 48;
const CONTEXT_PANE_WIDTH_PX = 280;

test("a header at the window edge leaves the full inset", async () => {
  const { macTopRowInset, MAC_TRAFFIC_LIGHT_INSET_PX } = await load();
  assert.equal(macTopRowInset(0, 8), MAC_TRAFFIC_LIGHT_INSET_PX);
});

test("the icon rail does not cover the traffic lights on its own", async () => {
  const { macTopRowInset, MAC_TRAFFIC_LIGHT_INSET_PX } = await load();

  // The bug this exists for. The rail is 48px, the lights reach 84, so a
  // header starting right after the rail with its normal 8px padding began at
  // 56 — under the yellow and green buttons.
  const inset = macTopRowInset(ICON_RAIL_WIDTH_PX, 8);
  assert.ok(inset > 8, "the rail alone is not enough clearance");
  assert.equal(ICON_RAIL_WIDTH_PX + inset, MAC_TRAFFIC_LIGHT_INSET_PX);
});

test("chrome wider than the lights covers them, and normal padding returns", async () => {
  const { macTopRowInset } = await load();

  // Rail plus context pane: the header sits far to the right of the lights and
  // padding it to 84 would leave a visible gap for no reason.
  assert.equal(macTopRowInset(ICON_RAIL_WIDTH_PX + CONTEXT_PANE_WIDTH_PX, 8), 8);
  assert.equal(macTopRowInset(248, 12), 12);
});

test("no header ever starts inside the traffic lights", async () => {
  const { macTopRowInset, MAC_TRAFFIC_LIGHT_INSET_PX } = await load();

  // The one property that has to hold for every layout: content begins at or
  // past the lights. It is not "always at 84" — once the chrome to the left is
  // wider than they are, padding to 84 would open a gap for nothing.
  for (const covered of [0, 12, ICON_RAIL_WIDTH_PX, 60, 83, 84, 248, 328]) {
    const start = covered + macTopRowInset(covered, 8);
    assert.ok(
      start >= MAC_TRAFFIC_LIGHT_INSET_PX,
      `content starts at ${start} with ${covered}px to its left`
    );
  }
});
