/**
 * Where the meeting panel opens when the bar's Listen button started the
 * meeting: in the bar's place, so pressing Listen reads as the bar becoming
 * the panel rather than a new window appearing across the screen.
 *
 * Pure math, no Electron — the caller passes the display's work area.
 */

/**
 * @param {{x:number,y:number,width:number,height:number}} anchorBounds the bar's last bounds
 * @param {{x:number,y:number,width:number,height:number}} workArea the work area of the display the bar was on
 * @param {{width:number,height:number}} panelSize the panel's intended size
 * @returns {{x:number,y:number,width:number,height:number}}
 */
function resolvePanelBoundsFromAnchor(anchorBounds, workArea, panelSize) {
  const width = panelSize.width;
  const height = panelSize.height;

  // Centred on the bar horizontally, growing downward from the bar's top edge
  // — the same visual origin the user was already looking at.
  let x = Math.round(anchorBounds.x + anchorBounds.width / 2 - width / 2);
  let y = anchorBounds.y;

  // Clamp the whole frame into the work area: a bar dragged near an edge must
  // not hand off to a panel that opens half off-screen.
  x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - width));
  y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - height));

  return { x, y, width, height };
}

module.exports = { resolvePanelBoundsFromAnchor };
