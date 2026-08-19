// Where memory objects live: split across two stores, on purpose.
//
// §21.1 forbids memory objects in plaintext on disk, so their content is sealed
// under the meeting's data key. But an encrypted blob cannot answer "what is
// still open and assigned to me" without decrypting every meeting the user has
// ever had — and that question should be a query, not a scan.
//
// So each object is stored twice, split by what the field *is*:
//
//   SQLite (`memory_objects`)   id, meeting, note, type, subject, status,
//                               due date, confidence, timestamps, supersedes,
//                               sync_status, content hash
//   Sealed document per meeting content, owner's name, source segment ids
//
// Nothing in the SQLite row is meeting substance: `type` and `status` are
// enums, `subject` is a role rather than a name, and the hash is one-way. What
// a person said, and who they are, never leaves the sealed side. That is what
// makes "open action items assigned to me" an index lookup while keeping the
// claim itself unreadable to anything holding the database file.
//
// The tiering this anticipates: a free install never syncs, so the sealed side
// stays on the device. A paid one syncs `sync_status`-marked rows, and because
// content is already sealed under a key derived on this machine, syncing it
// does not hand the server readable meeting content.

const { randomUUID } = require("crypto");
const debugLogger = require("./debugLogger");
const { decideConsolidation, normalizeMemoryObject } = require("./memoryObjects");

/** Fields the sealed document owns. Everything else is safe to index. */
const SEALED_FIELDS = ["content", "owner", "source_segments"];

/**
 * Meetings predate the meeting entity (§18), so a note that produces memory is
 * given a stable id here and keeps it. Forward-compatible: when the meeting
 * entity lands, this is the id it adopts rather than a second one to reconcile.
 */
function mintMeetingId() {
  return `mtg_${randomUUID().replace(/-/g, "")}`;
}

function splitObject(object) {
  const sealed = {};
  const indexed = { ...object };
  for (const field of SEALED_FIELDS) {
    sealed[field] = object[field];
    delete indexed[field];
  }
  return { sealed, indexed };
}

/**
 * @param {object} deps
 * @param {object} deps.database  DatabaseManager — the indexed half
 * @param {object} deps.store     encryptedMeetingStore — the sealed half
 */
function createMemoryStore({ database, store }) {
  /** Reads a meeting's sealed document, tolerating one that was never written. */
  function readSealed(meetingId) {
    try {
      if (!store.exists(meetingId)) return {};
      return store.getObject(meetingId, "memory") ?? {};
    } catch (error) {
      // A meeting whose key is gone (uninstalled keychain, restored backup)
      // must not take the whole read path down; its rows degrade to metadata.
      debugLogger.debug("Memory document unreadable", { meetingId, error: error.message });
      return {};
    }
  }

  function writeSealed(meetingId, document) {
    if (!store.exists(meetingId)) store.createMeeting(meetingId);
    store.putObject(meetingId, "memory", document);
  }

  /** Rehydrates indexed rows with their sealed content, one read per meeting. */
  function hydrate(rows) {
    const byMeeting = new Map();
    for (const row of rows) {
      if (!row.meeting_id) continue;
      if (!byMeeting.has(row.meeting_id)) byMeeting.set(row.meeting_id, readSealed(row.meeting_id));
    }
    return rows.map((row) => {
      const sealed = byMeeting.get(row.meeting_id)?.[row.id];
      return {
        ...row,
        content: sealed?.content ?? null,
        owner: sealed?.owner ?? null,
        source_segments: sealed?.source_segments ?? [],
        // A row whose content cannot be decrypted is still a real commitment
        // with a real due date. Saying so is better than pretending it is gone.
        content_available: sealed?.content != null,
      };
    });
  }

  /**
   * Consolidates and persists a batch of freshly extracted objects.
   *
   * Both halves of each write happen together per meeting: the sealed document
   * is rewritten once at the end rather than per object, so a batch of twenty
   * costs one file write.
   */
  function ingest({ meetingId, noteId, objects, now = new Date().toISOString() }) {
    const summary = { inserted: 0, superseded: 0, duplicates: 0, rejected: [] };
    if (!Array.isArray(objects) || objects.length === 0) return summary;

    const document = readSealed(meetingId);
    let documentChanged = false;

    for (const candidate of objects) {
      const normalized = normalizeMemoryObject(candidate, { meetingId, noteId, now });
      if (!normalized.ok) {
        summary.rejected.push(normalized.reason);
        continue;
      }
      const object = normalized.object;

      // Compared against the whole library, not just this meeting: the point of
      // consolidation is that a fact restated next month meets the one from
      // last month.
      const existing = database.getMemoryObjectsForConsolidation(object.type, object.subject);
      const decision = decideConsolidation(object, existing);

      if (decision.action === "duplicate") {
        database.touchMemoryObject(decision.target, now);
        summary.duplicates += 1;
        continue;
      }

      const { sealed, indexed } = splitObject(object);
      if (decision.action === "supersede") {
        indexed.supersedes = decision.target;
        database.markMemoryObjectSuperseded(decision.target, object.id, now);
        summary.superseded += 1;
      } else {
        summary.inserted += 1;
      }

      database.insertMemoryObject(indexed);
      document[object.id] = sealed;
      documentChanged = true;
    }

    if (documentChanged) {
      try {
        writeSealed(meetingId, document);
      } catch (error) {
        // The sealed half failed, so the indexed rows point at content that
        // does not exist. Roll them back rather than leave permanent ghosts.
        debugLogger.error("Sealing memory failed; rolling back rows", {
          meetingId,
          error: error.message,
        });
        for (const id of Object.keys(document)) database.deleteMemoryObject(id);
        return { inserted: 0, superseded: 0, duplicates: 0, rejected: ["seal_failed"] };
      }
    }

    return summary;
  }

  function listForNote(noteId) {
    return hydrate(database.getMemoryObjectsByNote(noteId));
  }

  /** Open commitments, soonest due first — a query, never a decrypt-and-scan. */
  function listOpenActions({ subject = "user", limit = 50 } = {}) {
    return hydrate(database.getOpenMemoryActions(subject, limit));
  }

  /** The durable slice pinned into every chat prompt. */
  function listProfileFacts(limit = 40) {
    return hydrate(database.getProfileMemoryObjects(limit));
  }

  return { ingest, listForNote, listOpenActions, listProfileFacts, hydrate };
}

module.exports = { SEALED_FIELDS, createMemoryStore, mintMeetingId, splitObject };
