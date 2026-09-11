const { screen, desktopCapturer, systemPreferences } = require("electron");
const debugLogger = require("./debugLogger");

// Vision models downsample images past ~1.5k px on the long edge; capturing
// larger only inflates the payload without adding model-visible detail.
const MAX_EDGE_PX = 1568;
// A 1568px screenshot lands well under the cap at this quality, so spend the
// headroom on legible on-screen text; the ladder below covers the rare
// near-incompressible screen (video, noise) that doesn't fit.
const QUALITY_LADDER = [82, 70, 55];
// Keeps the base64 payload (~1.37x) inside the API's 2.8M character limit
// with room for the transcript, prompt and dictionary.
const MAX_ENCODED_BYTES = 1_500_000;
const FALLBACK_EDGE_PX = 1024;
// The meeting cue card's "observe" capture photographs EVERY display (the
// meeting is rarely on the screen the card is on), so the budget is shared:
// three 1568px screens at quality 70 land near 2.2MB raw, which base64
// (~1.37x) keeps inside the request cap with the transcript and notes.
const MAX_OBSERVE_DISPLAYS = 3;
const TOTAL_OBSERVE_ENCODED_BYTES = 2_400_000;

// Wayland routes desktopCapturer through the xdg-desktop-portal picker (a
// dialog per capture) and cursor coordinates are unreliable there, so screen
// context is unsupported on Wayland rather than half-broken.
function isWaylandSession() {
  return (
    process.platform === "linux" &&
    ((process.env.XDG_SESSION_TYPE || "").toLowerCase() === "wayland" ||
      !!process.env.WAYLAND_DISPLAY)
  );
}

// macOS applies a Screen Recording grant only at process launch:
// getMediaAccessStatus flips to "granted" the moment the user toggles System
// Settings, but desktopCapturer keeps returning stale/blank frames until the
// app relaunches. Snapshot the first reading to detect mid-session grants.
let launchStatus = null;

function getAccessStatus() {
  if (isWaylandSession()) return "unsupported";
  if (process.platform === "darwin") {
    const status = systemPreferences.getMediaAccessStatus("screen");
    if (launchStatus === null) launchStatus = status;
    return status;
  }
  return "granted";
}

function getAccessResult() {
  const status = getAccessStatus();
  return {
    granted: status === "granted",
    status,
    supported: status !== "unsupported",
    needsRelaunch:
      process.platform === "darwin" && status === "granted" && launchStatus !== "granted",
  };
}

// Encodes from the same source bitmap at each step, so lowering quality never
// compounds artifacts from an earlier pass.
function encodeWithinBudget(image, budget = MAX_ENCODED_BYTES) {
  for (const quality of QUALITY_LADDER) {
    const encoded = image.toJPEG(quality);
    if (encoded.length <= budget) return encoded;
  }

  const resized = image.resize({ width: FALLBACK_EDGE_PX, quality: "good" });
  const smallest = resized.toJPEG(QUALITY_LADDER.at(-1));
  return smallest.length <= budget ? smallest : null;
}

/** Displays in reading order — left to right, then top to bottom. */
function sortDisplays(displays) {
  return [...displays].sort(
    (a, b) => (a.bounds?.x ?? 0) - (b.bounds?.x ?? 0) || (a.bounds?.y ?? 0) - (b.bounds?.y ?? 0)
  );
}

/**
 * Which displays an observe capture photographs.
 *
 * `target` is the cue card's choice: "all" (the default — on a multi-monitor
 * desk the meeting is on whichever screen the card is NOT on, and the model
 * is the one that can tell), or "display:<id>" for one screen. A chosen
 * display that has since been unplugged degrades to all rather than to
 * nothing. Over the cap, the primary display is always kept: it is the one a
 * shared screen or a slide deck most often lives on.
 *
 * Pure, so the choice is unit-tested without Electron.
 */
function selectObserveDisplays(displays, target = "all", max = MAX_OBSERVE_DISPLAYS) {
  const ordered = sortDisplays(displays);
  const chosenId = /^display:(-?\d+)$/.exec(String(target ?? ""))?.[1];
  if (chosenId) {
    const chosen = ordered.find((display) => String(display.id) === chosenId);
    if (chosen) return [chosen];
  }
  if (ordered.length <= max) return ordered;
  const kept = ordered.slice(0, max);
  const primary = ordered.find((display) => display.primary);
  if (primary && !kept.includes(primary)) kept[kept.length - 1] = primary;
  return kept;
}

/**
 * The line the prompt introduces a screenshot with, when more than one is
 * attached. Reading order and the primary flag are what let the model say
 * "on your left screen" — and what let the user pick a screen by the same
 * name in the cue card.
 */
function describeDisplay(display, index, total) {
  const size = `${display.size?.width ?? display.bounds?.width ?? "?"}×${
    display.size?.height ?? display.bounds?.height ?? "?"
  }`;
  const primary = display.primary ? ", primary" : "";
  return `Screen ${index + 1} of ${total}${primary}, ${size}`;
}

/** The displays as the cue card lists them. Reading order, like the capture. */
function listDisplays() {
  try {
    const primaryId = screen.getPrimaryDisplay().id;
    return sortDisplays(screen.getAllDisplays()).map((display, index) => ({
      id: display.id,
      index,
      primary: display.id === primaryId,
      width: display.size.width,
      height: display.size.height,
    }));
  } catch {
    return [];
  }
}

/**
 * Photographs the displays an observe-enabled meeting ask should see — every
 * screen by default — as one image each, in reading order, each carrying the
 * label the prompt introduces it with. One desktopCapturer call: it grabs
 * all screens at once, and requesting the vision edge as a square lets each
 * screen scale to fit while keeping its own aspect ratio.
 *
 * Returns an empty array on any failure: a screenshot must never break the
 * question it accompanies.
 */
async function captureObserveDisplays({ target = "all", maxDisplays = MAX_OBSERVE_DISPLAYS } = {}) {
  const accessStatus = getAccessStatus();
  if (accessStatus !== "granted") {
    debugLogger.warn("Screen observe capture skipped", { accessStatus }, "screenContext");
    return [];
  }

  try {
    const primaryId = screen.getPrimaryDisplay().id;
    const displays = selectObserveDisplays(
      screen.getAllDisplays().map((display) => ({ ...display, primary: display.id === primaryId })),
      target,
      maxDisplays
    );
    if (displays.length === 0) return [];

    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: MAX_EDGE_PX, height: MAX_EDGE_PX },
    });
    const budget = Math.min(
      MAX_ENCODED_BYTES,
      Math.floor(TOTAL_OBSERVE_ENCODED_BYTES / displays.length)
    );

    const images = [];
    displays.forEach((display, index) => {
      // display_id can be empty on some Linux setups — positional fallback.
      const source =
        sources.find((s) => s.display_id === String(display.id)) ??
        (displays.length === 1 ? sources[0] : sources[index]);
      if (!source || source.thumbnail.isEmpty()) {
        debugLogger.warn(
          "Screen observe found no source for a display",
          { displayId: display.id },
          "screenContext"
        );
        return;
      }
      const encoded = encodeWithinBudget(source.thumbnail, budget);
      if (!encoded) {
        debugLogger.warn(
          "Screen observe display too large to send",
          { displayId: display.id },
          "screenContext"
        );
        return;
      }
      images.push({
        mediaType: "image/jpeg",
        data: encoded.toString("base64"),
        label: describeDisplay(display, index, displays.length),
      });
    });
    return images;
  } catch (error) {
    debugLogger.warn("Screen observe capture failed", { error: error.message }, "screenContext");
    return [];
  }
}

// Photographs the display showing the app being dictated into, given that app's
// window rect; without one it falls back to the display under the cursor, which
// on a multi-monitor desk is often not the screen the user is working on.
// Returns null on any failure — a screenshot must never break the dictation
// it accompanies.
async function captureActiveDisplay(targetBounds = null) {
  const accessStatus = getAccessStatus();
  if (accessStatus !== "granted") {
    debugLogger.warn("Screen context capture skipped", { accessStatus }, "screenContext");
    return null;
  }

  try {
    const display = targetBounds
      ? screen.getDisplayMatching(targetBounds)
      : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(display.size.width, display.size.height));
    const thumbnailSize = {
      width: Math.max(1, Math.round(display.size.width * scale)),
      height: Math.max(1, Math.round(display.size.height * scale)),
    };

    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize });
    // display_id can be empty on some Linux setups — fall back to the first screen.
    const source = sources.find((s) => s.display_id === String(display.id)) || sources[0];
    if (!source || source.thumbnail.isEmpty()) {
      debugLogger.warn("Screen context capture found no screen source", {}, "screenContext");
      return null;
    }

    const encoded = encodeWithinBudget(source.thumbnail);
    if (!encoded) {
      debugLogger.warn("Screen context too large to send", {}, "screenContext");
      return null;
    }

    return { mediaType: "image/jpeg", data: encoded.toString("base64") };
  } catch (error) {
    debugLogger.warn("Screen context capture failed", { error: error.message }, "screenContext");
    return null;
  }
}

// There is no askForMediaAccess("screen") on macOS; attempting a capture is
// what registers the app in the Screen Recording TCC list and triggers the
// one-time OS prompt.
async function requestAccess() {
  if (process.platform === "darwin" && getAccessStatus() !== "granted") {
    await desktopCapturer
      .getSources({ types: ["screen"], thumbnailSize: { width: 1, height: 1 } })
      .catch(() => {});
  }
  return getAccessStatus();
}

module.exports = {
  getAccessStatus,
  getAccessResult,
  captureActiveDisplay,
  captureObserveDisplays,
  listDisplays,
  selectObserveDisplays,
  describeDisplay,
  requestAccess,
  MAX_OBSERVE_DISPLAYS,
};
