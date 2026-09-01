const { app, screen, BrowserWindow, shell, dialog } = require("electron");
const debugLogger = require("./debugLogger");
const HotkeyManager = require("./hotkeyManager");
const { isGlobeLikeHotkey } = HotkeyManager;
const DragManager = require("./dragManager");
const MenuManager = require("./menuManager");
const DevServerManager = require("./devServerManager");
const dockManager = require("./dockManager");
const { i18nMain } = require("./i18nMain");
const { DICTATION_ENABLED } = require("../config/features");
const { NotificationDismissTimer, resolvePromptTimeout } = require("./notificationTimer");
const { DEV_SERVER_PORT } = DevServerManager;
const {
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
} = require("./windowConfig");
const { resolvePanelBoundsFromAnchor } = require("./barPanelHandoff");

class WindowManager {
  constructor() {
    this.mainWindow = null;
    this.controlPanelWindow = null;
    this.agentWindow = null;
    this.notificationWindow = null;
    /** Set while the visible prompt times out into recording, not dismissal. */
    this._notificationAutoStart = null;
    this._notificationDismissTimer = new NotificationDismissTimer(() => {
      const autoStart = this._notificationAutoStart;
      this._notificationAutoStart = null;
      if (autoStart && this.meetingDetectionEngine) {
        // The prompt announced this countdown; going unanswered is the
        // consent path here, not the refusal. "start" — never "join": an
        // unattended timeout must not open a browser tab on its own. The
        // response handler dismisses the notification itself.
        void this.meetingDetectionEngine
          .handleNotificationResponse(autoStart.detectionId, "start")
          .catch(() => {});
        return;
      }
      if (this.meetingDetectionEngine) {
        this.meetingDetectionEngine.handleNotificationTimeout();
      }
      this.dismissMeetingNotification();
    });
    this.transcriptionPreviewWindow = null;
    this.meetingPanelWindow = null;
    this._meetingPanelState = null;
    this._meetingPanelTranscript = null;
    this._meetingPanelAssist = null;
    this._meetingPanelOpening = null;
    /** True only while a meeting is holding the control panel minimised. */
    this._minimizedForMeeting = false;
    /** True only while the bar→panel handoff is holding the bar hidden. */
    this._barHiddenForMeeting = false;
    this.updateNotificationWindow = null;
    this._updateNotificationDismissed = false;
    this.notificationPrefs = {
      notificationsEnabled: true,
      notifyMeetingDetection: true,
      notifyCalendarReminders: true,
      notifyUpdates: true,
      // An unanswered "meeting detected" prompt starts recording instead of
      // vanishing. The prompt shows the countdown and Dismiss stays one
      // click away; this is the opt-out.
      autoStartDetectedMeetings: true,
    };
    this.tray = null;
    this.hotkeyManager = new HotkeyManager();
    this.dragManager = new DragManager();
    this.isQuitting = false;
    this.loadErrorShown = false;
    this.macCompoundPushState = null;
    this.winPushState = null;
    this._cachedActivationMode = "tap";
    this._floatingIconAutoHide = false;
    this._agentAnimationState = null;
    this._panelStartPosition = "bottom-right";
    this._isDictatingToggle = false;
    this._pendingMeetingNoteNavigation = null;
    this._pendingNoteNavigation = null;

    app.on("before-quit", () => {
      this.isQuitting = true;
      this.hotkeyManager.unregisterAll();
    });
  }

  async createMainWindow() {
    const cursorPos = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursorPos);
    const position = WindowPositionUtil.getMainWindowPosition(
      display,
      null,
      this._panelStartPosition
    );

    this.mainWindow = new BrowserWindow({
      ...MAIN_WINDOW_CONFIG,
      ...position,
    });

    this.setMainWindowInteractivity(false);
    this.registerMainWindowEvents();

    // Register load event handlers BEFORE loading to catch all events
    this.mainWindow.webContents.on(
      "did-fail-load",
      async (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame) {
          return;
        }
        if (
          process.env.NODE_ENV === "development" &&
          validatedURL &&
          validatedURL.includes(`localhost:${DEV_SERVER_PORT}`)
        ) {
          setTimeout(async () => {
            const isReady = await DevServerManager.waitForDevServer();
            if (isReady) {
              this.mainWindow.reload();
            }
          }, 2000);
        } else {
          this.showLoadFailureDialog("Dictation panel", errorCode, errorDescription, validatedURL);
        }
      }
    );

    this.mainWindow.webContents.on("did-finish-load", () => {
      this.mainWindow.setTitle(i18nMain.t("window.voiceRecorderTitle"));
      this.enforceMainWindowOnTop();
    });

    await this.loadMainWindow();
    await this.initializeHotkey();
    this.dragManager.setTargetWindow(this.mainWindow);
    MenuManager.setupMainMenu(() => this.openSettings());
  }

  setMainWindowInteractivity(shouldCapture) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return;
    }

    if (process.platform === "win32") {
      // Windows click-through forwarding is unreliable for this floating panel.
      // Keep the panel interactive so the mic button and cancel button are always clickable.
      this.mainWindow.setIgnoreMouseEvents(false);
      return;
    }

    if (shouldCapture) {
      this.mainWindow.setIgnoreMouseEvents(false);
    } else {
      this.mainWindow.setIgnoreMouseEvents(true, { forward: true });
    }
  }

  // Only the meeting prompt owns this: another overlay reporting its own hover
  // must not pause a countdown it cannot resume — it may be destroyed before
  // its pointer ever leaves.
  setNotificationInteractivity(sender, interactive) {
    const win = this.notificationWindow;
    if (!win || win.isDestroyed() || sender !== win.webContents) {
      return;
    }
    // Linux ignores the `forward` option, so a card returned to click-through
    // there never sees another mouseenter and Start/Dismiss stay unreachable
    // for the rest of its life (#1456). It is only click-through on macOS to
    // begin with, so on Linux leave the hit-testing alone and move the
    // countdown alone.
    const togglesClickThrough = process.platform !== "linux";
    // Hovering means the user is reading or about to click — the auto-dismiss
    // countdown must not close the card under their pointer.
    if (interactive) {
      if (togglesClickThrough) win.setIgnoreMouseEvents(false);
      this._notificationDismissTimer.pause();
    } else {
      if (togglesClickThrough) win.setIgnoreMouseEvents(true, { forward: true });
      this._notificationDismissTimer.resume();
    }
  }

  resizeMainWindow(sizeKey) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return { success: false, message: "Window not available" };
    }

    const newSize = WINDOW_SIZES[sizeKey] || WINDOW_SIZES.BASE;
    const currentBounds = this.mainWindow.getBounds();
    const position = this._panelStartPosition;

    const display = screen.getDisplayNearestPoint({
      x: currentBounds.x + currentBounds.width / 2,
      y: currentBounds.y + currentBounds.height,
    });

    let newX, newY;

    if (position === "bottom-left") {
      // Anchor bottom-left corner: keep x, expand rightward and upward
      newX = currentBounds.x;
      newY = currentBounds.y + currentBounds.height - newSize.height;
    } else if (position === "center") {
      // Anchor bottom-center: expand symmetrically and upward
      const centerX = currentBounds.x + currentBounds.width / 2;
      newX = centerX - newSize.width / 2;
      newY = currentBounds.y + currentBounds.height - newSize.height;
    } else {
      // bottom-right (default): anchor bottom-right corner, expand leftward and upward
      const bottomRightX = currentBounds.x + currentBounds.width;
      newX = bottomRightX - newSize.width;
      newY = currentBounds.y + currentBounds.height - newSize.height;
    }

    const clamped = WindowPositionUtil.clampToWorkArea({ x: newX, y: newY, ...newSize }, display);

    this.mainWindow.setBounds({ ...clamped, ...newSize });

    return { success: true, bounds: { ...clamped, ...newSize } };
  }

  async loadWindowContent(window, isControlPanel = false, isAgent = false) {
    if (process.env.NODE_ENV === "development") {
      let appUrl = DevServerManager.getAppUrl(isControlPanel);
      if (isAgent) {
        appUrl = `${DevServerManager.getAppUrl(false)}?agent=true`;
      }
      await DevServerManager.waitForDevServer();
      await window.loadURL(appUrl);
    } else {
      const fileInfo = DevServerManager.getAppFilePath(isControlPanel);
      if (!fileInfo) {
        throw new Error("Failed to get app file path");
      }

      if (isAgent) {
        fileInfo.query = { agent: "true" };
      }

      const fs = require("fs");
      if (!fs.existsSync(fileInfo.path)) {
        throw new Error(`HTML file not found: ${fileInfo.path}`);
      }

      await window.loadFile(fileInfo.path, { query: fileInfo.query });
    }
  }

  async loadMainWindow() {
    await this.loadWindowContent(this.mainWindow, false);
  }

  createHotkeyCallback() {
    let lastToggleTime = 0;
    const DEBOUNCE_MS = 150;

    // globalShortcut registrations pass the hotkey that fired; native-shortcut
    // backends invoke the callback bare (their slot holds only the primary).
    return async (triggeredHotkey) => {
      if (this.hotkeyManager.isInListeningMode()) {
        return;
      }

      const activationMode = this.getActivationMode();
      const currentHotkey = triggeredHotkey || this.hotkeyManager.getCurrentHotkey?.();

      if (
        process.platform === "darwin" &&
        activationMode === "push" &&
        currentHotkey &&
        !isGlobeLikeHotkey(currentHotkey) &&
        currentHotkey.includes("+")
      ) {
        this.startMacCompoundPushToTalk(currentHotkey);
        return;
      }

      // Push mode: defer to native listener (globalShortcut can't detect key-up)
      if (
        (process.platform === "win32" || process.platform === "linux") &&
        activationMode === "push"
      ) {
        return;
      }

      const now = Date.now();
      if (now - lastToggleTime < DEBOUNCE_MS) {
        return;
      }
      lastToggleTime = now;

      // Capture target app PID before the window might steal focus
      if (this.textEditMonitor) this.textEditMonitor.captureTargetPid();

      this.sendToggleDictation();
    };
  }

  startMacCompoundPushToTalk(hotkey) {
    if (this.macCompoundPushState?.active) {
      return;
    }

    const requiredModifiers = this.getMacRequiredModifiers(hotkey);
    if (requiredModifiers.size === 0) {
      return;
    }

    const MIN_HOLD_DURATION_MS = 150;
    const MAX_PUSH_DURATION_MS = 300000; // 5 minutes max recording
    const downTime = Date.now();

    if (this.textEditMonitor) this.textEditMonitor.captureTargetPid();
    this.showDictationPanel();
    this.sendPrepareDictation();

    const safetyTimeoutId = setTimeout(() => {
      if (this.macCompoundPushState?.active) {
        debugLogger.warn("Compound PTT safety timeout", undefined, "ptt");
        this.forceStopMacCompoundPush("timeout");
      }
    }, MAX_PUSH_DURATION_MS);

    this.macCompoundPushState = {
      active: true,
      downTime,
      isRecording: false,
      requiredModifiers,
      safetyTimeoutId,
    };

    setTimeout(() => {
      if (!this.macCompoundPushState || this.macCompoundPushState.downTime !== downTime) {
        return;
      }

      if (!this.macCompoundPushState.isRecording) {
        this.macCompoundPushState.isRecording = true;
        this.sendStartDictation();
      }
    }, MIN_HOLD_DURATION_MS);
  }

  handleMacPushModifierUp(modifier) {
    if (!this.macCompoundPushState?.active) {
      return;
    }

    if (!this.macCompoundPushState.requiredModifiers.has(modifier)) {
      return;
    }

    if (this.macCompoundPushState.safetyTimeoutId) {
      clearTimeout(this.macCompoundPushState.safetyTimeoutId);
    }

    const wasRecording = this.macCompoundPushState.isRecording;
    this.macCompoundPushState = null;

    if (wasRecording) {
      this.sendStopDictation();
    } else {
      this.sendCancelDictationPreparation();
      this.hideDictationPanel();
    }
  }

  forceStopMacCompoundPush(reason = "manual") {
    if (!this.macCompoundPushState) {
      return;
    }

    if (this.macCompoundPushState.safetyTimeoutId) {
      clearTimeout(this.macCompoundPushState.safetyTimeoutId);
    }

    const wasRecording = this.macCompoundPushState.isRecording;
    this.macCompoundPushState = null;

    if (wasRecording) {
      this.sendStopDictation();
    } else {
      this.sendCancelDictationPreparation();
    }
    this.hideDictationPanel();

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("compound-ptt-force-stopped", { reason });
    }
  }

  getMacRequiredModifiers(hotkey) {
    const required = new Set();
    const parts = hotkey.split("+").map((part) => part.trim());

    for (const part of parts) {
      switch (part) {
        case "Command":
        case "Cmd":
        case "RightCommand":
        case "RightCmd":
        case "CommandOrControl":
        case "Super":
        case "Meta":
          required.add("command");
          break;
        case "Control":
        case "Ctrl":
        case "RightControl":
        case "RightCtrl":
          required.add("control");
          break;
        case "Alt":
        case "Option":
        case "RightAlt":
        case "RightOption":
          required.add("option");
          break;
        case "Shift":
        case "RightShift":
          required.add("shift");
          break;
        case "Fn":
          required.add("fn");
          break;
        default:
          break;
      }
    }

    return required;
  }

  startWindowsPushToTalk(key) {
    if (this.winPushState?.active) {
      return;
    }

    const MIN_HOLD_DURATION_MS = 150;
    const downTime = Date.now();

    this.showDictationPanel();
    this.sendPrepareDictation();

    this.winPushState = {
      active: true,
      key,
      downTime,
      isRecording: false,
    };

    setTimeout(() => {
      if (!this.winPushState || this.winPushState.downTime !== downTime) {
        return;
      }

      if (!this.winPushState.isRecording) {
        this.winPushState.isRecording = true;
        this.sendStartDictation();
      }
    }, MIN_HOLD_DURATION_MS);
  }

  // With several dictation hotkeys bound, only the key that started the push
  // may stop it; called without a key to force-stop (resetWindowsPushState).
  handleWindowsPushKeyUp(key) {
    if (!this.winPushState?.active) {
      return;
    }
    if (key && this.winPushState.key && key !== this.winPushState.key) {
      return;
    }

    const wasRecording = this.winPushState.isRecording;
    this.winPushState = null;

    if (wasRecording) {
      this.sendStopDictation();
    } else {
      this.sendCancelDictationPreparation();
      this.hideDictationPanel();
    }
  }

  resetWindowsPushState() {
    if (!this.winPushState?.active) {
      return;
    }

    this.handleWindowsPushKeyUp();
  }

  _sendDictationToggle(channel) {
    if (this.hotkeyManager.isInListeningMode()) {
      return;
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      // Capture the paste target and any selection on every toggle press,
      // before the overlay steals focus — the paste can't refocus the target
      // otherwise (#668). The renderer owns the real recording state and may
      // decline a toggle (mic error, silence gate, Esc cancel), so gating this
      // on _isDictatingToggle desyncs and leaves a stale target from a
      // previous app. Press-time capture matches the dictation hotkey call
      // sites in main.js; a stop-press capture resolves the same frontmost
      // app, since NSWorkspace ignores the overlay panel.
      if (this.textEditMonitor) this.textEditMonitor.captureTargetPid();
      void this.selectionManager?.captureTarget?.();
      this.showDictationPanel();
      // About-to-start guess: open the mic one IPC message ahead of the toggle.
      // A wrong guess (renderer declines) is bounded by the prepared capture's
      // max-age expiry, and the renderer dedups its own prepare call.
      if (!this._isDictatingToggle) this.sendPrepareDictation();
      this.mainWindow.webContents.send(channel);
      this._isDictatingToggle = !this._isDictatingToggle;
      this.meetingDetectionEngine?.setUserRecording(this._isDictatingToggle);
    }
  }

  sendToggleDictation() {
    this._sendDictationToggle("toggle-dictation");
  }

  sendToggleVoiceAgent() {
    this._sendDictationToggle("toggle-voice-agent");
  }

  sendToggleTranslation() {
    // Same PID-capture need as the voice agent: translation hotkeys don't
    // capture the target at their call sites.
    if (this.textEditMonitor) this.textEditMonitor.captureTargetPid();
    this._sendDictationToggle("toggle-translation");
  }

  sendStartDictation() {
    if (this.hotkeyManager.isInListeningMode()) {
      return;
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (this.textEditMonitor) this.textEditMonitor.captureTargetPid();
      void this.selectionManager?.captureTarget?.();
      this.showDictationPanel();
      this.mainWindow.webContents.send("start-dictation");
      this.meetingDetectionEngine?.setUserRecording(true);
    }
  }

  sendStopDictation() {
    if (this.hotkeyManager.isInListeningMode()) {
      return;
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("stop-dictation");
      this._isDictatingToggle = false;
      this.meetingDetectionEngine?.setUserRecording(false);
    }
  }

  sendPrepareDictation() {
    if (this.hotkeyManager.isInListeningMode()) {
      return;
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("prepare-dictation");
    }
  }

  sendCancelDictationPreparation() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("cancel-dictation-preparation");
    }
  }

  sendCancelDictation() {
    if (this.hotkeyManager.isInListeningMode()) {
      return;
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("cancel-dictation-preparation");
      this.mainWindow.webContents.send("cancel-hotkey-pressed");
      this._isDictatingToggle = false;
      this.meetingDetectionEngine?.setUserRecording(false);
    }
  }

  getActivationMode() {
    return this._cachedActivationMode;
  }

  setActivationModeCache(mode) {
    this._cachedActivationMode = mode === "push" ? "push" : "tap";
  }

  /**
   * Sync the native low-level key listeners (Windows/Linux) so every hotkey slot
   * that needs one is watched. Call after any change to a slot hotkey or the
   * activation mode. No-op during hotkey capture (listeners are stopped then).
   */
  reconcileNativeKeyListeners() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    if (this.hotkeyManager.isInListeningMode()) return;
    // GNOME/KDE/Hyprland deliver hotkeys via D-Bus native shortcuts; the low-level
    // listener would be redundant there and could double-fire, so watch nothing.
    const keys = this.hotkeyManager.isUsingNativeShortcut()
      ? []
      : this.hotkeyManager.getNativeListenerKeys(this.getActivationMode());
    if (process.platform === "win32" && this.windowsKeyManager) {
      this.windowsKeyManager.setKeys(keys);
    } else if (process.platform === "linux" && this.linuxKeyManager) {
      this.linuxKeyManager.setKeys(keys);
    }
  }

  setFloatingIconAutoHide(enabled) {
    this._floatingIconAutoHide = Boolean(enabled);
  }

  setPanelStartPosition(position) {
    this._panelStartPosition = position || "bottom-right";
    // Reposition the window immediately
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const currentBounds = this.mainWindow.getBounds();
      const display = screen.getDisplayNearestPoint({
        x: currentBounds.x + currentBounds.width / 2,
        y: currentBounds.y + currentBounds.height / 2,
      });
      const newPos = WindowPositionUtil.getMainWindowPosition(
        display,
        { width: currentBounds.width, height: currentBounds.height },
        this._panelStartPosition
      );
      this.mainWindow.setBounds(newPos);
    }
  }

  setHotkeyListeningMode(enabled) {
    this.hotkeyManager.setListeningMode(enabled);
  }

  async initializeHotkey() {
    await this.hotkeyManager.initializeHotkey(this.mainWindow, this.createHotkeyCallback());
  }

  async updateHotkey(hotkey) {
    return await this.hotkeyManager.updateHotkey(hotkey, this.createHotkeyCallback());
  }

  isUsingGnomeHotkeys() {
    return this.hotkeyManager.isUsingGnome();
  }

  isUsingHyprlandHotkeys() {
    return this.hotkeyManager.isUsingHyprland();
  }

  getHyprlandConfigStatus() {
    return this.hotkeyManager.getHyprlandConfigStatus();
  }

  isUsingKDEHotkeys() {
    return this.hotkeyManager.isUsingKDE();
  }

  isUsingNativeShortcutHotkeys() {
    return this.hotkeyManager.isUsingNativeShortcut();
  }

  async startWindowDrag() {
    return await this.dragManager.startWindowDrag();
  }

  async stopWindowDrag() {
    return await this.dragManager.stopWindowDrag();
  }

  openExternalUrl(url, showError = true) {
    shell.openExternal(url).catch((error) => {
      if (showError) {
        dialog.showErrorBox(
          i18nMain.t("dialog.openLink.title"),
          i18nMain.t("dialog.openLink.message", { url, error: error.message })
        );
      }
    });
  }

  async createControlPanelWindow() {
    if (this.controlPanelWindow && !this.controlPanelWindow.isDestroyed()) {
      if (this.controlPanelWindow.isMinimized()) {
        this.controlPanelWindow.restore();
      }
      if (!this.controlPanelWindow.isVisible()) {
        this.controlPanelWindow.show();
      }
      this.controlPanelWindow.focus();
      dockManager.setControlPanelVisible(true);
      return;
    }

    this.controlPanelWindow = new BrowserWindow(CONTROL_PANEL_CONFIG);

    this.controlPanelWindow.webContents.on("will-navigate", (event, url) => {
      const appUrl = DevServerManager.getAppUrl(true);
      const controlPanelUrl = appUrl.startsWith("http") ? appUrl : `file://${appUrl}`;

      if (
        url.startsWith(controlPanelUrl) ||
        url.startsWith("file://") ||
        url.startsWith("devtools://")
      ) {
        return;
      }

      event.preventDefault();
      this.openExternalUrl(url);
    });

    this.controlPanelWindow.webContents.setWindowOpenHandler(({ url }) => {
      this.openExternalUrl(url);
      return { action: "deny" };
    });

    this.controlPanelWindow.webContents.on("did-create-window", (childWindow, details) => {
      childWindow.close();
      if (details.url && !details.url.startsWith("devtools://")) {
        this.openExternalUrl(details.url, false);
      }
    });

    const visibilityTimer = setTimeout(() => {
      if (!this.controlPanelWindow || this.controlPanelWindow.isDestroyed()) {
        return;
      }
      if (!this.controlPanelWindow.isVisible()) {
        this.controlPanelWindow.show();
        this.controlPanelWindow.focus();
        dockManager.setControlPanelVisible(true);
      }
    }, 10000);

    const clearVisibilityTimer = () => {
      clearTimeout(visibilityTimer);
    };

    this.controlPanelWindow.once("ready-to-show", () => {
      clearVisibilityTimer();
      this.controlPanelWindow.show();
      this.controlPanelWindow.focus();
      dockManager.setControlPanelVisible(true);
    });

    this.controlPanelWindow.on("close", (event) => {
      if (!this.isQuitting) {
        event.preventDefault();
        this.hideControlPanelToTray();
      }
    });

    this.controlPanelWindow.on("closed", () => {
      clearVisibilityTimer();
      this.controlPanelWindow = null;
      dockManager.setControlPanelVisible(false);
      // The renderer that owned the capture graph is gone, so the meeting is
      // over whether or not a final snapshot made it out. Leaving the panel up
      // would show a recording that no longer exists.
      this.closeMeetingPanel();
    });

    // No panel visibility listeners here on purpose — see
    // _syncMeetingPanelVisibility for why the panel no longer tracks focus.

    MenuManager.setupControlPanelMenu(this.controlPanelWindow, () => this.openSettings());

    this.controlPanelWindow.webContents.on("did-finish-load", () => {
      clearVisibilityTimer();
      this.controlPanelWindow.setTitle(i18nMain.t("window.controlPanelTitle"));
    });

    this.controlPanelWindow.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame) {
          return;
        }
        clearVisibilityTimer();
        if (process.env.NODE_ENV !== "development") {
          this.showLoadFailureDialog("Control panel", errorCode, errorDescription, validatedURL);
        }
        if (!this.controlPanelWindow.isVisible()) {
          this.controlPanelWindow.show();
          this.controlPanelWindow.focus();
          dockManager.setControlPanelVisible(true);
        }
      }
    );

    this.controlPanelWindow.webContents.on("render-process-gone", (_event, details) => {
      if (details.reason === "crashed" || details.reason === "killed" || details.reason === "oom") {
        debugLogger.error(
          "Control panel renderer process gone",
          { reason: details.reason, exitCode: details.exitCode },
          "window"
        );
        // Same reasoning as "closed": the capture graph died with the renderer.
        this.closeMeetingPanel();
        setTimeout(() => this.loadControlPanel(), 1000);
      }
    });

    this.controlPanelWindow.on("show", () => {
      if (this.controlPanelWindow.webContents.isCrashed()) {
        debugLogger.error("Control panel crashed, reloading on show", undefined, "window");
        this.loadControlPanel();
      }
    });

    await this.loadControlPanel();
  }

  async loadControlPanel() {
    await this.loadWindowContent(this.controlPanelWindow, true);
  }

  async createAgentWindow() {
    if (this.agentWindow && !this.agentWindow.isDestroyed()) {
      return;
    }

    this.agentWindow = new BrowserWindow(AGENT_OVERLAY_CONFIG);

    // The bar sits on screen during meetings the user is sharing, and can hold
    // a conversation about that meeting — same rule as the meeting panel: on
    // the user's screen, absent from the share.
    this.agentWindow.setContentProtection(true);

    this.agentWindow.once("ready-to-show", () => {
      WindowPositionUtil.setupAlwaysOnTop(this.agentWindow);
    });

    this.agentWindow.webContents.on("did-finish-load", () => {
      this.agentWindow.setTitle(i18nMain.t("window.agentChatTitle"));
    });

    this.agentWindow.on("closed", () => {
      this.agentWindow = null;
    });

    await this.loadWindowContent(this.agentWindow, false, true);
  }

  toggleAgentOverlay() {
    if (!this.agentWindow || this.agentWindow.isDestroyed()) return;

    if (this.agentWindow.isVisible()) {
      this.agentWindow.webContents.send("agent-toggle-recording");
    } else {
      this.showAgentOverlay();
    }
  }

  /**
   * `focus: false` is the at-startup and after-meeting variant: the bar
   * appears without taking the keyboard from whatever the user is doing.
   * A summon by hotkey keeps the default — the bar exists to be typed into.
   */
  showAgentOverlay({ focus = true } = {}) {
    if (!this.agentWindow || this.agentWindow.isDestroyed()) return;

    this._clearAgentAnimation();

    if (!this._agentShownOnce) {
      // First summon: a bar, centred on the display the cursor is on, in the
      // upper part of the screen where a command bar is expected. After that
      // the window keeps whatever place and size the user gave it — a
      // re-summoned bar that jumps home reads as broken, not tidy.
      this._agentShownOnce = true;
      const cursorPos = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(cursorPos);
      const workArea = display.workArea || display.bounds;

      const width = AGENT_OVERLAY_CONFIG.width;
      const height = AGENT_OVERLAY_CONFIG.height;
      const x = Math.round(workArea.x + (workArea.width - width) / 2);
      const y = Math.round(workArea.y + workArea.height * 0.2);

      this.agentWindow.setBounds({
        ...WindowPositionUtil.clampToWorkArea({ x, y, width, height }, display),
        width,
        height,
      });
    } else {
      // Keep the remembered spot, but never let a monitor change strand the
      // bar off-screen.
      const bounds = this.agentWindow.getBounds();
      const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
      const clamped = WindowPositionUtil.clampToWorkArea(bounds, display);
      if (clamped.x !== bounds.x || clamped.y !== bounds.y) {
        this.agentWindow.setBounds({ ...bounds, ...clamped });
      }
    }

    WindowPositionUtil.setupAlwaysOnTop(this.agentWindow);

    if (typeof this.agentWindow.showInactive === "function") {
      this.agentWindow.showInactive();
    } else {
      this.agentWindow.show();
    }
    // showInactive keeps the window server happy on macOS, then focus moves
    // deliberately — and only when the user summoned the bar to use it.
    if (focus) this.agentWindow.focus();
  }

  hideAgentOverlay() {
    if (!this.agentWindow || this.agentWindow.isDestroyed()) return;

    this._clearAgentAnimation();
    this.agentWindow.webContents.send("agent-stop-recording");
    this.agentWindow.hide();
  }

  async ensureTranscriptionPreviewWindow() {
    if (this.transcriptionPreviewWindow && !this.transcriptionPreviewWindow.isDestroyed()) {
      return;
    }

    this.transcriptionPreviewWindow = new BrowserWindow(TRANSCRIPTION_PREVIEW_CONFIG);

    this.transcriptionPreviewWindow.on("closed", () => {
      this.transcriptionPreviewWindow = null;
    });

    if (process.env.NODE_ENV === "development") {
      await DevServerManager.waitForDevServer();
      await this.transcriptionPreviewWindow.loadURL(
        `${DevServerManager.DEV_SERVER_URL}?transcription-preview=true`
      );
    } else {
      const fileInfo = DevServerManager.getAppFilePath(false);
      await this.transcriptionPreviewWindow.loadFile(fileInfo.path, {
        query: { ...fileInfo.query, "transcription-preview": "true" },
      });
    }
  }

  async showTranscriptionPreview(text) {
    await this.ensureTranscriptionPreviewWindow();

    if (!this.transcriptionPreviewWindow || this.transcriptionPreviewWindow.isDestroyed()) return;

    const mainBounds =
      this.mainWindow && !this.mainWindow.isDestroyed() ? this.mainWindow.getBounds() : null;

    if (mainBounds) {
      const display = screen.getDisplayNearestPoint({ x: mainBounds.x, y: mainBounds.y });
      const position = WindowPositionUtil.getTranscriptionPreviewPosition(display, mainBounds, {
        width: TRANSCRIPTION_PREVIEW_CONFIG.width,
        height: TRANSCRIPTION_PREVIEW_CONFIG.height,
      });
      this.transcriptionPreviewWindow.setBounds(position);
    }

    this.transcriptionPreviewWindow.webContents.send("preview-text", text);
    this.transcriptionPreviewWindow.showInactive();
    WindowPositionUtil.setupAlwaysOnTop(this.transcriptionPreviewWindow);
  }

  appendTranscriptionPreview(text) {
    if (!this.transcriptionPreviewWindow || this.transcriptionPreviewWindow.isDestroyed()) return;
    this.transcriptionPreviewWindow.webContents.send("preview-append", text);
  }

  holdTranscriptionPreview(options = {}) {
    if (!this.transcriptionPreviewWindow || this.transcriptionPreviewWindow.isDestroyed()) return;
    this.transcriptionPreviewWindow.webContents.send("preview-hold", {
      showCleanup: !!options.showCleanup,
    });
  }

  completeTranscriptionPreview(text) {
    if (!this.transcriptionPreviewWindow || this.transcriptionPreviewWindow.isDestroyed()) return;
    this.transcriptionPreviewWindow.webContents.send("preview-result", { text });
    this.transcriptionPreviewWindow.showInactive();
    WindowPositionUtil.setupAlwaysOnTop(this.transcriptionPreviewWindow);
  }

  hideTranscriptionPreview() {
    if (!this.transcriptionPreviewWindow || this.transcriptionPreviewWindow.isDestroyed()) return;

    this.transcriptionPreviewWindow.webContents.send("preview-hide");
    setTimeout(() => {
      if (this.transcriptionPreviewWindow && !this.transcriptionPreviewWindow.isDestroyed()) {
        this.transcriptionPreviewWindow.hide();
      }
    }, 200);
  }

  resizeTranscriptionPreview(width, height) {
    if (!this.transcriptionPreviewWindow || this.transcriptionPreviewWindow.isDestroyed()) {
      return { success: false, error: "Preview window not available" };
    }

    const targetWidth = Math.max(
      TRANSCRIPTION_PREVIEW_SIZE_LIMITS.minWidth,
      Math.min(Math.round(width), TRANSCRIPTION_PREVIEW_SIZE_LIMITS.maxWidth)
    );
    const targetHeight = Math.max(
      TRANSCRIPTION_PREVIEW_SIZE_LIMITS.minHeight,
      Math.min(Math.round(height), TRANSCRIPTION_PREVIEW_SIZE_LIMITS.maxHeight)
    );

    const anchorBounds =
      this.mainWindow && !this.mainWindow.isDestroyed()
        ? this.mainWindow.getBounds()
        : this.transcriptionPreviewWindow.getBounds();
    const display = screen.getDisplayNearestPoint({ x: anchorBounds.x, y: anchorBounds.y });
    const bounds = WindowPositionUtil.getTranscriptionPreviewPosition(display, anchorBounds, {
      width: targetWidth,
      height: targetHeight,
    });

    const currentBounds = this.transcriptionPreviewWindow.getBounds();
    if (
      currentBounds.x === bounds.x &&
      currentBounds.y === bounds.y &&
      currentBounds.width === bounds.width &&
      currentBounds.height === bounds.height
    ) {
      return { success: true, bounds };
    }

    this.transcriptionPreviewWindow.setBounds(bounds);
    return { success: true, bounds };
  }

  resizeAgentWindow(width, height) {
    if (!this.agentWindow || this.agentWindow.isDestroyed()) return;

    const ANIMATION_DURATION_MS = 250;
    const TICK_MS = 16;

    const targetWidth = Math.max(
      AGENT_OVERLAY_CONFIG.minWidth,
      Math.min(width, AGENT_OVERLAY_CONFIG.maxWidth)
    );
    const targetHeight = Math.max(
      AGENT_OVERLAY_CONFIG.minHeight,
      Math.min(height, AGENT_OVERLAY_CONFIG.maxHeight)
    );

    const currentBounds = this.agentWindow.getBounds();

    if (currentBounds.height === targetHeight && currentBounds.width === targetWidth) {
      this._clearAgentAnimation();
      return;
    }

    // If animation already running, retarget from current position
    if (this._agentAnimationState) {
      this._agentAnimationState.targetHeight = targetHeight;
      this._agentAnimationState.targetWidth = targetWidth;
      this._agentAnimationState.startHeight = currentBounds.height;
      this._agentAnimationState.startWidth = currentBounds.width;
      this._agentAnimationState.startTime = Date.now();
      return;
    }

    this._agentAnimationState = {
      startHeight: currentBounds.height,
      startWidth: currentBounds.width,
      targetHeight,
      targetWidth,
      startTime: Date.now(),
      intervalId: null,
    };

    this._agentAnimationState.intervalId = setInterval(() => {
      if (!this.agentWindow || this.agentWindow.isDestroyed()) {
        this._clearAgentAnimation();
        return;
      }

      const state = this._agentAnimationState;
      if (!state) return;

      const elapsed = Date.now() - state.startTime;
      const rawT = Math.min(elapsed / ANIMATION_DURATION_MS, 1);
      // Ease-out quadratic
      const t = 1 - (1 - rawT) * (1 - rawT);

      const newHeight = Math.round(
        state.startHeight + (state.targetHeight - state.startHeight) * t
      );
      const newWidth = Math.round(state.startWidth + (state.targetWidth - state.startWidth) * t);

      const bounds = this.agentWindow.getBounds();

      // Clamp to screen work area
      const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
      const workArea = display.workArea || display.bounds;
      const clampedHeight = Math.min(newHeight, workArea.y + workArea.height - bounds.y);

      this.agentWindow.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: newWidth,
        height: Math.max(AGENT_OVERLAY_CONFIG.minHeight, clampedHeight),
      });

      if (rawT >= 1) {
        this._clearAgentAnimation();
      }
    }, TICK_MS);
  }

  _clearAgentAnimation() {
    if (this._agentAnimationState?.intervalId) {
      clearInterval(this._agentAnimationState.intervalId);
    }
    this._agentAnimationState = null;
  }

  getAgentWindowBounds() {
    if (!this.agentWindow || this.agentWindow.isDestroyed()) return null;
    return this.agentWindow.getBounds();
  }

  setAgentWindowBounds(x, y, width, height) {
    if (!this.agentWindow || this.agentWindow.isDestroyed()) return;

    const bounds = {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    };

    // Enforce minimums
    bounds.width = Math.max(AGENT_OVERLAY_CONFIG.minWidth, bounds.width);
    bounds.height = Math.max(AGENT_OVERLAY_CONFIG.minHeight, bounds.height);

    // Clamp to screen work area
    const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
    const workArea = display.workArea || display.bounds;
    bounds.width = Math.min(bounds.width, workArea.width);
    bounds.height = Math.min(bounds.height, workArea.y + workArea.height - bounds.y);

    this.agentWindow.setBounds(bounds);
  }

  // The display the user is working on is the one showing the app being dictated
  // into, which on a multi-monitor desk is often not the one the mouse rests on.
  // Falls back to the cursor when the target has no readable window (non-macOS,
  // no target captured yet, or an app with no ordinary window).
  async _resolveActiveDisplay() {
    const pid = this.textEditMonitor?.lastTargetPid;
    const bounds = pid ? await this.textEditMonitor.getTargetWindowBounds(pid) : null;
    return bounds
      ? screen.getDisplayMatching(bounds)
      : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  }

  async _repositionToActiveDisplay() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    const activeDisplay = await this._resolveActiveDisplay();
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    const currentBounds = this.mainWindow.getBounds();
    const currentDisplay = screen.getDisplayNearestPoint({
      x: currentBounds.x + currentBounds.width / 2,
      y: currentBounds.y + currentBounds.height / 2,
    });

    if (currentDisplay.id === activeDisplay.id) {
      // Nearest-display math can't tell "on this display" from "just past its
      // edge", so a rearranged monitor or a drag that ended over another
      // display can leave the panel stranded in dead space, looking like the
      // overlay vanished. Pull it back before showing it.
      const clamped = WindowPositionUtil.clampToWorkArea(currentBounds, currentDisplay);
      if (clamped.x !== currentBounds.x || clamped.y !== currentBounds.y) {
        this.mainWindow.setBounds({ ...currentBounds, ...clamped });
      }
      return;
    }

    const newPos = WindowPositionUtil.getMainWindowPosition(
      activeDisplay,
      { width: currentBounds.width, height: currentBounds.height },
      this._panelStartPosition
    );
    debugLogger.debug(
      "[WindowManager] Moving dictation panel to the active display",
      { from: currentBounds, to: newPos, displayId: activeDisplay.id },
      "window"
    );
    this.mainWindow.setBounds(newPos);
  }

  /**
   * Surfaces the dictation HUD. A no-op while dictation is hidden: this is the
   * single choke point every caller goes through (tray, hotkey, deep links,
   * the capture bridge), so the panel cannot appear from any of them.
   */
  showDictationPanel(options = {}) {
    if (!DICTATION_ENABLED) return;
    const { focus = false } = options;
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      // Reading the target's window costs a helper spawn, so show now and move
      // when the answer lands: a visible hop only happens when the panel was on
      // the wrong display, which is the case being corrected.
      void this._repositionToActiveDisplay();

      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      if (!this.mainWindow.isVisible()) {
        if (typeof this.mainWindow.showInactive === "function") {
          this.mainWindow.showInactive();
        } else {
          this.mainWindow.show();
        }
      }
      if (focus) {
        this.mainWindow.focus();
      }
    }
  }

  hideControlPanelToTray() {
    if (!this.controlPanelWindow || this.controlPanelWindow.isDestroyed()) {
      return;
    }

    this.controlPanelWindow.hide();
    dockManager.setControlPanelVisible(false);
  }

  hideDictationPanel() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.hide();
    }
  }

  isDictationPanelVisible() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return false;
    }

    if (this.mainWindow.isMinimized && this.mainWindow.isMinimized()) {
      return false;
    }

    return this.mainWindow.isVisible();
  }

  registerMainWindowEvents() {
    if (!this.mainWindow) {
      return;
    }

    // Safety timeout: force show the window if ready-to-show doesn't fire within 10 seconds
    const showTimeout = setTimeout(() => {
      if (
        this.mainWindow &&
        !this.mainWindow.isDestroyed() &&
        !this.mainWindow.isVisible() &&
        !this._floatingIconAutoHide
      ) {
        this.showDictationPanel();
      }
    }, 10000);

    this.mainWindow.once("ready-to-show", () => {
      clearTimeout(showTimeout);
      this.enforceMainWindowOnTop();
      // This is the one path that reaches the panel without a user asking for
      // it, so it needs the flag as much as the callers do — without it the HUD
      // surfaces on every launch no matter what the rest of the app hides.
      if (!DICTATION_ENABLED) return;
      if (!this.mainWindow.isVisible() && !this._floatingIconAutoHide) {
        if (typeof this.mainWindow.showInactive === "function") {
          this.mainWindow.showInactive();
        } else {
          this.mainWindow.show();
        }
      }
    });

    this.mainWindow.on("show", () => {
      this.enforceMainWindowOnTop();
    });

    this.mainWindow.on("focus", () => {
      this.enforceMainWindowOnTop();
    });

    this.mainWindow.on("closed", () => {
      this.dragManager.cleanup();
      this.mainWindow = null;
    });
  }

  enforceMainWindowOnTop() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      WindowPositionUtil.setupAlwaysOnTop(this.mainWindow);
    }
  }

  async showMeetingNotification(promptData) {
    if (this.notificationWindow && !this.notificationWindow.isDestroyed()) {
      this.notificationWindow.close();
      this.notificationWindow = null;
    }
    this._notificationDismissTimer.cancel();

    const display = screen.getPrimaryDisplay();
    const position = WindowPositionUtil.getNotificationPosition(display);

    const win = new BrowserWindow({
      ...NOTIFICATION_WINDOW_CONFIG,
      ...position,
    });
    this.notificationWindow = win;

    // Keep the prompt visible to the user but out of screen shares and recordings.
    win.setContentProtection(true);

    // A meeting detected for you has already started. Buffer from the moment
    // the prompt goes up so accepting it does not begin mid-sentence.
    this.setMeetingPreRoll("start");

    if (process.platform === "darwin") {
      win.setIgnoreMouseEvents(true, { forward: true });
    }

    WindowPositionUtil.setupAlwaysOnTop(win);

    // How this prompt ends if nobody answers it: auto-start for a meeting
    // that is happening now (when enabled), plain dismissal otherwise. The
    // renderer gets the countdown so the card can say what is about to
    // happen — an unannounced auto-start would be indistinguishable from a
    // bug.
    const timeout = resolvePromptTimeout({
      source: promptData.source,
      variant: promptData.variant,
      autoStartEnabled: this.notificationPrefs.autoStartDetectedMeetings,
    });
    promptData = { ...promptData, autoStartMs: timeout.autoStart ? timeout.ms : null };
    this._notificationAutoStart = timeout.autoStart
      ? { detectionId: promptData.detectionId }
      : null;

    this._pendingNotificationData = promptData;

    // Everything past the load addresses `win` directly: a replacement taking
    // over mid-load must not have this prompt's data, countdown or force-show
    // applied to its window.
    if (process.env.NODE_ENV === "development") {
      await DevServerManager.waitForDevServer();
      await win.loadURL(`${DevServerManager.DEV_SERVER_URL}?meeting-notification=true`);
    } else {
      const fileInfo = DevServerManager.getAppFilePath(false);
      await win.loadFile(fileInfo.path, {
        query: { ...fileInfo.query, "meeting-notification": "true" },
      });
    }
    if (this.notificationWindow !== win) return;

    this._notificationReadyFallback = setTimeout(() => {
      this._notificationReadyFallback = null;
      if (!win.isDestroyed()) {
        debugLogger.warn(
          "Notification renderer did not signal ready, force-showing",
          {},
          "meeting"
        );
        win.webContents.send("meeting-notification-data", promptData);
        win.showInactive();
      }
    }, 3000);

    this._notificationDismissTimer.start(timeout.ms);

    // "closed" fires asynchronously, so a replaced prompt's window emits it
    // after the replacement already took over the reference and the countdown.
    win.on("closed", () => {
      if (this.notificationWindow !== win) return;
      this.notificationWindow = null;
      this._notificationAutoStart = null;
      this._notificationDismissTimer.cancel();
    });
  }

  /**
   * Drives the renderer's meeting pre-roll.
   *
   * Deliberately not tied to the prompt window's own lifetime: the window is
   * dismissed on *every* answer, including yes, so closing it must not be what
   * throws away the audio the user just agreed to keep. Only the outcome
   * decides — the detection engine says which.
   */
  setMeetingPreRoll(action) {
    if (action !== "start" && action !== "discard") return;
    this.sendToControlPanel("meeting-preroll", action);
  }

  showNotificationWindow() {
    if (this._notificationReadyFallback) {
      clearTimeout(this._notificationReadyFallback);
      this._notificationReadyFallback = null;
    }
    if (this.notificationWindow && !this.notificationWindow.isDestroyed()) {
      this.notificationWindow.showInactive();
    }
  }

  dismissMeetingNotification() {
    this._pendingNotificationData = null;
    this._notificationAutoStart = null;
    if (this._notificationReadyFallback) {
      clearTimeout(this._notificationReadyFallback);
      this._notificationReadyFallback = null;
    }
    this._notificationDismissTimer.cancel();
    if (this.notificationWindow && !this.notificationWindow.isDestroyed()) {
      this.notificationWindow.close();
    }
    this.notificationWindow = null;
  }

  // ---------------------------------------------------------------- meeting panel
  //
  // The capture graph lives in the control panel's renderer, so this window is
  // a view onto state it does not own: the control panel publishes snapshots,
  // main forwards them here, and the panel's buttons send commands back the
  // same way. Main decides only whether the window should exist at all, which
  // keeps "is there a meeting" answered in one place.

  /**
   * Applies a published snapshot: opens the panel when a meeting starts, closes
   * it when one ends, and forwards everything in between.
   */
  updateMeetingPanel(snapshot) {
    if (!snapshot || !snapshot.isRecording) {
      this.closeMeetingPanel();
      // Every route out of a meeting ends here — the panel's Stop, the in-app
      // one, the hotkey — so this is the one place that can guarantee the
      // window is back before the keep-or-discard prompt renders inside it.
      // Without it, stopping by hotkey puts that prompt behind a minimised
      // window and the meeting looks like it saved nothing.
      this._restoreAfterMeeting();
      return;
    }

    this._meetingPanelState = snapshot;

    if (!this.meetingPanelWindow || this.meetingPanelWindow.isDestroyed()) {
      // A visible bar hands its place to the panel: the meeting the bar's
      // Listen button just started should look like the bar becoming the
      // panel, not a second window appearing while the first lingers. The
      // bar itself is hidden by main, never by its renderer — one owner.
      if (this.agentWindow && !this.agentWindow.isDestroyed() && this.agentWindow.isVisible()) {
        this._meetingPanelAnchor = this.agentWindow.getBounds();
        this.hideAgentOverlay();
        // Remembered so the meeting's end gives the bar its place back — only
        // a bar this handoff hid comes back; one the user closed stays closed.
        this._barHiddenForMeeting = true;
      }
      // Awaited nowhere: the snapshot is already cached, and the panel asks for
      // it once its renderer is up, so an in-flight open loses nothing.
      this.createMeetingPanelWindow().catch((error) => {
        debugLogger.error("Failed to open the meeting panel", { error: error.message }, "meeting");
      });
      this._minimizeForMeeting();
      return;
    }

    this.sendToMeetingPanel("meeting-panel-state", snapshot);
    this._syncMeetingPanelVisibility();
  }

  /**
   * Step the control panel out of the way when a meeting starts.
   *
   * The panel is the meeting surface, and it is content-protected; the control
   * panel is neither. Leaving a full window of transcript on screen during a
   * call the user is very likely sharing is the wrong default, and the two
   * windows showing the same meeting is just noise.
   *
   * Minimised, not hidden: the user has to be able to find it again from the
   * taskbar or dock without hunting through a tray menu. Only minimises a
   * window that is actually up — a meeting started from the tray should not
   * make a hidden window appear in the taskbar just to sit there minimised.
   */
  _minimizeForMeeting() {
    const win = this.controlPanelWindow;
    if (!win || win.isDestroyed()) return;
    if (!win.isVisible() || win.isMinimized()) return;

    try {
      win.minimize();
      // Only what this minimised gets restored. A window the user had already
      // minimised themselves before the meeting is left where they put it.
      this._minimizedForMeeting = true;
    } catch (error) {
      debugLogger.debug(
        "Could not minimize the control panel for a meeting",
        { error: error.message },
        "meeting"
      );
    }
  }

  /** Undo `_minimizeForMeeting`, once, when the meeting ends. */
  _restoreAfterMeeting() {
    if (!this._minimizedForMeeting) return;
    this._minimizedForMeeting = false;

    const win = this.controlPanelWindow;
    if (!win || win.isDestroyed()) return;

    try {
      if (win.isMinimized()) win.restore();
      win.focus();
    } catch (error) {
      debugLogger.debug(
        "Could not restore the control panel after a meeting",
        { error: error.message },
        "meeting"
      );
    }
  }

  sendMeetingPanelLevel(level) {
    // Dropped rather than queued: a level is only meaningful when it arrives.
    const win = this.meetingPanelWindow;
    if (!win || win.isDestroyed() || win.webContents.isLoading()) return;
    win.webContents.send("meeting-panel-level", level);
  }

  /**
   * The transcript tail. Cached like the snapshot rather than only forwarded,
   * because the panel's renderer starts after the meeting and would otherwise
   * show an empty transcript until the next word is spoken — which, in a
   * meeting someone is listening to rather than talking in, can be a while.
   */
  sendMeetingPanelTranscript(transcript) {
    this._meetingPanelTranscript = transcript;
    const win = this.meetingPanelWindow;
    if (!win || win.isDestroyed() || win.webContents.isLoading()) return;
    win.webContents.send("meeting-panel-transcript", transcript);
  }

  getMeetingPanelTranscript() {
    return this._meetingPanelTranscript;
  }

  /**
   * The assistant's suggestion and streaming answer. Cached for the same reason
   * the transcript is: the panel's renderer starts after the meeting, and a
   * suggestion that was already prepared should be on screen when it opens
   * rather than waiting for the conversation to move.
   */
  sendMeetingPanelAssist(assist) {
    this._meetingPanelAssist = assist;
    // Deferred rather than dropped while the panel loads, unlike the level and
    // the transcript. Those are superseded within a frame or two, so a dropped
    // one costs nothing; whether a model is configured may not change again for
    // the rest of the meeting, so dropping that one strands the panel.
    this.sendToMeetingPanel("meeting-panel-assist", assist);
  }

  getMeetingPanelAssist() {
    return this._meetingPanelAssist;
  }

  /**
   * A question typed in the panel, routed to the renderer that owns the model
   * client. Unlike the buttons this does not surface the control panel: the
   * whole point is an answer without leaving the call.
   *
   * The mode rides along already validated — ipcHandlers allow-lists it.
   */
  sendMeetingPanelAsk(question, mode) {
    this.sendToControlPanel("meeting-panel-ask", question, mode);
    return { success: true };
  }

  getMeetingPanelState() {
    return this._meetingPanelState;
  }

  sendToMeetingPanel(channel, data) {
    const win = this.meetingPanelWindow;
    if (!win || win.isDestroyed()) return;
    if (win.webContents.isLoading()) {
      win.webContents.once("did-finish-load", () => {
        if (!win.isDestroyed()) win.webContents.send(channel, data);
      });
    } else {
      win.webContents.send(channel, data);
    }
  }

  /**
   * Routes a panel button back to the renderer that owns the capture graph.
   *
   * Stop surfaces the control panel as well as forwarding: it is followed by
   * the keep-or-discard prompt, and a question asked behind the meeting window
   * the user is looking at is a question they never see.
   */
  async handleMeetingPanelCommand(command) {
    if (command === "open" || command === "stop" || command === "configureModels") {
      await this.createControlPanelWindow();
    }
    this.sendToControlPanel("meeting-panel-command", command);
    return { success: true };
  }

  async createMeetingPanelWindow() {
    if (this.meetingPanelWindow && !this.meetingPanelWindow.isDestroyed()) return;
    // Two snapshots arriving back-to-back must not each open a window.
    if (this._meetingPanelOpening) return this._meetingPanelOpening;

    this._meetingPanelOpening = (async () => {
      // When the bar handed off (see updateMeetingPanel), the panel opens in
      // the bar's place; otherwise it docks to the right edge as always.
      let position;
      if (this._meetingPanelAnchor) {
        const anchor = this._meetingPanelAnchor;
        const display = screen.getDisplayNearestPoint({ x: anchor.x, y: anchor.y });
        position = resolvePanelBoundsFromAnchor(anchor, display.workArea || display.bounds, {
          width: MEETING_PANEL_SIZE_LIMITS.defaultWidth,
          height: MEETING_PANEL_SIZE_LIMITS.defaultHeight,
        });
      } else {
        const cursorPos = screen.getCursorScreenPoint();
        const display = screen.getDisplayNearestPoint(cursorPos);
        position = WindowPositionUtil.getMeetingPanelPosition(display);
      }

      const win = new BrowserWindow({ ...MEETING_PANEL_CONFIG, ...position });
      this.meetingPanelWindow = win;

      // The point of the panel: it is on screen for the user during a meeting
      // they are sharing, and absent from the share itself.
      win.setContentProtection(true);
      WindowPositionUtil.setupAlwaysOnTop(win);

      win.on("closed", () => {
        if (this.meetingPanelWindow === win) this.meetingPanelWindow = null;
      });

      try {
        if (process.env.NODE_ENV === "development") {
          await DevServerManager.waitForDevServer();
          await win.loadURL(`${DevServerManager.DEV_SERVER_URL}?meeting-panel=true`);
        } else {
          const fileInfo = DevServerManager.getAppFilePath(false);
          await win.loadFile(fileInfo.path, {
            query: { ...fileInfo.query, "meeting-panel": "true" },
          });
        }
      } catch (error) {
        // A meeting stopped mid-load tears this window down, and the pending
        // load rejects. That is the intended outcome, not a failure to report.
        if (win.isDestroyed() || this.meetingPanelWindow !== win) return;
        throw error;
      }

      if (this.meetingPanelWindow !== win || win.isDestroyed()) return;
      this._syncMeetingPanelVisibility();
    })().finally(() => {
      this._meetingPanelOpening = null;
    });

    return this._meetingPanelOpening;
  }

  /**
   * The panel is visible for as long as a meeting is recording. Full stop.
   *
   * It used to step aside whenever the control panel had focus, to avoid two
   * copies of the same controls on screen. That coupled a recording indicator
   * to focus, which moves for reasons that have nothing to do with intent:
   * minimising an unrelated application hands focus to whatever is next in the
   * z-order — often the control panel — and the panel would vanish, looking
   * for all the world like it had been minimised too.
   *
   * A status object for something as consequential as an active recording has
   * to be predictable. Redundancy while the app is in front is a much smaller
   * cost than a window that hides itself for reasons the user cannot see.
   */
  _syncMeetingPanelVisibility() {
    const win = this.meetingPanelWindow;
    if (!win || win.isDestroyed()) return;
    // showInactive: appearing must never steal focus from the meeting app.
    if (!win.isVisible()) win.showInactive();
  }

  closeMeetingPanel() {
    // The anchor described one handoff; the next meeting decides its own
    // position.
    this._meetingPanelAnchor = null;
    // The bar the handoff hid comes back — without focus, so the
    // keep-or-discard prompt the stop flow surfaces keeps the keyboard. A bar
    // the user closed themselves stays closed.
    if (this._barHiddenForMeeting) {
      this._barHiddenForMeeting = false;
      this.showAgentOverlay({ focus: false });
    }
    this._meetingPanelState = null;
    // Cleared with the panel, or the next meeting would open showing the last
    // one's words until somebody spoke — and, worse, the last one's advice.
    this._meetingPanelTranscript = null;
    this._meetingPanelAssist = null;
    const win = this.meetingPanelWindow;
    this.meetingPanelWindow = null;
    if (win && !win.isDestroyed()) win.close();
  }

  async showUpdateNotification(info) {
    if (this._updateNotificationDismissed) return;
    if (this.updateNotificationWindow && !this.updateNotificationWindow.isDestroyed()) {
      this.updateNotificationWindow.close();
      this.updateNotificationWindow = null;
    }
    if (this._updateNotificationAutoDismiss) {
      clearTimeout(this._updateNotificationAutoDismiss);
      this._updateNotificationAutoDismiss = null;
    }

    const display = screen.getPrimaryDisplay();
    const position = WindowPositionUtil.getNotificationPosition(display);

    const win = new BrowserWindow({
      ...NOTIFICATION_WINDOW_CONFIG,
      ...position,
    });
    this.updateNotificationWindow = win;

    WindowPositionUtil.setupAlwaysOnTop(this.updateNotificationWindow);

    if (process.env.NODE_ENV === "development") {
      await DevServerManager.waitForDevServer();
      await this.updateNotificationWindow.loadURL(
        `${DevServerManager.DEV_SERVER_URL}?update-notification=true`
      );
    } else {
      const fileInfo = DevServerManager.getAppFilePath(false);
      await this.updateNotificationWindow.loadFile(fileInfo.path, {
        query: { ...fileInfo.query, "update-notification": "true" },
      });
    }

    this._pendingUpdateNotificationData = {
      version: info?.version,
      releaseDate: info?.releaseDate,
    };

    this._updateNotificationReadyFallback = setTimeout(() => {
      this._updateNotificationReadyFallback = null;
      if (this.updateNotificationWindow && !this.updateNotificationWindow.isDestroyed()) {
        this.updateNotificationWindow.webContents.send(
          "update-notification-data",
          this._pendingUpdateNotificationData
        );
        this.updateNotificationWindow.showInactive();
      }
    }, 3000);

    this._updateNotificationAutoDismiss = setTimeout(() => {
      this.dismissUpdateNotification({ persistent: false });
    }, 5000);

    win.on("closed", () => {
      if (this.updateNotificationWindow !== win) return;
      this.updateNotificationWindow = null;
      if (this._updateNotificationAutoDismiss) {
        clearTimeout(this._updateNotificationAutoDismiss);
        this._updateNotificationAutoDismiss = null;
      }
    });
  }

  showUpdateNotificationWindow() {
    if (this._updateNotificationReadyFallback) {
      clearTimeout(this._updateNotificationReadyFallback);
      this._updateNotificationReadyFallback = null;
    }
    if (this.updateNotificationWindow && !this.updateNotificationWindow.isDestroyed()) {
      this.updateNotificationWindow.showInactive();
    }
  }

  dismissUpdateNotification({ persistent = true } = {}) {
    this._pendingUpdateNotificationData = null;
    if (persistent) this._updateNotificationDismissed = true;
    if (this._updateNotificationReadyFallback) {
      clearTimeout(this._updateNotificationReadyFallback);
      this._updateNotificationReadyFallback = null;
    }
    if (this._updateNotificationAutoDismiss) {
      clearTimeout(this._updateNotificationAutoDismiss);
      this._updateNotificationAutoDismiss = null;
    }
    if (this.updateNotificationWindow && !this.updateNotificationWindow.isDestroyed()) {
      this.updateNotificationWindow.close();
    }
    this.updateNotificationWindow = null;
  }

  sendToControlPanel(channel, ...args) {
    const win = this.controlPanelWindow;
    if (!win || win.isDestroyed()) return;
    if (win.webContents.isLoading()) {
      win.webContents.once("did-finish-load", () => {
        if (!win.isDestroyed()) win.webContents.send(channel, ...args);
      });
    } else {
      win.webContents.send(channel, ...args);
    }
  }

  async queueMeetingNoteNavigation(payload) {
    this._pendingMeetingNoteNavigation = payload;
    await this.createControlPanelWindow();
    this.sendToControlPanel("meeting-note-navigation-pending");
  }

  consumePendingMeetingNoteNavigation() {
    const payload = this._pendingMeetingNoteNavigation;
    this._pendingMeetingNoteNavigation = null;
    return payload;
  }

  async queueNoteNavigation(payload) {
    this._pendingNoteNavigation = payload;
    await this.createControlPanelWindow();
    this.sendToControlPanel("note-navigation-pending");
  }

  consumePendingNoteNavigation() {
    const payload = this._pendingNoteNavigation;
    this._pendingNoteNavigation = null;
    return payload;
  }

  snapControlPanelToMeetingMode() {
    const win = this.controlPanelWindow;
    if (!win || win.isDestroyed()) return;
    this._preMeetingBounds = win.getBounds();
    const display = screen.getPrimaryDisplay();
    const workArea = display.workArea;
    const width = Math.round(workArea.width / 3);
    win.setBounds({
      x: workArea.x + workArea.width - width,
      y: workArea.y,
      width,
      height: workArea.height,
    });
    win.focus();
  }

  restoreControlPanelFromMeetingMode() {
    const win = this.controlPanelWindow;
    if (!win || win.isDestroyed()) return;
    if (this._preMeetingBounds) {
      win.setBounds(this._preMeetingBounds);
      this._preMeetingBounds = null;
    } else {
      const { width, height } = CONTROL_PANEL_CONFIG;
      win.setSize(width, height);
      win.center();
    }
  }

  refreshLocalizedUi() {
    MenuManager.setupMainMenu(() => this.openSettings());

    if (this.controlPanelWindow && !this.controlPanelWindow.isDestroyed()) {
      MenuManager.setupControlPanelMenu(this.controlPanelWindow, () => this.openSettings());
      this.controlPanelWindow.setTitle(i18nMain.t("window.controlPanelTitle"));
    }

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.setTitle(i18nMain.t("window.voiceRecorderTitle"));
    }

    if (this.agentWindow && !this.agentWindow.isDestroyed()) {
      this.agentWindow.setTitle(i18nMain.t("window.agentChatTitle"));
    }
  }

  async openSettings() {
    await this.createControlPanelWindow();
    if (this.controlPanelWindow && !this.controlPanelWindow.isDestroyed()) {
      this.controlPanelWindow.webContents.send("show-settings");
    }
  }

  showLoadFailureDialog(windowName, errorCode, errorDescription, validatedURL) {
    if (this.loadErrorShown) {
      return;
    }
    this.loadErrorShown = true;
    const detailLines = [
      i18nMain.t("dialog.loadFailure.detail.window", { windowName }),
      i18nMain.t("dialog.loadFailure.detail.error", { errorCode, errorDescription }),
      validatedURL ? i18nMain.t("dialog.loadFailure.detail.url", { url: validatedURL }) : null,
      i18nMain.t("dialog.loadFailure.detail.hint"),
    ].filter(Boolean);
    dialog.showMessageBox({
      type: "error",
      title: i18nMain.t("dialog.loadFailure.title"),
      message: i18nMain.t("dialog.loadFailure.message"),
      detail: detailLines.join("\n"),
    });
  }
}

module.exports = WindowManager;
