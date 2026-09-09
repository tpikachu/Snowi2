// Automatic updates over GitHub releases. The feed is whatever
// electron-builder.json "publish" points at (today tpikachu/Snowi2 — a
// temporary artifact home; moving the artifacts later means changing that one
// block, not this file, because electron-updater reads the feed from the
// app-update.yml electron-builder embeds at package time).
//
// Shape: check on startup (and every few hours), download only on the user's
// click, install on the user's click. The renderer drives through the same
// IPC surface the disabled-era stub mirrored, so useUpdater.ts and the
// Settings "Check for Updates" button work unchanged; main additionally
// surfaces the small update-notification overlay when a check finds one.
const { app } = require("electron");
const debugLogger = require("./helpers/debugLogger");
const { broadcastToWindows } = require("./helpers/windowBroadcast");

const STARTUP_CHECK_DELAY_MS = 15_000;
const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

const DEV_MESSAGE = "Automatic updates are disabled in development";

class UpdateManager {
  constructor() {
    this.updateAvailable = false;
    this.updateDownloaded = false;
    this.lastUpdateInfo = null;
    this.isQuittingForUpdate = false;
    this.windowManager = null;
    this.autoUpdater = null;
    this._startupTimer = null;
    this._recheckTimer = null;

    // Unpackaged runs have no app-update.yml and nothing installable —
    // electron-updater would only throw. The stub behavior stays for dev.
    if (!app.isPackaged) {
      debugLogger.debug("updater: development run, updates disabled");
      return;
    }

    try {
      const { autoUpdater } = require("electron-updater");
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = true;
      // Every Snowy release so far ships as an rc marked prerelease on
      // GitHub; without this the feed reads as permanently empty.
      autoUpdater.allowPrerelease = true;
      autoUpdater.logger = {
        info: (msg) => debugLogger.debug(`updater: ${msg}`),
        warn: (msg) => debugLogger.warn(`updater: ${msg}`),
        error: (msg) => debugLogger.error(`updater: ${msg}`),
        debug: (msg) => debugLogger.debug(`updater: ${msg}`),
      };
      this._wireEvents(autoUpdater);
      this.autoUpdater = autoUpdater;
    } catch (error) {
      debugLogger.error("updater: electron-updater unavailable", { error: error.message });
    }
  }

  setWindowManager(windowManager) {
    this.windowManager = windowManager;
  }

  _wireEvents(autoUpdater) {
    autoUpdater.on("update-available", (info) => {
      this.updateAvailable = true;
      this.lastUpdateInfo = info;
      debugLogger.info("updater: update available", { version: info?.version });
      broadcastToWindows("update-available", { version: info?.version });
      // The quiet corner card; it dismisses itself and never nags twice.
      this.windowManager?.showUpdateNotification?.({
        version: info?.version,
        releaseDate: info?.releaseDate,
      });
    });
    autoUpdater.on("update-not-available", () => {
      this.updateAvailable = false;
      broadcastToWindows("update-not-available", {});
    });
    autoUpdater.on("download-progress", (progress) => {
      broadcastToWindows("update-download-progress", {
        percent: progress?.percent,
        transferred: progress?.transferred,
        total: progress?.total,
        bytesPerSecond: progress?.bytesPerSecond,
      });
    });
    autoUpdater.on("update-downloaded", (info) => {
      this.updateDownloaded = true;
      this.lastUpdateInfo = info ?? this.lastUpdateInfo;
      debugLogger.info("updater: update downloaded", { version: info?.version });
      broadcastToWindows("update-downloaded", { version: info?.version });
    });
    autoUpdater.on("error", (error) => {
      // Includes the macOS unsigned-build case: checks succeed but apply
      // fails signature validation. Surfaced, never fatal — the app runs on.
      debugLogger.warn("updater: error", { error: error?.message });
      broadcastToWindows("update-error", { message: error?.message });
    });
  }

  async checkForUpdates() {
    if (!this.autoUpdater) {
      return { updateAvailable: false, message: DEV_MESSAGE };
    }
    try {
      const result = await this.autoUpdater.checkForUpdates();
      // The available/not-available events above have already settled state.
      return {
        updateAvailable: this.updateAvailable,
        version: result?.updateInfo?.version,
      };
    } catch (error) {
      debugLogger.warn("updater: check failed", { error: error.message });
      return { updateAvailable: false, message: error.message };
    }
  }

  async downloadUpdate() {
    if (!this.autoUpdater) return { success: false, message: DEV_MESSAGE };
    if (!this.updateAvailable) return { success: false, message: "No update available" };
    try {
      await this.autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      debugLogger.warn("updater: download failed", { error: error.message });
      return { success: false, message: error.message };
    }
  }

  async installUpdate() {
    if (!this.autoUpdater) return { success: false, message: DEV_MESSAGE };
    if (!this.updateDownloaded) return { success: false, message: "No update downloaded" };
    // The flag is what lets will-quit tell an update restart from a plain
    // quit; set before quitAndInstall so the teardown path reads it.
    this.isQuittingForUpdate = true;
    setImmediate(() => this.autoUpdater.quitAndInstall());
    return { success: true };
  }

  async getAppVersion() {
    return { version: app.getVersion() };
  }

  async getUpdateStatus() {
    return {
      updateAvailable: this.updateAvailable,
      updateDownloaded: this.updateDownloaded,
      isDevelopment: !app.isPackaged,
    };
  }

  async getUpdateInfo() {
    if (!this.lastUpdateInfo) return null;
    return {
      version: this.lastUpdateInfo.version,
      releaseDate: this.lastUpdateInfo.releaseDate,
    };
  }

  checkForUpdatesOnStartup() {
    if (!this.autoUpdater) return;
    // Delayed past the launch rush (model warmup, sidecars, first paint),
    // then a slow heartbeat for the app's long tray-resident life.
    this._startupTimer = setTimeout(() => {
      this._startupTimer = null;
      void this.checkForUpdates();
    }, STARTUP_CHECK_DELAY_MS);
    this._recheckTimer = setInterval(() => {
      void this.checkForUpdates();
    }, RECHECK_INTERVAL_MS);
  }

  cleanup() {
    if (this._startupTimer) clearTimeout(this._startupTimer);
    if (this._recheckTimer) clearInterval(this._recheckTimer);
    this._startupTimer = null;
    this._recheckTimer = null;
  }
}

module.exports = UpdateManager;
