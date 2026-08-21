/**
 * Which transcription models a machine should run.
 *
 * Pure: takes a capability snapshot (see helpers/capabilityProbe.js) and
 * returns a tier plus the models for it. Everything here is a decision, not a
 * measurement, so it is unit-testable without touching hardware.
 *
 * The thresholds come from measurement, not intuition — scripts/asr-baseline-bench.js
 * on an i9-10900K at the four threads the app actually pins:
 *
 *   streaming (nemotron-*-0.6b @560ms)   RTF 0.25   peak RSS 0.76 GB
 *   offline   (parakeet-*-0.6b)          RTF 0.085  peak RSS 1.31 GB
 *
 * Scaled to an i5-9400 by the PassMark single-thread ratio (2413 vs 3106, plus
 * slower memory and a smaller L3 — call it 1.4x), streaming lands near RTF 0.35
 * and offline near 0.12. Both hold comfortably.
 *
 * The conclusion that shapes this file: **compute is not the binding
 * constraint — memory and download size are.** A 0.6B INT8 encoder is ~630 MB
 * on disk and needs roughly a gigabyte resident. That is what separates the
 * tiers, not clock speed. Note also that the app pins ONNX threads to
 * min(4, cores * 0.75), so core counts above 6 buy nothing here.
 */

/** Measured peak RSS of each runtime, from scripts/asr-baseline-bench.js. */
const STREAMING_RESIDENT_GB = 0.76;
const OFFLINE_RESIDENT_GB = 1.31;

/**
 * Total-RAM thresholds, not "does the model fit in what's left".
 *
 * The arithmetic version of this — total minus a reserve, compared against
 * resident size — reads as more principled and gives the wrong answer: 1.31 GB
 * fits in an 8 GB machine's spare room by any sum you care to write, and yet
 * an 8 GB laptop running a browser and a video call is exactly where a second
 * gigabyte-resident model hurts. What actually separates the tiers is how much
 * slack the machine has once the things being transcribed are open, and that is
 * a property of total RAM.
 *
 * So: measurement sets where the thresholds go, and total RAM is what gets
 * compared. Streaming at 0.76 GB is affordable on a small machine. The offline
 * archive at 1.31 GB, plus a second ~630 MB download, wants real slack.
 */
const MIN_RAM_STREAMING_GB = 6;
const MIN_RAM_ARCHIVE_GB = 12;

/** One 0.6B INT8 model, extracted. The archive is smaller; this is what lands. */
const MODEL_DISK_GB = 0.63;
const WHISPER_BASE_DISK_GB = 0.15;

/** sherpa-onnx INT8 kernels assume AVX2; without it a 0.6B model is not viable. */
const MIN_CORES_FOR_STREAMING = 4;

const MODELS = {
  streamingEn: { name: "nemotron-speech-streaming-en-0.6b", runtime: "online", diskGb: 0.63 },
  streamingMulti: { name: "nemotron-3.5-asr-streaming-0.6b", runtime: "online", diskGb: 0.65 },
  archiveEn: { name: "parakeet-unified-en-0.6b", runtime: "offline", diskGb: 0.63 },
  archiveMulti: { name: "parakeet-tdt-0.6b-v3", runtime: "offline", diskGb: 0.68 },
  whisperBase: { name: "base", runtime: "whisper", diskGb: WHISPER_BASE_DISK_GB },
  whisperTurbo: { name: "turbo", runtime: "whisper", diskGb: 1.6 },
};

/**
 * `parakeet-unified-en-0.6b` has the best meeting accuracy of any candidate
 * (AMI 10.14%) and ships a streaming build too, which looked like it would
 * collapse live and archive into one model. Measured at RTF 3.167 — 3.2x slower
 * than real time on an i9, 12.7x the nemotron streaming model. sherpa-onnx
 * publishes the streaming tarballs from a CI export but does not list the model
 * as a supported online transducer. Offline only until that changes.
 */
const UNIFIED_EN_STREAMING_IS_VIABLE = false;

function pickModels(language) {
  const multilingual = language === "multilingual";
  return {
    live: multilingual ? MODELS.streamingMulti : MODELS.streamingEn,
    archive: multilingual ? MODELS.archiveMulti : MODELS.archiveEn,
  };
}

/**
 * Total rather than free: free memory on a freshly booted machine says nothing
 * about what will be free once a browser and a meeting client are open, and
 * picking a model off a transient number gives two identical machines
 * different answers on different days.
 */
function totalMemoryGb(capability) {
  const total = Number(capability?.totalMemGb);
  return Number.isFinite(total) ? total : 0;
}

/**
 * The tiers, in priority order. The first whose `when` matches wins, so the
 * more specific hardware is listed before the more general.
 */
const TIERS = [
  {
    id: "T0",
    label: "constrained",
    when: (c) =>
      !c.hasAvx2 ||
      (c.physicalCores ?? 0) < MIN_CORES_FOR_STREAMING ||
      totalMemoryGb(c) < MIN_RAM_STREAMING_GB,
    // Not true streaming: whisper.cpp has no incremental decode here, so the
    // app buffers and decodes. Say so in the UI rather than implying live
    // captions this machine cannot produce.
    select: () => ({
      live: MODELS.whisperBase,
      archive: null,
      streaming: false,
    }),
  },
  {
    id: "T5",
    label: "discrete-gpu",
    when: (c) =>
      Boolean(c.gpu?.cudaCapable) &&
      (c.gpu?.vramGb ?? 0) >= 6 &&
      totalMemoryGb(c) >= MIN_RAM_ARCHIVE_GB,
    // Live stays on CPU deliberately: streaming latency is chunk cadence, not
    // compute, and measured RTF 0.25 already has 4x headroom. The GPU is worth
    // spending on the archive pass, where accuracy is the whole point.
    select: (c, language) => ({
      live: pickModels(language).live,
      archive: MODELS.whisperTurbo,
      streaming: true,
    }),
  },
  {
    id: "T4",
    label: "apple-silicon",
    when: (c) => c.isAppleSilicon === true && totalMemoryGb(c) >= MIN_RAM_ARCHIVE_GB,
    select: (c, language) => ({
      live: pickModels(language).live,
      archive: MODELS.whisperTurbo,
      streaming: true,
    }),
  },
  {
    id: "T2",
    label: "standard",
    // Enough slack for the offline archive as well. The two are never resident
    // at once -- the server stops one before starting the other -- so the
    // larger governs, but the download and the pressure are both real.
    when: (c) => totalMemoryGb(c) >= MIN_RAM_ARCHIVE_GB,
    select: (c, language) => {
      const { live, archive } = pickModels(language);
      return { live, archive, streaming: true };
    },
  },
  {
    id: "T1",
    label: "baseline",
    when: (c) => totalMemoryGb(c) >= MIN_RAM_STREAMING_GB,
    // No archive pass: a second 630 MB model is most of a gigabyte of download
    // and RAM for an accuracy gain this machine did not ask for. Commit the
    // streamed text.
    select: (c, language) => ({
      live: pickModels(language).live,
      archive: null,
      streaming: true,
    }),
  },
];

/**
 * @param {object} capability - snapshot from capabilityProbe
 * @param {object} [options]
 * @param {"en"|"multilingual"} [options.language]
 * @returns {{tier: string, label: string, live: object, archive: object|null,
 *   streaming: boolean, downloadGb: number, warnings: string[]}}
 */
function selectTier(capability, options = {}) {
  const language = options.language === "multilingual" ? "multilingual" : "en";
  const snapshot = capability || {};

  const matched = TIERS.find((tier) => tier.when(snapshot)) || TIERS[TIERS.length - 1];
  const selection = matched.select(snapshot, language);

  const warnings = [];
  const downloadGb = (selection.live?.diskGb ?? 0) + (selection.archive?.diskGb ?? 0);

  // Disk is checked after selection rather than as a tier condition: running
  // out of space is a "free some up" problem, not a reason to permanently
  // decide this machine is slower than it is.
  const freeDiskGb = Number(snapshot.freeDiskGb);
  if (Number.isFinite(freeDiskGb) && freeDiskGb < downloadGb * 1.5) {
    warnings.push("lowDisk");
  }

  if (!snapshot.hasAvx2) warnings.push("noAvx2");
  if (snapshot.onBattery) warnings.push("onBattery");

  return {
    tier: matched.id,
    label: matched.label,
    live: selection.live,
    archive: selection.archive,
    streaming: selection.streaming,
    downloadGb: Number(downloadGb.toFixed(2)),
    warnings,
  };
}

module.exports = {
  selectTier,
  MODELS,
  STREAMING_RESIDENT_GB,
  OFFLINE_RESIDENT_GB,
  MIN_RAM_STREAMING_GB,
  MIN_RAM_ARCHIVE_GB,
  MIN_CORES_FOR_STREAMING,
  MODEL_DISK_GB,
  UNIFIED_EN_STREAMING_IS_VIABLE,
};
