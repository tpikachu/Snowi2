// Automatic updates over GitHub releases.
//
// Which release: main resolves it (helpers/updateFeed.js) from the repo's
// release list — the newest version above the running one that carries the
// platform's channel file — and points electron-updater's generic provider at
// that release's download folder. electron-updater's own GitHub provider
// could not do this for Snowy's rcN tags: it reads "rc8" as a channel name
// and accepts only rc8-tagged releases, so rc9 was never found and every
// check ended in "No published versions on GitHub" (client, 2026-09-15: no
// prompt to update, just a red toast). The repo comes from the app-update.yml
// electron-builder embeds at package time (today tpikachu/Snowi2), falling
// back to package.json's repository; moving the artifacts means changing the
// "publish" block, not this file.
//
// Shape: check on startup (and every few hours), download only on the user's
// click, install on the user's click or at quit. The renderer drives through
// the IPC surface useUpdater.ts consumes — the control panel's persistent
// banner (UpdateBanner.tsx), the rail icon, and Settings → System — and main
// additionally surfaces the small corner card when a check finds a release.
// Background checks fail quietly; only a manual check or a download/install
// failure is surfaced.
//
// Dev hook: SNOWY_FAKE_UPDATE_VERSION=<version> makes an unpackaged run
// announce that version (and fake its download), so the banner and the
// corner card can be seen — and e2e-tested — without a packaged build.
const { app, net } = require("electron");
const debugLogger = require("./helpers/debugLogger");
const { broadcastToWindows } = require("./helpers/windowBroadcast");
const {
  resolveLatestRelease,
  parseGitHubRepository,
  releasesApiUrl,
  releaseDownloadBase,
} = require("./helpers/updateFeed");

const STARTUP_CHECK_DELAY_MS = 15_000;
const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const FEED_TIMEOUT_MS = 15_000;
const FAKE_ANNOUNCE_DELAY_MS = 1_500;

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
    // True while a background check runs: its errors are logged, not shown.
    this._quietErrors = false;
    this._fakeVersion = null;
    this._repository = null;

    // Unpackaged runs have no app-update.yml and nothing installable —
    // electron-updater would only throw. The stub behavior stays for dev,
    // unless the fake-release hook is set.
    if (!app.isPackaged) {
      const fake = (process.env.SNOWY_FAKE_UPDATE_VERSION || "").trim();
      if (fake) {
        this._fakeVersion = fake;
        debugLogger.info("updater: development run, faking a release", { version: fake });
      } else {
        debugLogger.debug("updater: development run, updates disabled");
      }
      return;
    }

    try {
      const { autoUpdater } = require("electron-updater");
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = true;
      // Every Snowy release so far is a prerelease; the version compare must
      // not refuse one.
      autoUpdater.allowPrerelease = true;
      // The release is chosen by updateFeed.js, whose ordering reads rc10 as
      // newer than rc9; semver — and so the library — reads it as older. With
      // this on, the library takes the release main pointed it at.
      autoUpdater.allowDowngrade = true;
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
      this._announce({ version: info?.version, releaseDate: info?.releaseDate }, info);
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
      debugLogger.warn("updater: error", { error: error?.message, quiet: this._quietErrors });
      // A background check that cannot read the feed is not the user's
      // problem; the next one is hours away. Manual checks and download or
      // install failures still reach the renderer.
      if (this._quietErrors) return;
      broadcastToWindows("update-error", { message: error?.message });
    });
  }

  /** A release is out: remember it, tell every window, show the corner card. */
  _announce(summary, info = summary) {
    this.updateAvailable = true;
    this.lastUpdateInfo = info;
    debugLogger.info("updater: update available", { version: summary.version });
    broadcastToWindows("update-available", { version: summary.version });
    this.windowManager?.showUpdateNotification?.(summary);
  }

  /** owner/repo: the embedded publish config first, package.json second. */
  async _resolveRepository() {
    if (this._repository) return this._repository;
    try {
      const config = await this.autoUpdater.configOnDisk.value;
      if (config?.owner && config?.repo) {
        this._repository = { owner: config.owner, repo: config.repo };
        return this._repository;
      }
    } catch (error) {
      debugLogger.debug("updater: no embedded publish config", { error: error.message });
    }
    this._repository = parseGitHubRepository(require("../package.json").repository);
    return this._repository;
  }

  async _fetchReleases(repository) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
    try {
      const response = await net.fetch(releasesApiUrl(repository), {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": `Snowy/${app.getVersion()}`,
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`GitHub releases request failed: HTTP ${response.status}`);
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Finds the release to update to and points electron-updater at it.
   * Returns the release, or null when the running version is the newest.
   */
  async _pointFeedAtLatestRelease() {
    const repository = await this._resolveRepository();
    if (!repository) throw new Error("No GitHub repository configured for updates");
    const releases = await this._fetchReleases(repository);
    const release = resolveLatestRelease({
      releases,
      currentVersion: app.getVersion(),
      platform: process.platform,
    });
    if (!release) return null;
    this.autoUpdater.setFeedURL({
      provider: "generic",
      url: releaseDownloadBase(repository, release.tag),
    });
    debugLogger.info("updater: release resolved", { tag: release.tag, version: release.version });
    return release;
  }

  async checkForUpdates({ background = false } = {}) {
    if (this._fakeVersion) {
      this._announceFakeUpdate();
      return { updateAvailable: true, version: this._fakeVersion };
    }
    if (!this.autoUpdater) {
      return { updateAvailable: false, message: DEV_MESSAGE };
    }
    this._quietErrors = background;
    try {
      const release = await this._pointFeedAtLatestRelease();
      if (!release) {
        this.updateAvailable = false;
        broadcastToWindows("update-not-available", {});
        return { updateAvailable: false };
      }
      const result = await this.autoUpdater.checkForUpdates();
      // The available/not-available events above have already settled state.
      return {
        updateAvailable: this.updateAvailable,
        version: result?.updateInfo?.version,
      };
    } catch (error) {
      debugLogger.warn("updater: check failed", { error: error.message, background });
      return { updateAvailable: false, message: error.message };
    } finally {
      this._quietErrors = false;
    }
  }

  async downloadUpdate() {
    if (this._fakeVersion) return this._fakeDownload();
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
    if (this._fakeVersion) return { success: false, message: "Fake release: nothing to install" };
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
      isDevelopment: !app.isPackaged && !this._fakeVersion,
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
    if (this._fakeVersion) {
      this._startupTimer = setTimeout(() => {
        this._startupTimer = null;
        this._announceFakeUpdate();
      }, FAKE_ANNOUNCE_DELAY_MS);
      return;
    }
    if (!this.autoUpdater) return;
    // Delayed past the launch rush (model warmup, sidecars, first paint),
    // then a slow heartbeat for the app's long tray-resident life.
    this._startupTimer = setTimeout(() => {
      this._startupTimer = null;
      void this.checkForUpdates({ background: true });
    }, STARTUP_CHECK_DELAY_MS);
    this._recheckTimer = setInterval(() => {
      void this.checkForUpdates({ background: true });
    }, RECHECK_INTERVAL_MS);
  }

  _announceFakeUpdate() {
    if (this.updateAvailable) return;
    this._announce({ version: this._fakeVersion, releaseDate: new Date().toISOString() });
  }

  async _fakeDownload() {
    if (!this.updateAvailable) return { success: false, message: "No update available" };
    for (const percent of [12, 38, 67, 91, 100]) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      broadcastToWindows("update-download-progress", { percent });
    }
    this.updateDownloaded = true;
    broadcastToWindows("update-downloaded", { version: this._fakeVersion });
    return { success: true };
  }

  cleanup() {
    if (this._startupTimer) clearTimeout(this._startupTimer);
    if (this._recheckTimer) clearInterval(this._recheckTimer);
    this._startupTimer = null;
    this._recheckTimer = null;
  }
}

module.exports = UpdateManager;
