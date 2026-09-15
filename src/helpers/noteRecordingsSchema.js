/**
 * The table behind the recordings kept with meeting notes — one row per
 * recorded session, pointing at an MP3 under userData/recordings (see
 * noteRecordings.js). Kept apart from database.js so the DDL is unit-tested
 * with node:sqlite, without the native binding.
 *
 * A trigger rather than ON DELETE CASCADE, for the same reason as
 * meeting_segments: notes are deleted from a dozen places and some of them
 * turn foreign keys off. The trigger cannot unlink files — ipcHandlers does
 * that on the paths it owns, and sweeps the rest at launch.
 */
const NOTE_RECORDINGS_DDL = [
  `CREATE TABLE IF NOT EXISTS note_recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER NOT NULL,
    session_id TEXT,
    rel_path TEXT NOT NULL UNIQUE,
    started_at_ms INTEGER NOT NULL,
    ended_at_ms INTEGER,
    duration_ms INTEGER,
    bytes INTEGER,
    codec TEXT NOT NULL DEFAULT 'mp3',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS idx_note_recordings_note ON note_recordings(note_id, started_at_ms)",
  `CREATE TRIGGER IF NOT EXISTS note_recordings_delete AFTER DELETE ON notes BEGIN
    DELETE FROM note_recordings WHERE note_id = old.id;
  END`,
];

module.exports = { NOTE_RECORDINGS_DDL };
