/**
 * Content encryption for meeting artifacts (spec §21.2).
 *
 * Deliberately free of Electron imports so every rule here is unit-testable
 * without a running app — the same convention as `diarizationPolicy.js` and
 * `autoStartPolicy.js`. Key *custody* (Keychain / DPAPI, file paths, fail-closed
 * behaviour) lives in `meetingKeyService.js`; this module only seals and opens
 * bytes with a key it is handed.
 *
 * Envelope layout:
 *
 *   0..3    magic "SNW1"
 *   4       envelope format version
 *   5       algorithm id (1 = AES-256-GCM)
 *   6..17   nonce (96-bit, random per operation)
 *   18..33  GCM authentication tag
 *   34..    ciphertext
 *
 * The 6-byte header is fed into the AAD, so an attacker cannot rewrite the
 * version or algorithm byte to steer a future reader onto a weaker path
 * without invalidating the tag.
 */

const crypto = require("crypto");

const MAGIC = Buffer.from("SNW1", "ascii");
const FORMAT_VERSION = 1;
const ALG_AES_256_GCM = 1;

const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + 2;
const PREFIX_BYTES = HEADER_BYTES + NONCE_BYTES + TAG_BYTES;

class MeetingCryptoError extends Error {
  constructor(message) {
    super(message);
    this.name = "MeetingCryptoError";
  }
}

/** A fresh 256-bit key. Used for both the installation key and per-meeting DEKs. */
function generateKey() {
  return crypto.randomBytes(KEY_BYTES);
}

function assertKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) {
    throw new MeetingCryptoError(`key must be ${KEY_BYTES} bytes`);
  }
}

/**
 * Binds a ciphertext to the thing it is supposed to be (spec §21.2: "authenticate
 * meeting ID, object type, object ID and schema version as additional
 * authenticated data"). Without this, an attacker with disk access could swap
 * one meeting's encrypted summary for another's — every blob is sealed under the
 * same meeting key, so the tag alone would still verify.
 *
 * Every field is length-prefixed. Plain concatenation would let ("ab","c") and
 * ("a","bc") produce identical AAD, which is exactly the ambiguity the binding
 * exists to remove.
 */
function buildAad({ meetingId, objectType, objectId, schemaVersion }) {
  const fields = [meetingId, objectType, objectId, schemaVersion];
  if (fields.some((field) => typeof field !== "string" || field.length === 0)) {
    throw new MeetingCryptoError(
      "aad requires non-empty meetingId, objectType, objectId and schemaVersion"
    );
  }

  const parts = [];
  for (const field of fields) {
    const bytes = Buffer.from(field, "utf8");
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(bytes.length, 0);
    parts.push(length, bytes);
  }
  return Buffer.concat(parts);
}

function buildHeader() {
  return Buffer.concat([MAGIC, Buffer.from([FORMAT_VERSION, ALG_AES_256_GCM])]);
}

/**
 * @param {object} options
 * @param {Buffer} options.key      256-bit content key
 * @param {Buffer|string} options.plaintext
 * @param {Buffer} options.aad      from {@link buildAad}
 * @returns {Buffer} the sealed envelope, safe to write to disk
 */
function seal({ key, plaintext, aad }) {
  assertKey(key);
  if (!Buffer.isBuffer(aad) || aad.length === 0) {
    throw new MeetingCryptoError("aad is required");
  }

  const header = buildHeader();
  // Random per operation, never derived from a counter: a repeated nonce under
  // the same key is a total break of GCM confidentiality and authenticity.
  const nonce = crypto.randomBytes(NONCE_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.concat([header, aad]));

  const body = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(String(plaintext), "utf8");
  const ciphertext = Buffer.concat([cipher.update(body), cipher.final()]);

  return Buffer.concat([header, nonce, cipher.getAuthTag(), ciphertext]);
}

/**
 * Reverses {@link seal}. Throws rather than returning a partial result: a
 * failed tag check means the bytes are not what they claim to be, and callers
 * must never see "probably fine" content.
 *
 * @returns {Buffer} plaintext
 */
function open({ key, envelope, aad }) {
  assertKey(key);
  if (!Buffer.isBuffer(envelope) || envelope.length < PREFIX_BYTES) {
    throw new MeetingCryptoError("envelope is truncated");
  }
  if (!envelope.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new MeetingCryptoError("not a Snowy envelope");
  }

  const version = envelope[MAGIC.length];
  const algorithm = envelope[MAGIC.length + 1];
  if (version !== FORMAT_VERSION) {
    throw new MeetingCryptoError(`unsupported envelope version ${version}`);
  }
  if (algorithm !== ALG_AES_256_GCM) {
    throw new MeetingCryptoError(`unsupported algorithm ${algorithm}`);
  }

  const header = envelope.subarray(0, HEADER_BYTES);
  const nonce = envelope.subarray(HEADER_BYTES, HEADER_BYTES + NONCE_BYTES);
  const tag = envelope.subarray(HEADER_BYTES + NONCE_BYTES, PREFIX_BYTES);
  const ciphertext = envelope.subarray(PREFIX_BYTES);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(Buffer.concat([header, aad]));
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // Deliberately opaque: distinguishing "wrong key" from "tampered" from
    // "wrong meeting" would hand an attacker an oracle.
    throw new MeetingCryptoError("authentication failed");
  }
}

/** Convenience for JSON objects — the shape almost every caller actually has. */
function sealJson({ key, value, aad }) {
  return seal({ key, plaintext: Buffer.from(JSON.stringify(value), "utf8"), aad });
}

function openJson({ key, envelope, aad }) {
  return JSON.parse(open({ key, envelope, aad }).toString("utf8"));
}

/**
 * Wraps a per-meeting data key with the installation key (spec §21.2). The AAD
 * ties the wrapped key to its meeting, so a wrapped DEK copied into another
 * meeting's directory will not unwrap.
 */
function wrapKey({ wrappingKey, key, meetingId }) {
  assertKey(key);
  return seal({
    key: wrappingKey,
    plaintext: key,
    aad: buildAad({
      meetingId,
      objectType: "meeting-dek",
      objectId: meetingId,
      schemaVersion: "1",
    }),
  });
}

function unwrapKey({ wrappingKey, envelope, meetingId }) {
  const key = open({
    key: wrappingKey,
    envelope,
    aad: buildAad({
      meetingId,
      objectType: "meeting-dek",
      objectId: meetingId,
      schemaVersion: "1",
    }),
  });
  assertKey(key);
  return key;
}

module.exports = {
  MeetingCryptoError,
  KEY_BYTES,
  NONCE_BYTES,
  TAG_BYTES,
  FORMAT_VERSION,
  generateKey,
  buildAad,
  seal,
  open,
  sealJson,
  openJson,
  wrapKey,
  unwrapKey,
};
