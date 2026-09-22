/**
 * What is behind the assistant dot: light or dark.
 *
 * The dot is dark glass, and on a dark desktop or a dark app it all but
 * disappears (client, 2026-09-22: "in the dark background it's hard to
 * identify our icon"). Main samples the screen under the dot's window every
 * few seconds — one small thumbnail of the display it sits on, the dot
 * itself excluded from the grab the way the observe capture excludes it —
 * and tells the renderer which tone the backdrop has; the dot then wears
 * the opposite one. macOS needs the Screen Recording permission for any
 * screen grab, so without it the dot keeps its default.
 *
 * The pixel arithmetic is pure and unit-tested; `sampleDotBackdrop` is the
 * Electron-bound part.
 */
const { screen, desktopCapturer, systemPreferences } = require("electron");
const debugLogger = require("./debugLogger");

/** Thumbnail scale: 1/8 of the display is plenty for an average. */
const SAMPLE_SCALE = 1 / 8;
/** Hysteresis: a backdrop must be clearly one or the other to flip the dot. */
const LIGHT_ABOVE = 0.55;
const DARK_BELOW = 0.45;
/** Content protection takes a frame or two to reach the compositor. */
const HIDE_SETTLE_MS = 80;

/**
 * Average relative luminance (0–1) of a rectangle of a BGRA bitmap, or null
 * when the rectangle holds no pixel.
 */
function averageLuminance(bitmap, width, height, rect) {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(width, Math.ceil(rect.x + rect.width));
  const y1 = Math.min(height, Math.ceil(rect.y + rect.height));
  if (x1 <= x0 || y1 <= y0) return null;
  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const b = bitmap[i];
      const g = bitmap[i + 1];
      const r = bitmap[i + 2];
      sum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

/**
 * "light" or "dark" for a luminance, holding the previous answer inside the
 * hysteresis band so a backdrop near the middle does not make the dot
 * flicker between tones.
 */
function backdropTone(luminance, previous = null) {
  if (luminance === null || luminance === undefined || Number.isNaN(luminance)) return previous;
  if (luminance >= LIGHT_ABOVE) return "light";
  if (luminance <= DARK_BELOW) return "dark";
  return previous ?? (luminance >= 0.5 ? "light" : "dark");
}

/** The display's thumbnail rectangle that a window's bounds map onto. */
function thumbnailRect(bounds, displayBounds, thumbWidth, thumbHeight) {
  const sx = thumbWidth / Math.max(1, displayBounds.width);
  const sy = thumbHeight / Math.max(1, displayBounds.height);
  return {
    x: (bounds.x - displayBounds.x) * sx,
    y: (bounds.y - displayBounds.y) * sy,
    width: Math.max(1, bounds.width * sx),
    height: Math.max(1, bounds.height * sy),
  };
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Samples the screen under `bounds` (the dot window) and returns "light",
 * "dark", or null when nothing could be read (no permission, no source).
 * `hideFromCapture` returns a restore function — the window manager's
 * `hideAgentWindowFromCapture` — so the dot never measures itself.
 */
async function sampleDotBackdrop(bounds, { previous = null, hideFromCapture } = {}) {
  if (
    process.platform === "darwin" &&
    systemPreferences.getMediaAccessStatus("screen") !== "granted"
  ) {
    return null;
  }
  const display = screen.getDisplayMatching(bounds);
  const thumbnailSize = {
    width: Math.max(1, Math.round(display.size.width * SAMPLE_SCALE)),
    height: Math.max(1, Math.round(display.size.height * SAMPLE_SCALE)),
  };
  const restore = hideFromCapture ? hideFromCapture() : () => {};
  try {
    await delay(HIDE_SETTLE_MS);
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize });
    const source = sources.find((s) => s.display_id === String(display.id)) || sources[0];
    if (!source || source.thumbnail.isEmpty()) return null;
    const size = source.thumbnail.getSize();
    const bitmap = source.thumbnail.toBitmap();
    const rect = thumbnailRect(bounds, display.bounds, size.width, size.height);
    return backdropTone(averageLuminance(bitmap, size.width, size.height, rect), previous);
  } catch (error) {
    debugLogger.debug("Dot backdrop sample failed", { error: error.message }, "agent");
    return null;
  } finally {
    restore();
  }
}

module.exports = {
  averageLuminance,
  backdropTone,
  thumbnailRect,
  sampleDotBackdrop,
  LIGHT_ABOVE,
  DARK_BELOW,
};
