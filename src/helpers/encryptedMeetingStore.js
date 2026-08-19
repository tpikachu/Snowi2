/**
 * The encrypted meeting store (spec §21.1, §21.4, §21.5, §21.6).
 *
 * Everything a meeting produces — audio chunks, transcript checkpoints, running
 * state, the final artifact and its manifest — is sealed under that meeting's
 * data key before it touches the disk, and written atomically. Nothing here
 * ever writes plaintext content: the only unencrypted bytes on disk are the
 * directory names, which are random ids.
 *
 * Layout (§21.4):
 *
 *   meetings/<meeting-id>/
 *     manifest.enc
 *     keys/wrapped-dek.bin
 *     audio/mic-000001.enc
 *     audio/system-000001.enc
 *     transcript/checkpoint-000001.enc
 *     state/running-state.enc
 *     artifact/snowi-meeting-v1.json.enc
 */

const fs = require("fs");
const path = require("path");
const { buildAad, seal, open, sealJson, openJson } = require("./meetingCrypto");
const { atomicWriteFileSync } = require("./atomicWrite");
const { assertMeetingId, MEETING_ID_PATTERN } = require("./meetingKeyService");

const SCHEMA_VERSION = "snowi.meeting.v1";
const SEQUENCE_DIGITS = 6;

/** Single-instance objects: one file each, addressed by kind alone. */
const SINGLETON_OBJECTS = {
  manifest: { file: "manifest.enc", type: "manifest" },
  "running-state": { file: path.join("state", "running-state.enc"), type: "running-state" },
  artifact: { file: path.join("artifact", "snowi-meeting-v1.json.enc"), type: "artifact" },
  // Every memory object this meeting produced, in one sealed document rather
  // than a file each (§19, §21.1). A meeting yields tens of objects of a few
  // hundred bytes; per-object files would multiply the syscalls and the
  // directory entries for no benefit, and rewriting the document is atomic,
  // which a batch of individual writes would not be.
  memory: { file: path.join("memory", "memory-v1.json.enc"), type: "memory" },
};

/** Append-only sequences: many numbered files under one directory. */
const CHUNK_KINDS = {
  audio: { dir: "audio", type: "audio-chunk" },
  transcript: { dir: "transcript", type: "transcript-checkpoint" },
};

const TRACK_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

function formatSequence(sequence) {
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new Error(`sequence must be a non-negative integer, got ${sequence}`);
  }
  return String(sequence).padStart(SEQUENCE_DIGITS, "0");
}

function assertTrack(track) {
  // Track names become filename prefixes, so they get the same treatment as
  // meeting ids: validated, never interpolated on trust.
  if (typeof track !== "string" || !TRACK_PATTERN.test(track)) {
    throw new Error(`invalid track name: ${JSON.stringify(track)}`);
  }
  return track;
}

/**
 * @param {object} deps
 * @param {string} deps.baseDir     private application-data root
 * @param {object} deps.keyService  from `meetingKeyService`
 */
function createEncryptedMeetingStore({ baseDir, keyService }) {
  const meetingsRoot = path.join(baseDir, "meetings");
  const meetingDir = (meetingId) => path.join(meetingsRoot, assertMeetingId(meetingId));

  const aadFor = (meetingId, objectType, objectId) =>
    buildAad({ meetingId, objectType, objectId, schemaVersion: SCHEMA_VERSION });

  function writeSealed(target, meetingId, objectType, objectId, sealBytes) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    atomicWriteFileSync(target, sealBytes);
    return path.relative(meetingsRoot, target);
  }

  /** Creates the directory skeleton and the meeting's data key. */
  function createMeeting(meetingId) {
    assertMeetingId(meetingId);
    const directory = meetingDir(meetingId);
    if (fs.existsSync(directory)) throw new Error(`meeting ${meetingId} already exists`);
    fs.mkdirSync(directory, { recursive: true });
    keyService.createMeetingKey(meetingId);
    return directory;
  }

  function exists(meetingId) {
    return fs.existsSync(meetingDir(meetingId));
  }

  /** Writes one of the singleton JSON objects (manifest, running state, artifact). */
  function putObject(meetingId, kind, value) {
    const descriptor = SINGLETON_OBJECTS[kind];
    if (!descriptor) throw new Error(`unknown object kind: ${kind}`);

    const key = keyService.getMeetingKey(meetingId);
    const target = path.join(meetingDir(meetingId), descriptor.file);
    return writeSealed(
      target,
      meetingId,
      descriptor.type,
      kind,
      sealJson({ key, value, aad: aadFor(meetingId, descriptor.type, kind) })
    );
  }

  function getObject(meetingId, kind) {
    const descriptor = SINGLETON_OBJECTS[kind];
    if (!descriptor) throw new Error(`unknown object kind: ${kind}`);

    const target = path.join(meetingDir(meetingId), descriptor.file);
    if (!fs.existsSync(target)) return null;

    return openJson({
      key: keyService.getMeetingKey(meetingId),
      envelope: fs.readFileSync(target),
      aad: aadFor(meetingId, descriptor.type, kind),
    });
  }

  /**
   * Appends a numbered encrypted chunk — audio (§13.2) or a transcript
   * checkpoint. The sequence number is part of the AAD, so chunks cannot be
   * reordered or replayed on disk without failing their tag.
   */
  function putChunk(meetingId, kind, { track, sequence, data }) {
    const descriptor = CHUNK_KINDS[kind];
    if (!descriptor) throw new Error(`unknown chunk kind: ${kind}`);

    assertTrack(track);
    const objectId = `${track}-${formatSequence(sequence)}`;
    const target = path.join(meetingDir(meetingId), descriptor.dir, `${objectId}.enc`);

    return writeSealed(
      target,
      meetingId,
      descriptor.type,
      objectId,
      seal({
        key: keyService.getMeetingKey(meetingId),
        plaintext: Buffer.isBuffer(data) ? data : Buffer.from(String(data), "utf8"),
        aad: aadFor(meetingId, descriptor.type, objectId),
      })
    );
  }

  function getChunk(meetingId, kind, { track, sequence }) {
    const descriptor = CHUNK_KINDS[kind];
    if (!descriptor) throw new Error(`unknown chunk kind: ${kind}`);

    assertTrack(track);
    const objectId = `${track}-${formatSequence(sequence)}`;
    const target = path.join(meetingDir(meetingId), descriptor.dir, `${objectId}.enc`);
    if (!fs.existsSync(target)) return null;

    return open({
      key: keyService.getMeetingKey(meetingId),
      envelope: fs.readFileSync(target),
      aad: aadFor(meetingId, descriptor.type, objectId),
    });
  }

  /** Sequence numbers present for a track, ascending — the recovery entry point. */
  function listChunkSequences(meetingId, kind, track) {
    const descriptor = CHUNK_KINDS[kind];
    if (!descriptor) throw new Error(`unknown chunk kind: ${kind}`);

    assertTrack(track);
    const directory = path.join(meetingDir(meetingId), descriptor.dir);
    if (!fs.existsSync(directory)) return [];

    const prefix = `${track}-`;
    return fs
      .readdirSync(directory)
      .filter((name) => name.startsWith(prefix) && name.endsWith(".enc"))
      .map((name) => Number(name.slice(prefix.length, -".enc".length)))
      .filter(Number.isInteger)
      .sort((a, b) => a - b);
  }

  /** Encrypted bytes on disk for one meeting, for the §21.6 quota accounting. */
  function usageBytes(meetingId) {
    const directory = meetingDir(meetingId);
    if (!fs.existsSync(directory)) return 0;

    let total = 0;
    const walk = (current) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile()) total += fs.statSync(full).size;
      }
    };
    walk(directory);
    return total;
  }

  function listMeetingIds() {
    if (!fs.existsSync(meetingsRoot)) return [];
    return fs
      .readdirSync(meetingsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => MEETING_ID_PATTERN.test(name));
  }

  /**
   * §21.6: deletion removes the encrypted files *and* the wrapped key. The key
   * goes first — if the directory removal is interrupted, what survives is
   * already undecryptable rather than merely deleted-ish.
   */
  function deleteMeeting(meetingId) {
    assertMeetingId(meetingId);
    keyService.destroyMeetingKey(meetingId);
    fs.rmSync(meetingDir(meetingId), { recursive: true, force: true });
  }

  return {
    SCHEMA_VERSION,
    meetingDir,
    createMeeting,
    exists,
    putObject,
    getObject,
    putChunk,
    getChunk,
    listChunkSequences,
    usageBytes,
    listMeetingIds,
    deleteMeeting,
  };
}

module.exports = {
  createEncryptedMeetingStore,
  SCHEMA_VERSION,
  SINGLETON_OBJECTS,
  CHUNK_KINDS,
};
