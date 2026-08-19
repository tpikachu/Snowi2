#!/usr/bin/env node
/**
 * Resets the data `npm run dev` writes, so the next launch behaves like a fresh
 * install: no notes, no settings, no onboarding flag, no stored keys.
 *
 * Dev runs against an isolated userData directory (`Snowi-<channel>`, see
 * `configureChannelUserDataPath` in main.js), which is what makes this safe —
 * a packaged Snowi keeps its own `Snowi` directory and is never touched. The
 * script refuses to run against that directory even if asked.
 *
 * Two things have to go together or search breaks: the SQLite database in
 * userData and the Qdrant vectors derived from it. Clearing only one leaves
 * hits pointing at notes that no longer exist.
 *
 * Downloaded binaries and models (whisper, embeddings, diarization) are *not*
 * touched. They are gigabytes, they are not state, and re-fetching them turns a
 * two-second reset into a long one.
 *
 * By default the directories are moved aside with a timestamp rather than
 * deleted, so a reset done by mistake is recoverable. `--purge` deletes them,
 * and also clears any backups this script made earlier.
 *
 *   node scripts/reset-dev-data.js [--purge] [--channel=development] [--yes]
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");

const BACKUP_SUFFIX = ".reset-backup-";

function parseArgs(argv) {
  const args = { purge: false, channel: "development", yes: false };
  for (const arg of argv.slice(2)) {
    if (arg === "--purge") args.purge = true;
    else if (arg === "--yes" || arg === "-y") args.yes = true;
    else if (arg.startsWith("--channel=")) args.channel = arg.slice("--channel=".length).trim();
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return args;
}

/** Mirrors Electron's `app.getPath("appData")` per platform. */
function appDataDir() {
  if (process.platform === "win32") {
    return process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support");
  }
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

function dirSize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) total += dirSize(full);
      else if (entry.isFile()) total += fs.statSync(full).size;
    } catch {
      // Locked or vanished mid-walk; the size is advisory, so skip it.
    }
  }
  return total;
}

async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(`${question} [y/N] `, resolve));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

function removeExistingBackups(target) {
  const parent = path.dirname(target);
  const prefix = `${path.basename(target)}${BACKUP_SUFFIX}`;
  if (!fs.existsSync(parent)) return 0;
  let removed = 0;
  for (const name of fs.readdirSync(parent)) {
    if (!name.startsWith(prefix)) continue;
    fs.rmSync(path.join(parent, name), { recursive: true, force: true });
    removed += 1;
  }
  return removed;
}

function clearTarget(target, purge, stamp) {
  if (purge) {
    fs.rmSync(target, { recursive: true, force: true });
    const backups = removeExistingBackups(target);
    return { action: "deleted", backups };
  }
  const backup = `${target}${BACKUP_SUFFIX}${stamp}`;
  fs.renameSync(target, backup);
  return { action: "moved", backup };
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.channel.toLowerCase() === "production" || !args.channel) {
    console.error(
      "Refusing to reset the production channel — that is the data of an installed Snowi,\n" +
        "not of `npm run dev`. Uninstall the app or clear it by hand if that is really what you want."
    );
    process.exit(1);
  }

  // Must match `configureChannelUserDataPath()` in main.js.
  const userData = path.join(appDataDir(), `Snowi-${args.channel}`);
  // Must match STORAGE_DIR in src/helpers/qdrantManager.js.
  const qdrantData = path.join(os.homedir(), ".cache", "snowi", "qdrant-data-dev");

  const targets = [
    { label: `userData (${args.channel})`, dir: userData },
    { label: "Qdrant vectors (dev)", dir: qdrantData },
  ].filter((target) => fs.existsSync(target.dir));

  if (targets.length === 0) {
    console.log("Nothing to reset — dev data directories do not exist yet.");
    return;
  }

  console.log(args.purge ? "Will delete:" : "Will move aside:");
  for (const target of targets) {
    console.log(`  ${target.label}`);
    console.log(`    ${target.dir}  (${formatBytes(dirSize(target.dir))})`);
  }
  console.log(
    "\nThis clears dev notes, settings, onboarding state and stored API keys.\n" +
      "Downloaded models and binaries are left alone."
  );
  if (fs.existsSync(path.join(userData, "lockfile"))) {
    console.log("\nQuit the dev app first if it is running, or it will write the files back.");
  }

  if (!args.yes && !(await confirm("\nProceed?"))) {
    console.log("Cancelled.");
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let failed = false;
  for (const target of targets) {
    try {
      const result = clearTarget(target.dir, args.purge, stamp);
      if (result.action === "deleted") {
        console.log(
          `Deleted ${target.label}` +
            (result.backups ? ` (and ${result.backups} earlier backup(s))` : "")
        );
      } else {
        console.log(`Moved ${target.label} to ${path.basename(result.backup)}`);
      }
    } catch (error) {
      failed = true;
      console.error(`Could not reset ${target.label}: ${error.message}`);
      if (error.code === "EBUSY" || error.code === "EPERM") {
        console.error("  The app is probably still running — quit it and try again.");
      }
    }
  }

  if (failed) process.exit(1);
  console.log("\nDone. The next `npm run dev` starts from onboarding.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
