#!/usr/bin/env node
/**
 * Build a two-speaker audio fixture and its reference transcript, so
 * `asr-baseline-bench.js` has something to measure on any machine without
 * shipping a large binary in the repo.
 *
 * This is synthesized speech. It has no overlap, no crosstalk, no room tone
 * and no accents, which makes it easier than any real recording — it exercises
 * meeting *vocabulary* and validates the harness end to end, and it produces
 * honest memory and throughput numbers, but the word error rate it reports is
 * a floor rather than a product figure. Real audio still has to be measured
 * before a tier decision is signed off.
 *
 * Usage:
 *   node scripts/make-bench-audio.js --out bench.wav
 *   node scripts/make-bench-audio.js --fixture product-planning --out bench.wav
 *
 * Writes <out> and <out>.txt (the reference transcript).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const FIXTURE_DIR = path.join(__dirname, "asr-bench-fixtures");

function parseArgs(argv = process.argv.slice(2)) {
  const args = { fixture: "product-planning", out: null, repeat: 1, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--fixture" && next) {
      args.fixture = next;
      i += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      i += 1;
    } else if (arg === "--repeat" && next) {
      args.repeat = Math.max(1, parseInt(next, 10) || 1);
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  return args;
}

function ffmpegPath() {
  try {
    const resolved = require("ffmpeg-static");
    if (resolved && fs.existsSync(resolved)) return resolved;
  } catch {
    // fall through
  }
  return "ffmpeg";
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { maxBuffer: 1 << 28, ...options });
  if (result.error) throw new Error(`${command} failed: ${result.error.message}`);
  if (result.status !== 0) {
    const stderr = (result.stderr || "").toString().trim().slice(0, 400);
    throw new Error(`${command} exited ${result.status}${stderr ? `: ${stderr}` : ""}`);
  }
  return result;
}

/**
 * Synthesize one line to a WAV file, using whatever the platform ships.
 * Two distinct voices matter more than voice quality here: a single voice
 * would let a model use speaker consistency as a crutch that a real two-person
 * meeting never gives it.
 */
function synthesize(text, gender, outPath) {
  if (process.platform === "win32") {
    // System.Speech is present on every Windows install; SelectVoiceByHints
    // falls back gracefully when only one voice of that gender exists.
    const escaped = text.replace(/'/g, "''");
    const script =
      `Add-Type -AssemblyName System.Speech;` +
      `$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;` +
      `$s.SelectVoiceByHints('${gender === "female" ? "Female" : "Male"}');` +
      `$s.Rate = 1;` +
      `$s.SetOutputToWaveFile('${outPath.replace(/'/g, "''")}');` +
      `$s.Speak('${escaped}');` +
      `$s.Dispose();`;
    run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      windowsHide: true,
    });
    return;
  }

  if (process.platform === "darwin") {
    const voice = gender === "female" ? "Samantha" : "Alex";
    const aiff = `${outPath}.aiff`;
    run("say", ["-v", voice, "-o", aiff, text]);
    run(ffmpegPath(), ["-hide_banner", "-loglevel", "error", "-y", "-i", aiff, outPath]);
    fs.rmSync(aiff, { force: true });
    return;
  }

  // espeak-ng variants: +f3 / +m3 are its female and male voice modifiers.
  const voice = gender === "female" ? "en+f3" : "en+m3";
  run("espeak-ng", ["-v", voice, "-s", "150", "-w", outPath, text]);
}

function checkTtsAvailable() {
  if (process.platform === "win32" || process.platform === "darwin") return null;
  const probe = spawnSync("espeak-ng", ["--version"], { stdio: "ignore" });
  if (probe.error) {
    return "espeak-ng not found. Install it (apt install espeak-ng) or supply your own audio with --audio.";
  }
  return null;
}

function main() {
  const args = parseArgs();

  if (args.help) {
    console.log(`Build a two-speaker benchmark audio fixture.

Usage:
  node scripts/make-bench-audio.js [--fixture <name>] [--repeat <n>] --out <file.wav>

Options:
  --fixture <name>   Fixture in scripts/asr-bench-fixtures (default: product-planning)
  --repeat <n>       Concatenate the dialogue n times, to reach a longer duration
  --out <file>       Output WAV. The reference transcript is written to <file>.txt
  -h, --help         Show this help

The result is synthesized speech: no overlap, no noise, no accents. Good enough
to validate the harness and to measure memory and throughput honestly; not a
substitute for a real recording when judging accuracy.`);
    return;
  }

  if (!args.out) {
    console.error("Error: --out is required.");
    process.exitCode = 1;
    return;
  }

  const ttsProblem = checkTtsAvailable();
  if (ttsProblem) {
    console.error(`Error: ${ttsProblem}`);
    process.exitCode = 1;
    return;
  }

  const fixturePath = path.join(FIXTURE_DIR, `${args.fixture}.json`);
  if (!fs.existsSync(fixturePath)) {
    console.error(`Error: fixture not found: ${fixturePath}`);
    process.exitCode = 1;
    return;
  }
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "snowy-bench-"));
  const partPaths = [];

  try {
    let index = 0;
    for (let pass = 0; pass < args.repeat; pass += 1) {
      for (const [speakerId, text] of fixture.lines) {
        const speaker = fixture.speakers[speakerId];
        const partPath = path.join(workDir, `part-${String(index).padStart(4, "0")}.wav`);
        synthesize(text, speaker?.gender || "male", partPath);
        partPaths.push(partPath);
        index += 1;
        if (index % 10 === 0) process.stderr.write(`  ${index} lines…\r`);
      }
    }
    process.stderr.write(`  ${index} lines synthesized\n`);

    // Concatenate through a list file: the parts are all the same codec, so
    // the concat demuxer copies rather than re-encoding, then one resample
    // pass produces the 16 kHz mono the decoders want.
    const listPath = path.join(workDir, "parts.txt");
    fs.writeFileSync(
      listPath,
      partPaths.map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n")
    );

    run(ffmpegPath(), [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "concat", "-safe", "0", "-i", listPath,
      "-ac", "1", "-ar", "16000",
      args.out,
    ]);

    const reference = [];
    for (let pass = 0; pass < args.repeat; pass += 1) {
      for (const [, text] of fixture.lines) reference.push(text);
    }
    fs.writeFileSync(`${args.out}.txt`, `${reference.join(" ")}\n`);

    const bytes = fs.statSync(args.out).size;
    // 16 kHz mono 16-bit PCM plus a small header.
    const seconds = (bytes - 44) / (16000 * 2);
    console.log(`Wrote ${args.out} — ${(seconds / 60).toFixed(1)} min`);
    console.log(`Wrote ${args.out}.txt — ${reference.join(" ").split(/\s+/).length} words`);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
