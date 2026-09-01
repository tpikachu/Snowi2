const path = require("path");

const isGnomeWayland =
  process.platform === "linux" &&
  process.env.XDG_SESSION_TYPE === "wayland" &&
  /gnome|ubuntu|unity/i.test(process.env.XDG_CURRENT_DESKTOP || "");

const isKDEWayland =
  process.platform === "linux" &&
  process.env.XDG_SESSION_TYPE === "wayland" &&
  /kde/i.test(process.env.XDG_CURRENT_DESKTOP || "");

const MAIN_OVERLAY_TYPE =
  process.platform === "darwin"
    ? "panel"
    : process.platform === "linux"
      ? isGnomeWayland || isKDEWayland
        ? "normal"
        : "toolbar"
      : "normal";

const FLOATING_OVERLAY_TYPE =
  process.platform === "darwin"
    ? "panel"
    : process.platform === "linux"
      ? isKDEWayland
        ? "normal"
        : "toolbar"
      : "normal";

const WINDOW_SIZES = {
  BASE: { width: 96, height: 96 },
  WITH_MENU: { width: 240, height: 280 },
  WITH_TOAST: { width: 400, height: 500 },
  EXPANDED: { width: 400, height: 500 },
};

// Test seam, mirroring SNOWY_USER_DATA_DIR in main.js: Playwright's video
// recording cannot attach to a sandboxed Electron renderer — the very first
// loadURL hangs or dies with ERR_FAILED — so the demo recorder
// (scripts/record-demo.js) asks for the renderer sandbox to be off. Honoured
// only off the production channel, so a packaged app can never be
// de-sandboxed by an environment variable.
const RENDERER_SANDBOX = !(
  process.env.SNOWY_DISABLE_RENDERER_SANDBOX && process.env.SNOWY_CHANNEL !== "production"
);

// Main dictation window configuration
const MAIN_WINDOW_CONFIG = {
  width: WINDOW_SIZES.BASE.width,
  height: WINDOW_SIZES.BASE.height,
  title: "Voice Recorder",
  webPreferences: {
    preload: path.join(__dirname, "..", "..", "preload.js"),
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: RENDERER_SANDBOX,
  },
  frame: false,
  alwaysOnTop: true,
  resizable: false,
  transparent: true,
  show: false,
  skipTaskbar: true,
  focusable: false,
  visibleOnAllWorkspaces: process.platform !== "win32",
  fullScreenable: false,
  hasShadow: false,
  acceptsFirstMouse: true,
  type: MAIN_OVERLAY_TYPE,
};

// Control panel window configuration
const CONTROL_PANEL_CONFIG = {
  width: 1200,
  height: 800,
  backgroundColor: "#1c1c2e",
  webPreferences: {
    preload: path.join(__dirname, "..", "..", "preload.js"),
    nodeIntegration: false,
    contextIsolation: true,
    // sandbox: false is required because the preload script bridges IPC
    // between the renderer and main process.
    sandbox: false,
    // webSecurity: false disables same-origin policy. Required because in
    // production the renderer loads from a file:// origin but makes
    // cross-origin fetch calls to Better Auth, Gemini, OpenAI, and Groq APIs
    // directly from the browser. These would be blocked by CORS otherwise.
    webSecurity: false,
    spellcheck: false,
    backgroundThrottling: false,
  },
  title: "Control Panel",
  resizable: true,
  show: false,
  frame: false,
  ...(process.platform === "darwin" && {
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 20, y: 20 },
  }),
  transparent: false,
  minimizable: true,
  maximizable: true,
  closable: true,
  fullscreenable: true,
  skipTaskbar: false,
  alwaysOnTop: false,
  visibleOnAllWorkspaces: false,
  type: "normal",
};

const NOTIFICATION_WINDOW_CONFIG = {
  width: 392,
  height: 92,
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  skipTaskbar: true,
  resizable: false,
  focusable: false,
  hasShadow: false,
  show: false,
  webPreferences: {
    preload: path.join(__dirname, "..", "..", "preload.js"),
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: RENDERER_SANDBOX,
  },
  visibleOnAllWorkspaces: process.platform !== "win32",
  type: FLOATING_OVERLAY_TYPE,
};

const TRANSCRIPTION_PREVIEW_SIZE_LIMITS = {
  minWidth: 400,
  defaultWidth: 460,
  maxWidth: 640,
  minHeight: 96,
  defaultHeight: 132,
  maxHeight: 520,
};

const TRANSCRIPTION_PREVIEW_CONFIG = {
  width: TRANSCRIPTION_PREVIEW_SIZE_LIMITS.defaultWidth,
  height: TRANSCRIPTION_PREVIEW_SIZE_LIMITS.defaultHeight,
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  skipTaskbar: true,
  resizable: false,
  focusable: false,
  hasShadow: false,
  show: false,
  acceptsFirstMouse: true,
  webPreferences: {
    preload: path.join(__dirname, "..", "..", "preload.js"),
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: RENDERER_SANDBOX,
  },
  visibleOnAllWorkspaces: process.platform !== "win32",
  type: FLOATING_OVERLAY_TYPE,
};

// Spec §12.1 requires the meeting panel to be resizable, so these are real
// bounds rather than a fixed size: wide enough for a title and a clock at the
// minimum, tall enough at the maximum for the context panel that lands later.
/**
 * A side panel, not a status bar.
 *
 * It was a 56px strip that showed the clock and three buttons, back when the
 * meeting itself lived in the main window. Now the main window minimises when a
 * meeting starts and this is where the meeting happens: suggestions, a live
 * transcript, and the question box. That needs height.
 *
 * `minHeight` stays low enough to collapse it back to roughly a bar for anyone
 * who wants only the controls.
 */
const MEETING_PANEL_SIZE_LIMITS = {
  minWidth: 320,
  defaultWidth: 400,
  maxWidth: 720,
  minHeight: 56,
  defaultHeight: 620,
  maxHeight: 1200,
};

const MEETING_PANEL_CONFIG = {
  width: MEETING_PANEL_SIZE_LIMITS.defaultWidth,
  height: MEETING_PANEL_SIZE_LIMITS.defaultHeight,
  minWidth: MEETING_PANEL_SIZE_LIMITS.minWidth,
  minHeight: MEETING_PANEL_SIZE_LIMITS.minHeight,
  maxWidth: MEETING_PANEL_SIZE_LIMITS.maxWidth,
  maxHeight: MEETING_PANEL_SIZE_LIMITS.maxHeight,
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  skipTaskbar: true,
  resizable: true,
  // Unlike the other overlays this one takes clicks and typed questions, so it
  // must be able to hold focus.
  focusable: true,
  hasShadow: false,
  show: false,
  acceptsFirstMouse: true,
  fullScreenable: false,
  webPreferences: {
    preload: path.join(__dirname, "..", "..", "preload.js"),
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: RENDERER_SANDBOX,
    // The panel is hidden while the control panel has focus; without this its
    // timers would be throttled and the clock would stall behind the meeting.
    backgroundThrottling: false,
  },
  visibleOnAllWorkspaces: process.platform !== "win32",
  type: FLOATING_OVERLAY_TYPE,
};

class WindowPositionUtil {
  static getMainWindowPosition(display, customSize = null, position = "bottom-right") {
    const { width, height } = customSize || WINDOW_SIZES.BASE;
    const MARGIN = 4;
    const workArea = display.workArea || display.bounds;

    let x, y;
    if (position === "bottom-left") {
      x = workArea.x + MARGIN;
      y = workArea.y + workArea.height - height - MARGIN;
    } else if (position === "center") {
      x = Math.round(workArea.x + (workArea.width - width) / 2);
      y = workArea.y + workArea.height - height - MARGIN;
    } else {
      // bottom-right (default)
      x = workArea.x + workArea.width - width - MARGIN;
      y = workArea.y + workArea.height - height - MARGIN;
    }

    // Clamped to the display's own work area, never to zero: a monitor placed
    // above or left of the primary one has a negative origin, so flooring at zero
    // lands the window on a coordinate that display doesn't cover.
    return {
      ...WindowPositionUtil.clampToWorkArea({ x, y, width, height }, display),
      width,
      height,
    };
  }

  // Keeps a window's whole frame inside one display's work area. Displays of
  // different sizes leave dead space beside the smaller one, and a window parked
  // there is invisible even though the window server still reports it on screen.
  static clampToWorkArea(bounds, display) {
    const workArea = display.workArea || display.bounds;
    return {
      x: Math.max(workArea.x, Math.min(bounds.x, workArea.x + workArea.width - bounds.width)),
      y: Math.max(workArea.y, Math.min(bounds.y, workArea.y + workArea.height - bounds.height)),
    };
  }

  static getNotificationPosition(display) {
    const { width, height } = NOTIFICATION_WINDOW_CONFIG;
    const MARGIN = 16;
    const workArea = display.workArea || display.bounds;
    // Same negative-origin trap as getMainWindowPosition: clamp to the display,
    // not to zero, or a monitor above the primary one puts the prompt nowhere.
    const bounds = {
      x: workArea.x + workArea.width - width - MARGIN,
      y: workArea.y + MARGIN,
      width,
      height,
    };
    return { ...WindowPositionUtil.clampToWorkArea(bounds, display), width, height };
  }

  // Top-centre, clear of the meeting prompt's top-right slot: the two can be on
  // screen together, and a panel that covers the prompt hides the Join button.
  static getMeetingPanelPosition(display, size = {}) {
    const width = size.width || MEETING_PANEL_SIZE_LIMITS.defaultWidth;
    const height = size.height || MEETING_PANEL_SIZE_LIMITS.defaultHeight;
    const MARGIN = 12;
    const workArea = display.workArea || display.bounds;
    // Docked to the right edge rather than centred at the top. A tall panel
    // centred horizontally sits on top of whatever the meeting is showing;
    // against the edge it takes the strip of screen a video call uses least.
    const bounds = {
      x: workArea.x + workArea.width - width - MARGIN,
      y: Math.round(workArea.y + Math.max(MARGIN, (workArea.height - height) / 2)),
      width,
      height,
    };
    return { ...WindowPositionUtil.clampToWorkArea(bounds, display), width, height };
  }

  static getTranscriptionPreviewPosition(display, mainWindowBounds, size = {}) {
    const width =
      size.width ||
      TRANSCRIPTION_PREVIEW_CONFIG.width ||
      TRANSCRIPTION_PREVIEW_SIZE_LIMITS.defaultWidth;
    const height =
      size.height ||
      TRANSCRIPTION_PREVIEW_CONFIG.height ||
      TRANSCRIPTION_PREVIEW_SIZE_LIMITS.defaultHeight;
    const GAP = 8;
    const workArea = display.workArea || display.bounds;

    let x = Math.round(mainWindowBounds.x + (mainWindowBounds.width - width) / 2);
    let y = mainWindowBounds.y - height - GAP;

    x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - width));
    y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - height));

    return { x, y, width, height };
  }

  static setupAlwaysOnTop(window) {
    if (process.platform === "darwin") {
      // macOS: Use panel level for proper floating behavior
      // This ensures the window stays on top across spaces and fullscreen apps
      window.setAlwaysOnTop(true, "floating", 1);
      window.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true, // Keep Dock/Command-Tab behaviour
      });
      window.setFullScreenable(false);

      if (window.isVisible()) {
        window.setAlwaysOnTop(true, "floating", 1);
      }
    } else if (process.platform === "win32") {
      window.setAlwaysOnTop(true, "pop-up-menu");
    } else if (isGnomeWayland) {
      window.setAlwaysOnTop(true, "floating");
    } else {
      // KDE XWayland and other Linux — "screen-saver" is the strongest z-level
      window.setAlwaysOnTop(true, "screen-saver");
    }
  }
}

/**
 * The bar. Summoned collapsed — one row: a question box, a mic, and Listen —
 * and grown by the renderer (via resize-agent-window) into the chat column
 * once a conversation exists. `minHeight` is the collapsed bar, which is why
 * it sits at 104 rather than a chat-sized minimum: two rows — a full-height
 * ask field over a control strip — so the field reads at a glance instead of
 * fighting six buttons for one 56px line.
 */
const AGENT_OVERLAY_CONFIG = {
  width: 560,
  height: 104,
  minWidth: 360,
  minHeight: 104,
  maxWidth: 800,
  maxHeight: 10000,
  frame: false,
  alwaysOnTop: true,
  transparent: true,
  show: false,
  skipTaskbar: true,
  hasShadow: false,
  focusable: true,
  resizable: false,
  fullScreenable: false,
  acceptsFirstMouse: true,
  type: FLOATING_OVERLAY_TYPE,
  visibleOnAllWorkspaces: process.platform !== "win32",
  webPreferences: {
    preload: path.join(__dirname, "..", "..", "preload.js"),
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: false,
    webSecurity: false,
    spellcheck: false,
    backgroundThrottling: false,
  },
};

module.exports = {
  MAIN_WINDOW_CONFIG,
  CONTROL_PANEL_CONFIG,
  AGENT_OVERLAY_CONFIG,
  NOTIFICATION_WINDOW_CONFIG,
  MEETING_PANEL_CONFIG,
  MEETING_PANEL_SIZE_LIMITS,
  TRANSCRIPTION_PREVIEW_CONFIG,
  TRANSCRIPTION_PREVIEW_SIZE_LIMITS,
  WINDOW_SIZES,
  WindowPositionUtil,
};
