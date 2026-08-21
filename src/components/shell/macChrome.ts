/**
 * Room the macOS window controls need, and who has to leave it.
 *
 * The control panel is frameless with `titleBarStyle: "hiddenInset"`, so the
 * traffic lights are drawn *over* the renderer at `trafficLightPosition`
 * (x:20, y:20 — see `windowConfig.js`). Nothing in the layout knows they are
 * there; every column that puts content in the window's top row has to leave
 * space for them itself.
 */

/**
 * How far the traffic lights reach in from the window's left edge: x:20, plus
 * three 12px buttons and their gaps, plus breathing room.
 *
 * Change `trafficLightPosition` in `windowConfig.js` and this moves with it.
 */
export const MAC_TRAFFIC_LIGHT_INSET_PX = 84;

/**
 * Left padding a top-row header needs to clear the traffic lights, given the
 * chrome that already sits between it and the window's left edge.
 *
 * The trap this exists to close: a column to the left does not automatically
 * cover them. The icon rail is 48px against the lights' 84, so a header beside
 * the rail still overlaps by 36 — which is exactly how the section title ended
 * up printed under the yellow and green buttons. Anything wider than the
 * lights covers them outright and the header keeps its normal padding.
 *
 * @param coveredPx  width of the chrome to this header's left, 0 at the edge
 * @param normalPx   padding to use when the lights are already covered
 */
export function macTopRowInset(coveredPx: number, normalPx: number): number {
  return Math.max(normalPx, MAC_TRAFFIC_LIGHT_INSET_PX - coveredPx);
}
