// Automatic updates are disabled in this build: no update feed is configured,
// and every update entry point is a graceful no-op so the renderer's updater UI
// (useUpdater.ts, Settings "Check for Updates") degrades cleanly. The public
// API mirrors the original electron-updater-backed UpdateManager.
const debugLogger = require("./helpers/debugLogger");

const DISABLED_MESSAGE = "Automatic updates are disabled in this build";

class UpdateManager {
  constructor() {
    this.updateAvailable = false;
    this.updateDownloaded = false;
    this.lastUpdateInfo = null;
    this.isQuittingForUpdate = false;
    this.windowManager = null;
    debugLogger.debug("updates disabled in this build");
  }

  setWindowManager(windowManager) {
    this.windowManager = windowManager;
  }

  async checkForUpdates() {
    debugLogger.debug("checkForUpdates: updates disabled in this build");
    return {
      updateAvailable: false,
      message: DISABLED_MESSAGE,
    };
  }

  async downloadUpdate() {
    debugLogger.debug("downloadUpdate: updates disabled in this build");
    return { success: false, message: DISABLED_MESSAGE };
  }

  async installUpdate() {
    debugLogger.debug("installUpdate: updates disabled in this build");
    return { success: false, message: DISABLED_MESSAGE };
  }

  async getAppVersion() {
    const { app } = require("electron");
    return { version: app.getVersion() };
  }

  async getUpdateStatus() {
    return {
      updateAvailable: false,
      updateDownloaded: false,
      isDevelopment: process.env.NODE_ENV === "development",
    };
  }

  async getUpdateInfo() {
    return null;
  }

  checkForUpdatesOnStartup() {
    debugLogger.debug("checkForUpdatesOnStartup: updates disabled in this build");
  }

  cleanup() {}
}

module.exports = UpdateManager;
