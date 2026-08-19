/**
 * Key custody for the encrypted meeting store (spec §21.2).
 *
 *   installation key (256-bit, random, first run)
 *     └─ protected by Electron safeStorage → macOS Keychain / Windows DPAPI
 *          └─ wraps one 256-bit data key per meeting
 *               └─ encrypts audio, transcript, running state, artifact
 *
 * The service is constructed with its dependencies rather than reaching for
 * Electron, so the fail-closed rules below are unit-testable. `getDefault()`
 * binds the real `safeStorage` and userData path for production.
 *
 * Fail-closed is the whole point of §21.2: if the OS cannot protect the
 * installation key, we do NOT quietly keep a plaintext copy — meetings simply
 * cannot be created or opened, and the UI has to say so.
 */

const fs = require("fs");
const path = require("path");
const {
  generateKey,
  wrapKey,
  unwrapKey,
  KEY_BYTES,
  MeetingCryptoError,
} = require("./meetingCrypto");
const { atomicWriteFileSync } = require("./atomicWrite");

const INSTALLATION_KEY_FILE = "installation-key.bin";
const WRAPPED_DEK_FILE = "wrapped-dek.bin";

/**
 * Meeting ids become directory names, so they are validated rather than
 * trusted: an id like `../../models` would otherwise let a caller write
 * encrypted blobs anywhere under userData, or delete another meeting.
 */
const MEETING_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

class SecureStorageUnavailableError extends Error {
  constructor() {
    super(
      "OS secure storage is unavailable, so the installation key cannot be protected. " +
        "Meetings cannot be created or opened."
    );
    this.name = "SecureStorageUnavailableError";
    this.code = "SECURE_STORAGE_UNAVAILABLE";
  }
}

class InvalidMeetingIdError extends Error {
  constructor(meetingId) {
    super(`invalid meeting id: ${JSON.stringify(meetingId)}`);
    this.name = "InvalidMeetingIdError";
    this.code = "INVALID_MEETING_ID";
  }
}

function assertMeetingId(meetingId) {
  if (typeof meetingId !== "string" || !MEETING_ID_PATTERN.test(meetingId)) {
    throw new InvalidMeetingIdError(meetingId);
  }
  return meetingId;
}

/**
 * @param {object} deps
 * @param {string} deps.baseDir        private application-data root (spec §21.4)
 * @param {object} deps.secureStorage  Electron `safeStorage`, or a test double
 */
function createMeetingKeyService({ baseDir, secureStorage }) {
  const keysDir = path.join(baseDir, "keys");
  const installationKeyPath = path.join(keysDir, INSTALLATION_KEY_FILE);

  let installationKey = null;
  const meetingKeys = new Map();

  const meetingDir = (meetingId) => path.join(baseDir, "meetings", assertMeetingId(meetingId));
  const wrappedDekPath = (meetingId) => path.join(meetingDir(meetingId), "keys", WRAPPED_DEK_FILE);

  function isAvailable() {
    try {
      return secureStorage.isEncryptionAvailable() === true;
    } catch {
      return false;
    }
  }

  function requireSecureStorage() {
    if (!isAvailable()) throw new SecureStorageUnavailableError();
  }

  /**
   * The installation key, created on first use. Cached for the process
   * lifetime — every meeting open would otherwise hit the OS keychain.
   */
  function getInstallationKey() {
    if (installationKey) return installationKey;
    requireSecureStorage();

    if (fs.existsSync(installationKeyPath)) {
      const key = Buffer.from(
        secureStorage.decryptString(fs.readFileSync(installationKeyPath)),
        "base64"
      );
      if (key.length !== KEY_BYTES) {
        throw new MeetingCryptoError("stored installation key has the wrong length");
      }
      installationKey = key;
      return installationKey;
    }

    const key = generateKey();
    fs.mkdirSync(keysDir, { recursive: true });
    atomicWriteFileSync(installationKeyPath, secureStorage.encryptString(key.toString("base64")));
    installationKey = key;
    return installationKey;
  }

  /** Creates and persists a wrapped data key. Refuses to clobber an existing one. */
  function createMeetingKey(meetingId) {
    assertMeetingId(meetingId);
    const target = wrappedDekPath(meetingId);
    if (fs.existsSync(target)) {
      // Overwriting would strand every blob already sealed under the old key.
      throw new Error(`meeting ${meetingId} already has a data key`);
    }

    const key = generateKey();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    atomicWriteFileSync(target, wrapKey({ wrappingKey: getInstallationKey(), key, meetingId }));
    meetingKeys.set(meetingId, key);
    return key;
  }

  function getMeetingKey(meetingId) {
    assertMeetingId(meetingId);
    const cached = meetingKeys.get(meetingId);
    if (cached) return cached;

    const key = unwrapKey({
      wrappingKey: getInstallationKey(),
      envelope: fs.readFileSync(wrappedDekPath(meetingId)),
      meetingId,
    });
    meetingKeys.set(meetingId, key);
    return key;
  }

  function hasMeetingKey(meetingId) {
    assertMeetingId(meetingId);
    return fs.existsSync(wrappedDekPath(meetingId));
  }

  /**
   * Deleting the wrapped key makes every blob in the meeting permanently
   * unreadable, which is what makes §21.6 deletion meaningful even if a stray
   * encrypted file survives on a backup volume.
   */
  function destroyMeetingKey(meetingId) {
    assertMeetingId(meetingId);
    meetingKeys.delete(meetingId);
    fs.rmSync(wrappedDekPath(meetingId), { force: true });
  }

  /** Drops cached key material — call when locking the app or on quit. */
  function forget() {
    meetingKeys.clear();
    installationKey = null;
  }

  return {
    isAvailable,
    getInstallationKey,
    createMeetingKey,
    getMeetingKey,
    hasMeetingKey,
    destroyMeetingKey,
    forget,
    meetingDir,
  };
}

let defaultService = null;

/** Production instance, bound to Electron's safeStorage and userData path. */
function getDefault() {
  if (defaultService) return defaultService;
  const { app, safeStorage } = require("electron");
  defaultService = createMeetingKeyService({
    baseDir: app.getPath("userData"),
    secureStorage: safeStorage,
  });
  return defaultService;
}

module.exports = {
  createMeetingKeyService,
  getDefault,
  assertMeetingId,
  SecureStorageUnavailableError,
  InvalidMeetingIdError,
  MEETING_ID_PATTERN,
};
