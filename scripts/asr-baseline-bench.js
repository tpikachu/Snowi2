#!/usr/bin/env node
/**
 * P0 — measure the baseline machine.
 *
 * The T1 tier recommendation rests on an untested assumption: that a 0.6B INT8
 * streaming FastConformer holds real time on a low-end machine. This harness
 * measures that instead of assuming it, for all four candidate models, on
 * whatever machine it is run on.
 *
 * It drives the app's own `ParakeetServerManager` — the same object
 * `transcribeLocalParakeet` calls — rather than reimplementing the transport,
 * so what is measured is the path the product actually takes: the thread
 * pinning, the 15 s offline segmentation and its empty-decode retry, the
 * streaming flush. A reimplementation would measure sherpa-onnx; this measures
 * Snowy. Driving the websocket server directly is a layer too low: the offline
 * decoder refuses a whole meeting in one message, which is exactly why the
 * segmentation above it exists.
 *
 * Two runs per model, because throughput and latency are different questions
 * and one run answers neither:
 *
 *   throughput — blast the whole file as fast as the decoder accepts it.
 *                Gives RTF. Says nothing about caption lag.
 *   paced      — feed at 1x wall clock, the way a real meeting arrives.
 *                Gives caption latency and, more importantly, whether the
 *                decoder keeps up or falls progressively behind.
 *
 * Usage:
 *   node scripts/asr-baseline-bench.js --list
 *   node scripts/asr-baseline-bench.js --download
 *   node scripts/asr-baseline-bench.js --audio meeting.wav [--reference meeting.txt]
 *
 * Any ffmpeg-readable audio works; it is converted to the 16 kHz mono float32
 * the decoders take. A reference transcript is optional — without one the run
 * still reports RTF, latency and peak RSS, and skips WER.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const modelRegistryData = require("../src/models/modelRegistryData.json");
const { REQUIRED_MODEL_FILES, getModelRuntime } = require("../src/helpers/parakeetModelInfo");
const { getModelsDirForService } = require("../src/helpers/modelDirUtils");

const PARAKEET_MODELS = modelRegistryData.parakeetModels || {};
const MODELS_DIR = getModelsDirForService("parakeet");

const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 4;
const BYTES_PER_SECOND = SAMPLE_RATE * BYTES_PER_SAMPLE;

/** Pacing granularity for the 1x run. Smaller than the model's 560ms chunk so
 *  the feed is never the thing that gates an update. */
const PACED_CHUNK_MS = 100;

/** What the app does for a local meeting: buffer this much, then decode it
 *  (LOCAL_MEETING_CHUNK_INTERVAL_MS in ipcHandlers.js). Note this is the
 *  *meeting* interval — dictation's preview path buffers 1.5s — and a meeting
 *  is what P0 is measuring. It sets both the floor on caption latency for an
 *  offline model and the deadline each decode has to finish inside. */
const OFFLINE_MEETING_CHUNK_S = 5.0;

const RSS_SAMPLE_MS = 250;

// ---------------------------------------------------------------- args

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    audio: null,
    reference: null,
    models: null,
    out: null,
    candidates: [],
    candidateRuntime: "offline",
    list: false,
    download: false,
    json: false,
    skipPaced: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--audio" && next) {
      args.audio = next;
      i += 1;
    } else if (arg === "--reference" && next) {
      args.reference = next;
      i += 1;
    } else if (arg === "--models" && next) {
      args.models = next.split(",").map((m) => m.trim()).filter(Boolean);
      i += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      i += 1;
    } else if (arg === "--candidate" && next) {
      args.candidates.push(next);
      i += 1;
    } else if (arg === "--candidate-runtime" && next) {
      args.candidateRuntime = next === "online" ? "online" : "offline";
      i += 1;
    } else if (arg === "--list") {
      args.list = true;
    } else if (arg === "--download") {
      args.download = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--skip-paced") {
      args.skipPaced = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }

  return args;
}

function printUsage() {
  console.log(`P0 baseline ASR benchmark.

Usage:
  node scripts/asr-baseline-bench.js --audio <file> [options]

Options:
  --audio <file>       Meeting audio to measure against. Any ffmpeg-readable format.
  --reference <file>   Hand-corrected transcript, plain text. Enables WER.
  --models <a,b,...>   Restrict to these model names (default: all downloaded).
  --out <file>         Write the full JSON result here.
  --candidate <dir>    Measure a model directory that is not in the registry yet.
                       Repeatable. The directory sits under the models dir and
                       holds the usual encoder/decoder/joiner/tokens files.
  --candidate-runtime  "online" or "offline" (default) for every --candidate.
  --list               Show candidate models and their download state.
  --download           Download every candidate model that is missing (~2.6 GB).
  --skip-paced         Throughput only. Much faster; gives up the latency numbers.
  --json               Emit JSON to stdout instead of the markdown report.
  -h, --help           Show this help.

Recommended audio: ~10 minutes, two speakers, some overlap, some background
noise. Clean single-speaker read speech will report numbers the product will
never see in a real meeting.`);
}

// ---------------------------------------------------------------- machine

function machineProfile() {
  const cpus = os.cpus();
  return {
    cpu: cpus[0]?.model?.trim() || "unknown",
    logicalCores: cpus.length,
    totalMemGb: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
    freeMemGb: Number((os.freemem() / 1024 ** 3).toFixed(1)),
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    node: process.version,
  };
}

/** The app pins ONNX intra-op threads this way (parakeetWsServer._doStart).
 *  Reported because it is the reason core count matters less than clock and
 *  memory bandwidth when comparing two machines. */
function pinnedThreads() {
  return Math.max(1, Math.min(4, Math.floor(os.cpus().length * 0.75)));
}

// ---------------------------------------------------------------- audio

function ffmpegPath() {
  try {
    const resolved = require("ffmpeg-static");
    if (resolved && fs.existsSync(resolved)) return resolved;
  } catch {
    // fall through to PATH
  }
  return "ffmpeg";
}

/**
 * Decode once to 16 kHz mono, and keep both representations the app uses:
 * PCM16 (what a recording is, and what `pcm16ToWav` wraps for the offline
 * decoder) and float32 (what the streaming socket takes). Re-decoding per
 * model would put ffmpeg inside the measurement.
 */
function decodeAudio(filePath) {
  const bin = ffmpegPath();
  const result = spawnSync(
    bin,
    [
      "-hide_banner",
      "-loglevel", "error",
      "-i", filePath,
      "-f", "s16le",
      "-acodec", "pcm_s16le",
      "-ac", "1",
      "-ar", String(SAMPLE_RATE),
      "-",
    ],
    { maxBuffer: 1024 * 1024 * 1024 }
  );

  if (result.error) {
    throw new Error(`ffmpeg failed to run (${bin}): ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = (result.stderr || "").toString().trim().slice(0, 400);
    throw new Error(`ffmpeg could not decode ${filePath}${stderr ? `: ${stderr}` : ""}`);
  }

  const pcm16 = result.stdout;
  if (!pcm16 || pcm16.length < SAMPLE_RATE * 2) {
    throw new Error(`Decoded audio is shorter than one second: ${filePath}`);
  }

  const { pcm16ToWav } = require("../src/utils/audioUtils");

  // The streaming socket takes a Buffer of float32 *bytes* and slices it by
  // byte offset (ONLINE_CHUNK_BYTES in parakeetWsServer), so a Float32Array
  // would be sliced as elements and send a quarter of the audio. Build the
  // bytes directly rather than viewing over ffmpeg's stdout, whose byteOffset
  // carries no alignment guarantee.
  const sampleCount = Math.floor(pcm16.length / 2);
  const float32 = Buffer.alloc(sampleCount * BYTES_PER_SAMPLE);
  for (let i = 0; i < sampleCount; i += 1) {
    float32.writeFloatLE(pcm16.readInt16LE(i * 2) / 32768, i * BYTES_PER_SAMPLE);
  }

  return {
    pcm16,
    float32,
    wav: pcm16ToWav(pcm16, SAMPLE_RATE, 1),
    seconds: sampleCount / SAMPLE_RATE,
  };
}

// ---------------------------------------------------------------- RSS

/**
 * Peak working set of the decoder process, sampled from one long-lived child.
 * Spawning a probe per sample would cost more than it measures.
 *
 * This is the number that transfers between machines most directly: RSS barely
 * moves with core count, so a peak measured on a fast machine is still the peak
 * an 8 GB machine has to find room for next to a browser and a meeting client.
 */
function startRssSampler(pid) {
  let child;
  let peakBytes = 0;

  if (process.platform === "win32") {
    const script =
      `while($true){try{$p=Get-Process -Id ${pid} -ErrorAction Stop;` +
      `Write-Output $p.WorkingSet64}catch{break};` +
      `Start-Sleep -Milliseconds ${RSS_SAMPLE_MS}}`;
    child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { stdio: ["ignore", "pipe", "ignore"], windowsHide: true }
    );
  } else {
    const script =
      `while kill -0 ${pid} 2>/dev/null; do ` +
      `ps -o rss= -p ${pid} 2>/dev/null; sleep ${RSS_SAMPLE_MS / 1000}; done`;
    child = spawn("sh", ["-c", script], { stdio: ["ignore", "pipe", "ignore"] });
  }

  let buffer = "";
  child.stdout.on("data", (data) => {
    buffer += data.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      const value = Number(line.trim());
      if (!Number.isFinite(value) || value <= 0) continue;
      // ps reports kilobytes; PowerShell reports bytes.
      const bytes = process.platform === "win32" ? value : value * 1024;
      if (bytes > peakBytes) peakBytes = bytes;
    }
  });
  child.on("error", () => {});

  return {
    stop() {
      try {
        child.kill();
      } catch {
        // already gone
      }
      return peakBytes;
    },
  };
}

// ---------------------------------------------------------------- WER

/** Comparable between models on the same reference. Not an absolute claim:
 *  no number normalization, so "2026" vs "twenty twenty six" counts as errors
 *  for every model equally. */
function normalizeForWer(text) {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function werWords(text) {
  const normalized = normalizeForWer(text);
  return normalized ? normalized.split(" ") : [];
}

/** Levenshtein over words, two rows rather than a full matrix. */
function wordErrorRate(reference, hypothesis) {
  const ref = werWords(reference);
  const hyp = werWords(hypothesis);
  if (ref.length === 0) return null;

  let prev = new Array(hyp.length + 1);
  let curr = new Array(hyp.length + 1);
  for (let j = 0; j <= hyp.length; j += 1) prev[j] = j;

  for (let i = 1; i <= ref.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= hyp.length; j += 1) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }

  return {
    wer: prev[hyp.length] / ref.length,
    refWords: ref.length,
    hypWords: hyp.length,
  };
}

// ---------------------------------------------------------------- stats

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function summarize(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1],
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------- models

function modelDir(modelName) {
  return path.join(MODELS_DIR, modelName);
}

function isDownloaded(modelName) {
  const dir = modelDir(modelName);
  return REQUIRED_MODEL_FILES.every((file) => fs.existsSync(path.join(dir, file)));
}

/**
 * Register a model directory that is not in the shipped registry, so a
 * candidate can be measured before anyone commits to adding it.
 *
 * The registry object is a required JSON module, so mutating it here is seen
 * by `parakeetModelInfo.getModelRuntime` and by `ParakeetServerManager` — which
 * is the point: the candidate then travels the ordinary code path rather than a
 * special one, and what gets measured is what would ship. It lives in this
 * process only; nothing is written back to disk.
 */
function registerCandidates(names, runtime) {
  for (const name of names) {
    if (PARAKEET_MODELS[name]) {
      throw new Error(`--candidate "${name}" is already in the registry; use --models instead`);
    }
    if (!fs.existsSync(path.join(MODELS_DIR, name))) {
      throw new Error(`--candidate "${name}" not found in ${MODELS_DIR}`);
    }
    PARAKEET_MODELS[name] = {
      name: `${name} (candidate)`,
      size: "—",
      language: "unknown",
      runtime,
    };
  }
}

function candidateModels() {
  return Object.keys(PARAKEET_MODELS).map((name) => ({
    name,
    runtime: getModelRuntime(name),
    label: PARAKEET_MODELS[name].name,
    size: PARAKEET_MODELS[name].size,
    language: PARAKEET_MODELS[name].language,
    downloaded: isDownloaded(name),
  }));
}

function hasCurl() {
  const probe = spawnSync("curl", ["--version"], { stdio: "ignore" });
  return !probe.error && probe.status === 0;
}

/**
 * These archives are 630–680 MB each. The shared `downloadFile` restarts from
 * zero on a transient error and gives up after three tries, which on a flaky
 * connection means it can spend a long time never finishing. curl resumes from
 * where it stopped, so prefer it and keep `downloadFile` as the fallback.
 */
async function fetchArchive(url, dest) {
  if (hasCurl()) {
    const result = spawnSync(
      "curl",
      [
        "-L",
        "--retry", "10",
        "--retry-all-errors",
        "--retry-delay", "3",
        "-C", "-",
        "--connect-timeout", "20",
        "-#",
        "-o", dest,
        url,
      ],
      { stdio: ["ignore", "inherit", "inherit"] }
    );
    if (!result.error && result.status === 0) return;
    console.log("  curl failed; falling back to the bundled downloader");
  }
  const { downloadFile } = require("./lib/download-utils");
  fs.rmSync(dest, { force: true });
  await downloadFile(url, dest);
}

async function downloadMissing(models) {
  const { extractArchive, cleanupFiles } = require("./lib/download-utils");
  fs.mkdirSync(MODELS_DIR, { recursive: true });

  for (const model of models) {
    if (model.downloaded) {
      console.log(`✓ ${model.name} already present`);
      continue;
    }
    const config = PARAKEET_MODELS[model.name];
    const archive = path.join(MODELS_DIR, `${model.name}.tar.bz2`);
    const staging = path.join(MODELS_DIR, `temp-extract-${model.name}`);

    console.log(`↓ ${model.name} (${config.size})`);
    await fetchArchive(config.downloadUrl, archive);
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true });
    await extractArchive(archive, staging);

    // The tarball carries its own top-level directory; the server wants the
    // model files directly under <models>/<name>.
    const extracted = path.join(staging, config.extractDir);
    const source = fs.existsSync(extracted) ? extracted : staging;
    const target = modelDir(model.name);
    fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(source, target);

    fs.rmSync(staging, { recursive: true, force: true });
    cleanupFiles([archive]);
    console.log(`✓ ${model.name}`);
  }
}

// ---------------------------------------------------------------- runs

/**
 * Throughput. Hand the decoder everything at once and see how fast it comes
 * back. RTF < 1 means the model can in principle keep up with live audio; it
 * does not mean captions will feel live, which is what the paced run is for.
 */
async function runThroughput(manager, model, audio) {
  const started = Date.now();
  const result = await manager.transcribe(audio.wav, { modelName: model.name });
  const elapsedMs = Date.now() - started;
  return {
    elapsedMs,
    rtf: elapsedMs / 1000 / audio.seconds,
    text: result.text || "",
    truncated: Boolean(result.truncated),
  };
}

/**
 * Paced, online models. Audio arrives at 1x, the way a meeting does.
 *
 * The number that decides T1 is `realTimeOvershootMs`: total wall clock minus
 * audio duration. A decoder that keeps up finishes about when the audio does.
 * One that cannot falls further behind every chunk, and the overshoot is the
 * backlog it never worked off — which the user experiences as captions
 * drifting further from the speaker as the meeting goes on.
 */
async function runPacedOnline(manager, audio) {
  const audioSeconds = audio.seconds;
  const updateGaps = [];
  let firstPartialMs = null;
  let lastUpdateAt = null;
  let updates = 0;

  const started = Date.now();
  const stream = manager.createOnlineStream({
    onUpdate: () => {
      const now = Date.now();
      updates += 1;
      if (firstPartialMs === null) firstPartialMs = now - started;
      if (lastUpdateAt !== null) updateGaps.push(now - lastUpdateAt);
      lastUpdateAt = now;
    },
  });

  const samples = audio.float32;
  const chunkBytes = Math.floor((PACED_CHUNK_MS / 1000) * BYTES_PER_SECOND);
  let offset = 0;
  let chunkIndex = 0;

  while (offset < samples.length) {
    stream.sendFloat32(samples.subarray(offset, offset + chunkBytes));
    offset += chunkBytes;
    chunkIndex += 1;

    // Sleep to the schedule, not by a fixed amount: a fixed sleep accumulates
    // drift and would slowly turn a 1x feed into a slower-than-real-time one,
    // which flatters a decoder that cannot keep up.
    const dueAt = started + chunkIndex * PACED_CHUNK_MS;
    const wait = dueAt - Date.now();
    if (wait > 0) await sleep(wait);
  }

  const fedAt = Date.now();
  const { text, truncated } = await stream.finish({
    idleTimeoutMs: Math.max(10000, audioSeconds * 500),
  });
  const finishedAt = Date.now();

  return {
    firstPartialMs,
    updates,
    updateGapMs: summarize(updateGaps),
    tailFlushMs: finishedAt - fedAt,
    realTimeOvershootMs: finishedAt - started - audioSeconds * 1000,
    text: text || "",
    truncated: Boolean(truncated),
  };
}

/**
 * Paced, offline models. These have no partials, so the app buffers 5 s of
 * meeting audio and decodes each buffer whole. The comparable latency is
 * therefore the decode time of one buffer, and the "keeps up" test is whether
 * that decode finishes inside the 5 s before the next buffer is due — miss it
 * and the backlog compounds for the rest of the meeting.
 *
 * Worth reading alongside the streaming numbers rather than against them: even
 * a decode that comfortably keeps up leaves an offline model showing captions
 * a full buffer behind the speaker, which is a product difference, not a
 * performance one.
 */
async function runPacedOffline(manager, model, audio) {
  const { pcm16ToWav } = require("../src/utils/audioUtils");
  const audioSeconds = audio.seconds;
  // PCM16 bytes, because that is what the meeting path buffers and wraps.
  const chunkBytes = Math.floor(OFFLINE_MEETING_CHUNK_S * SAMPLE_RATE * 2);
  const decodeTimes = [];
  const pieces = [];
  let overruns = 0;

  for (let offset = 0; offset < audio.pcm16.length; offset += chunkBytes) {
    const chunk = pcm16ToWav(audio.pcm16.subarray(offset, offset + chunkBytes), SAMPLE_RATE, 1);
    const chunkStarted = Date.now();
    const result = await manager.transcribe(chunk, { modelName: model.name });
    const elapsed = Date.now() - chunkStarted;
    decodeTimes.push(elapsed);
    if (elapsed > OFFLINE_MEETING_CHUNK_S * 1000) overruns += 1;
    if (result.text) pieces.push(result.text.trim());
  }

  // Chunks are decoded back to back rather than on a wall-clock schedule:
  // pacing them would just insert sleeps and make total time equal the audio
  // duration by construction. What matters is whether each decode fits in the
  // 5 s before the next buffer is due, which is `overruns`, and how much of
  // real time the decoder is busy for, which is the duty cycle. A duty cycle
  // near 1.0 keeps up only in the sense that a full disk still boots.
  const busyMs = decodeTimes.reduce((sum, value) => sum + value, 0);

  return {
    chunkSeconds: OFFLINE_MEETING_CHUNK_S,
    chunks: decodeTimes.length,
    decodeMs: summarize(decodeTimes),
    overruns,
    dutyCycle: busyMs / (audioSeconds * 1000),
    // Chunk-at-a-time decoding cuts words at every boundary, so this text is
    // for eyeballing the preview quality — never for WER, which uses the
    // throughput run's whole-file decode.
    text: pieces.join(" "),
  };
}

async function benchmarkModel(model, audio, options) {
  const ParakeetServerManager = require("../src/helpers/parakeetServer");
  const manager = new ParakeetServerManager();

  const record = { model: model.name, runtime: model.runtime, label: model.label };
  let sampler = null;

  try {
    const loadStarted = Date.now();

    // Attach the sampler as soon as the child exists rather than after startup
    // resolves: loading ~600 MB of weights plus a warm-up inference is where a
    // transient peak would appear, and that peak is exactly what an 8 GB
    // machine cares about.
    const startPromise = manager.startServer(model.name);
    let watching = true;
    const watchForPid = (async () => {
      while (watching && !sampler) {
        if (manager.wsServer?.process?.pid) {
          sampler = startRssSampler(manager.wsServer.process.pid);
          return;
        }
        await sleep(25);
      }
    })();

    let startResult;
    try {
      startResult = await startPromise;
    } finally {
      watching = false;
      await watchForPid;
    }
    if (!startResult?.success) {
      throw new Error(startResult?.reason || "server failed to start");
    }
    record.loadMs = Date.now() - loadStarted;

    record.throughput = await runThroughput(manager, model, audio);

    if (!options.skipPaced) {
      record.paced =
        model.runtime === "online"
          ? await runPacedOnline(manager, audio)
          : await runPacedOffline(manager, model, audio);
    }

    if (options.reference) {
      record.accuracy = wordErrorRate(options.reference, record.throughput.text);
    }
  } catch (error) {
    record.error = error.message;
  } finally {
    if (sampler) record.peakRssBytes = sampler.stop();
    await manager.stopServer().catch(() => {});
  }

  return record;
}

// ---------------------------------------------------------------- report

const gb = (bytes) => (bytes ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : "—");
const ms = (value) =>
  value === null || value === undefined ? "—" : value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
const pct = (value) => (value === null || value === undefined ? "—" : `${(value * 100).toFixed(1)}%`);

function renderReport(result) {
  const lines = [];
  const { machine, audio, results } = result;

  lines.push("## P0 — baseline ASR measurement\n");
  lines.push(
    `**Machine** — ${machine.cpu}, ${machine.logicalCores} logical cores, ` +
      `${machine.totalMemGb} GB RAM, ${machine.platform} ${machine.release} ${machine.arch}`
  );
  lines.push(
    `**Decoder threads** — pinned to ${machine.pinnedThreads} by the app ` +
      `(min(4, cores × 0.75)), so core count above 6 does not change this run.`
  );
  lines.push(
    `**Audio** — ${path.basename(audio.file)}, ${(audio.seconds / 60).toFixed(1)} min` +
      (audio.hasReference ? ", reference transcript supplied" : ", no reference (WER skipped)")
  );
  lines.push("");

  lines.push("### Throughput and footprint\n");
  lines.push("| model | runtime | load | RTF | peak RSS | WER |");
  lines.push("|---|---|---|---|---|---|");
  for (const r of results) {
    if (r.error) {
      lines.push(`| ${r.model} | ${r.runtime} | — | — | — | failed: ${r.error} |`);
      continue;
    }
    lines.push(
      `| ${r.model} | ${r.runtime} | ${ms(r.loadMs)} | ` +
        `${r.throughput.rtf.toFixed(3)} | ${gb(r.peakRssBytes)} | ` +
        `${r.accuracy ? pct(r.accuracy.wer) : "—"} |`
    );
  }
  lines.push("");
  lines.push("RTF is decode time ÷ audio duration with the file blasted at the decoder. Lower is faster; below 1.0 is the bare minimum for live use.");
  lines.push("");

  const paced = results.filter((r) => r.paced && !r.error);
  if (paced.length > 0) {
    const online = paced.filter((r) => r.runtime === "online");
    const offline = paced.filter((r) => r.runtime !== "online");

    if (online.length > 0) {
      lines.push("### Streaming models, fed at 1× — what a live meeting does\n");
      lines.push("| model | first partial | update p50 / p95 | tail flush | overshoot | keeps up |");
      lines.push("|---|---|---|---|---|---|");
      for (const r of online) {
        const p = r.paced;
        const keepsUp = p.realTimeOvershootMs < 2000;
        lines.push(
          `| ${r.model} | ${ms(p.firstPartialMs)} | ` +
            `${ms(p.updateGapMs?.p50)} / ${ms(p.updateGapMs?.p95)} | ` +
            `${ms(p.tailFlushMs)} | ${ms(p.realTimeOvershootMs)} | ${keepsUp ? "yes" : "**no**"} |`
        );
      }
      lines.push("");
      lines.push(
        "Overshoot is wall clock minus audio duration with the audio fed in real time. A decoder that keeps up " +
          "finishes when the audio does; overshoot is backlog, which the user sees as captions drifting further " +
          "behind the speaker as the meeting runs on."
      );
      lines.push("");
    }

    if (offline.length > 0) {
      lines.push(`### Offline models, decoded in ${offline[0].paced.chunkSeconds}s buffers\n`);
      lines.push("| model | decode p50 / p95 | duty cycle | overruns | keeps up |");
      lines.push("|---|---|---|---|---|");
      for (const r of offline) {
        const p = r.paced;
        lines.push(
          `| ${r.model} | ${ms(p.decodeMs?.p50)} / ${ms(p.decodeMs?.p95)} | ` +
            `${p.dutyCycle.toFixed(2)} | ${p.overruns} / ${p.chunks} | ` +
            `${p.overruns === 0 ? "yes" : "**no**"} |`
        );
      }
      lines.push("");
      lines.push(
        `Duty cycle is the fraction of real time the decoder is busy; an overrun is a buffer that took longer ` +
          `than the ${offline[0].paced.chunkSeconds}s before the next one was due. Note that even a model with ` +
          `plenty of headroom shows captions a full buffer behind the speaker — that is a product difference ` +
          `from streaming, not a performance one.`
      );
      lines.push("");
    }
  }

  lines.push("### What transfers to another machine\n");
  lines.push("- **Peak RSS** transfers almost directly — it barely moves with core count.");
  lines.push("- **RTF and latency** do not. They scale with clock and memory bandwidth, so a result here bounds a slower machine but does not predict it.");
  lines.push("- **Thread count** is not a variable between this machine and a 6-core baseline: the app pins ≤ 4 either way.");

  return lines.join("\n");
}

// ---------------------------------------------------------------- main

async function main() {
  const args = parseArgs();

  if (args.help) {
    printUsage();
    return;
  }

  if (args.candidates.length > 0) {
    registerCandidates(args.candidates, args.candidateRuntime);
  }

  const models = candidateModels();

  if (args.list) {
    console.log(`Models directory: ${MODELS_DIR}\n`);
    for (const model of models) {
      console.log(
        `${model.downloaded ? "✓" : "·"} ${model.name}` +
          `\n    ${model.label} — ${model.runtime}, ${model.size}, ${model.language}`
      );
    }
    const missing = models.filter((m) => !m.downloaded).length;
    if (missing > 0) {
      console.log(`\n${missing} not downloaded. Run with --download to fetch them.`);
    }
    return;
  }

  if (args.download) {
    await downloadMissing(models);
    return;
  }

  if (!args.audio) {
    printUsage();
    console.error("\nError: --audio is required.");
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(args.audio)) {
    console.error(`Error: audio file not found: ${args.audio}`);
    process.exitCode = 1;
    return;
  }

  let selected = models.filter((m) => m.downloaded);
  if (args.models) {
    const unknown = args.models.filter((name) => !PARAKEET_MODELS[name]);
    if (unknown.length > 0) {
      console.error(`Error: unknown model(s): ${unknown.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    selected = models.filter((m) => args.models.includes(m.name));
    const notDownloaded = selected.filter((m) => !m.downloaded);
    if (notDownloaded.length > 0) {
      console.error(
        `Error: not downloaded: ${notDownloaded.map((m) => m.name).join(", ")}. Run --download first.`
      );
      process.exitCode = 1;
      return;
    }
  }

  if (selected.length === 0) {
    console.error("Error: no models downloaded. Run with --download first.");
    process.exitCode = 1;
    return;
  }

  const reference = args.reference ? fs.readFileSync(args.reference, "utf8") : null;
  if (args.reference && !reference?.trim()) {
    console.error(`Error: reference transcript is empty: ${args.reference}`);
    process.exitCode = 1;
    return;
  }

  if (!args.json) console.error(`Decoding ${args.audio} …`);
  const audio = decodeAudio(args.audio);
  const audioSeconds = audio.seconds;

  const results = [];
  for (const model of selected) {
    if (!args.json) console.error(`Running ${model.name} (${model.runtime}) …`);
    results.push(await benchmarkModel(model, audio, { reference, skipPaced: args.skipPaced }));
  }

  const result = {
    machine: { ...machineProfile(), pinnedThreads: pinnedThreads() },
    audio: {
      file: path.resolve(args.audio),
      seconds: Number(audioSeconds.toFixed(2)),
      hasReference: Boolean(reference),
    },
    results,
  };

  if (args.out) {
    fs.writeFileSync(args.out, JSON.stringify(result, null, 2));
    if (!args.json) console.error(`Wrote ${args.out}`);
  }

  console.log(args.json ? JSON.stringify(result, null, 2) : renderReport(result));

  if (results.some((r) => r.error)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
