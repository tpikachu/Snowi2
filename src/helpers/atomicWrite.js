/**
 * Atomic file replacement (spec §21.5).
 *
 * A meeting checkpoint that is half-written is worse than one that is missing:
 * recovery would read a truncated envelope, fail its auth tag, and report the
 * meeting as corrupt. So content is written to a temporary file **in the same
 * directory** — a rename is only atomic within one filesystem — flushed to the
 * platter, and then renamed over the target.
 *
 * Electron-free so it can be unit-tested directly.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/**
 * @param {string} target  final path; its directory must already exist
 * @param {Buffer|string} data
 * @param {{mode?: number}} [options]  defaults to owner-only (0600)
 */
function atomicWriteFileSync(target, data, { mode = 0o600 } = {}) {
  const directory = path.dirname(target);
  // Random suffix: two writers racing on the same target must not collide on
  // the temporary name and corrupt each other's partial file.
  const temporary = path.join(directory, `.${path.basename(target)}.${crypto.randomUUID()}.tmp`);

  let handle;
  try {
    handle = fs.openSync(temporary, "wx", mode);
    fs.writeFileSync(handle, data);
    // Without the flush the rename can land before the bytes do, leaving a
    // correctly-named empty file after a power loss.
    fs.fsyncSync(handle);
    fs.closeSync(handle);
    handle = undefined;

    fs.renameSync(temporary, target);
  } catch (error) {
    if (handle !== undefined) {
      try {
        fs.closeSync(handle);
      } catch {
        // Already closed or never opened — nothing to salvage.
      }
    }
    try {
      fs.rmSync(temporary, { force: true });
    } catch {
      // Best effort: a stray temp file is harmless next to a failed write.
    }
    throw error;
  }

  // Durably record the rename itself. Not supported on Windows, and not fatal
  // anywhere: the data is already flushed, only the directory entry is at risk.
  try {
    const directoryHandle = fs.openSync(directory, "r");
    try {
      fs.fsyncSync(directoryHandle);
    } finally {
      fs.closeSync(directoryHandle);
    }
  } catch {
    // EISDIR/EPERM/EINVAL depending on platform — ignore.
  }
}

module.exports = { atomicWriteFileSync };
