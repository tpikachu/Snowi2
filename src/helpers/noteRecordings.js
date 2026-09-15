/**
 * Meeting recordings kept with their notes (client direction, 2026-09-15:
 * "each note has the record audio files… users can play back those files").
 *
 * During a meeting main mirrors both tracks raw (meetingAudioMirror.js).
 * After Stop — before the archive pass reads the same files — the microphone
 * and the other side are mixed to one mono MP3, aligned by when each track's
 * first byte arrived, and stored as userData/recordings/<noteId>/<sessionStart>.mp3
 * with a row in note_recordings (noteRecordingsSchema.js). One row per
 * session, so a resumed note lists several. About 30 MB an hour at 64 kbps.
 *
 * The pure pieces — ffmpeg arguments, names, orphan detection — are
 * unit-tested; encodeMeetingRecording spawns the bundled ffmpeg.
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const RECORDINGS_DIR_NAME = "recordings";
const MP3_BITRATE = "64k";

function recordingsDir(userDataPath) {
  return path.join(userDataPath, RECORDINGS_DIR_NAME);
}

/** Stored with forward slashes, resolved against the recordings dir. */
function recordingRelPath(noteId, startedAtMs) {
  return `${noteId}/${startedAtMs}.mp3`;
}

/** The file for a stored path — never outside the recordings directory. */
function recordingAbsolutePath(dir, relPath) {
  const absolute = path.resolve(dir, String(relPath));
  const relative = path.relative(dir, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("recording path escapes the recordings directory");
  }
  return absolute;
}

/** A file name for the save dialog: the note's title and the session's start. */
function recordingDownloadName(title, startedAtMs) {
  const safeTitle = String(title || "Meeting")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const d = new Date(startedAtMs);
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = Number.isNaN(d.getTime())
    ? String(startedAtMs)
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}`;
  return `${safeTitle} ${stamp}.mp3`;
}

/**
 * ffmpeg arguments: raw s16le mono inputs, each delayed by how much later
 * than the earliest it started, mixed without normalization (amix's default
 * halves two inputs, and a silent side would still halve the other), to one
 * mono MP3 at the input rate.
 *
 * @param {{ tracks: Array<{ path: string, sampleRate: number, startedAt?: number | null }>, outputPath: string, bitrate?: string }} input
 */
function buildMixArgs({ tracks, outputPath, bitrate = MP3_BITRATE }) {
  if (!Array.isArray(tracks) || tracks.length === 0) throw new Error("buildMixArgs: no tracks");
  const args = ["-hide_banner", "-nostdin"];
  for (const track of tracks) {
    args.push("-f", "s16le", "-ar", String(track.sampleRate), "-ac", "1", "-i", track.path);
  }
  if (tracks.length === 1) {
    args.push("-map", "0:a");
  } else {
    const starts = tracks.map((track) =>
      Number.isFinite(track.startedAt) ? Number(track.startedAt) : null
    );
    const known = starts.filter((value) => value !== null);
    const base = known.length ? Math.min(...known) : 0;
    const chains = tracks.map((_, index) => {
      const delay = starts[index] === null ? 0 : Math.max(0, Math.round(starts[index] - base));
      return `[${index}:a]adelay=${delay}[a${index}]`;
    });
    const mix = `${tracks.map((_, index) => `[a${index}]`).join("")}amix=inputs=${tracks.length}:duration=longest:normalize=0[out]`;
    args.push("-filter_complex", [...chains, mix].join(";"), "-map", "[out]");
  }
  args.push("-c:a", "libmp3lame", "-b:a", bitrate, "-ac", "1", "-y", outputPath);
  return args;
}

/**
 * Mixes the tracks into `outputPath`. Resolves with the file's size.
 *
 * @param {{ tracks: Array<{ path: string, sampleRate: number, startedAt?: number | null }>, outputPath: string, ffmpegPath?: string | null, spawnFn?: typeof spawn }} input
 */
function encodeMeetingRecording({ tracks, outputPath, ffmpegPath, spawnFn = spawn }) {
  return new Promise((resolve, reject) => {
    const binary = ffmpegPath ?? require("./ffmpegUtils").getFFmpegPath();
    if (!binary) {
      reject(new Error("FFmpeg not found - required to keep the meeting recording"));
      return;
    }
    const args = buildMixArgs({ tracks, outputPath });
    const proc = spawnFn(binary, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stderr = "";
    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
      if (stderr.length > 20_000) stderr = stderr.slice(-10_000);
    });
    proc.on("error", (error) => reject(new Error(`FFmpeg process error: ${error.message}`)));
    proc.on("close", (code) => {
      if (code !== 0) {
        const preview = stderr.slice(-500).trim();
        reject(
          new Error(
            `FFmpeg recording encode exited with code ${code}${preview ? `: ${preview}` : ""}`
          )
        );
        return;
      }
      try {
        resolve({ bytes: fs.statSync(outputPath).size });
      } catch (error) {
        reject(error);
      }
    });
  });
}

const normalizeRel = (value) => String(value).split(path.sep).join("/").replace(/^\.\//, "");

/** Files on disk without a row, and rows without a file. Pure. */
function pickOrphans({ files, rows }) {
  const rowPaths = new Set(rows.map((row) => normalizeRel(row.relPath)));
  const filePaths = new Set(files.map(normalizeRel));
  return {
    filesToDelete: files.filter((file) => !rowPaths.has(normalizeRel(file))),
    rowsToDelete: rows.filter((row) => !filePaths.has(normalizeRel(row.relPath))),
  };
}

/** Every `<noteId>/<file>.mp3` under the recordings dir, as stored paths. */
function listRecordingFiles(dir) {
  const out = [];
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    let files = [];
    try {
      files = fs.readdirSync(path.join(dir, entry.name));
    } catch {
      continue;
    }
    for (const file of files) if (file.endsWith(".mp3")) out.push(`${entry.name}/${file}`);
  }
  return out;
}

/** Removes the file, and the note's folder once it is empty. Missing is fine. */
function unlinkRecording(dir, relPath) {
  const absolute = recordingAbsolutePath(dir, relPath);
  try {
    fs.unlinkSync(absolute);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  try {
    const parent = path.dirname(absolute);
    if (parent !== dir && fs.readdirSync(parent).length === 0) fs.rmdirSync(parent);
  } catch {
    // The folder is shared or already gone; nothing to tidy.
  }
}

/**
 * Deletes files no row points at and reports rows whose file is gone (the
 * caller owns the table). Also removes half-written mirrors nothing will
 * read: a crash between the encode and the row, a note hard-deleted by sync.
 */
function sweepRecordings({ dir, rows }) {
  const { filesToDelete, rowsToDelete } = pickOrphans({ files: listRecordingFiles(dir), rows });
  for (const relPath of filesToDelete) {
    try {
      unlinkRecording(dir, relPath);
    } catch {
      // Best effort: the next launch tries again.
    }
  }
  return { filesToDelete, rowsToDelete };
}

module.exports = {
  RECORDINGS_DIR_NAME,
  recordingsDir,
  recordingRelPath,
  recordingAbsolutePath,
  recordingDownloadName,
  buildMixArgs,
  encodeMeetingRecording,
  pickOrphans,
  listRecordingFiles,
  unlinkRecording,
  sweepRecordings,
};
