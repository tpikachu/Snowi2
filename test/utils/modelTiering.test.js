const test = require("node:test");
const assert = require("node:assert/strict");

const {
  selectTier,
  MODELS,
  MIN_RAM_STREAMING_GB,
  MIN_RAM_ARCHIVE_GB,
} = require("../../src/utils/modelTiering.js");

/** A capable desktop, overridden per test. */
const machine = (overrides = {}) => ({
  totalMemGb: 16,
  freeMemGb: 9,
  physicalCores: 8,
  logicalCores: 16,
  hasAvx2: true,
  hasAvx512: false,
  isAppleSilicon: false,
  gpu: null,
  freeDiskGb: 200,
  onBattery: false,
  platform: "win32",
  arch: "x64",
  ...overrides,
});

test("the stated baseline machine gets streaming, and no archive pass", () => {
  // i5-9400 / 8 GB — the machine the whole tier matrix was written around, and
  // the one P0 measured against. 8 - 3 headroom = 5 GB usable: room for the
  // 0.76 GB streaming model, not for the 1.31 GB offline one on top.
  const result = selectTier(machine({ totalMemGb: 8, physicalCores: 6, logicalCores: 6 }));

  assert.equal(result.tier, "T1");
  assert.equal(result.live.name, MODELS.streamingEn.name);
  assert.equal(result.archive, null);
  assert.equal(result.streaming, true);
});

test("a 16 GB machine also gets the archive pass", () => {
  const result = selectTier(machine());

  assert.equal(result.tier, "T2");
  assert.equal(result.live.name, MODELS.streamingEn.name);
  // The most accurate model measured on meeting audio (AMI 10.14%).
  assert.equal(result.archive.name, MODELS.archiveEn.name);
});

test("no AVX2 drops to Whisper, and says it is not really streaming", () => {
  // sherpa-onnx INT8 kernels assume AVX2. Without it the 0.6B model is not
  // viable however much memory the machine has.
  const result = selectTier(machine({ hasAvx2: false, totalMemGb: 32 }));

  assert.equal(result.tier, "T0");
  assert.equal(result.live.name, MODELS.whisperBase.name);
  assert.equal(result.streaming, false, "buffered decode must not be sold as live captions");
  assert.ok(result.warnings.includes("noAvx2"));
});

test("too few cores drops to Whisper even with plenty of memory", () => {
  const result = selectTier(machine({ physicalCores: 2, totalMemGb: 32 }));
  assert.equal(result.tier, "T0");
});

test("a small machine cannot host the streaming model at all", () => {
  // 4 GB total leaves 1 GB after headroom — under the 0.76 GB model plus its
  // own margin once anything else is running.
  const result = selectTier(machine({ totalMemGb: 4 }));
  assert.equal(result.tier, "T0");
});

test("memory is judged on total, not on whatever happens to be free", () => {
  // Free memory on a freshly booted machine says nothing about what is free
  // once a browser and a meeting client are open. Two identical machines must
  // not get different models because one had a tab open.
  const busy = selectTier(machine({ totalMemGb: 16, freeMemGb: 1 }));
  const idle = selectTier(machine({ totalMemGb: 16, freeMemGb: 15 }));

  assert.equal(busy.tier, idle.tier);
  assert.equal(busy.archive.name, idle.archive.name);
});

test("a CUDA GPU spends itself on the archive, not on live captions", () => {
  const result = selectTier(machine({ gpu: { cudaCapable: true, vramGb: 8 } }));

  assert.equal(result.tier, "T5");
  // Live stays on CPU deliberately: streaming latency is chunk cadence, not
  // compute, and measured RTF 0.25 already has 4x headroom.
  assert.equal(result.live.runtime, "online");
  assert.equal(result.archive.name, MODELS.whisperTurbo.name);
});

test("a GPU too small to be worth it does not claim the GPU tier", () => {
  const result = selectTier(machine({ gpu: { cudaCapable: true, vramGb: 4 } }));
  assert.equal(result.tier, "T2");
});

test("Apple Silicon gets Metal-backed Whisper for the archive", () => {
  const result = selectTier(machine({ isAppleSilicon: true, platform: "darwin", arch: "arm64" }));

  assert.equal(result.tier, "T4");
  assert.equal(result.archive.name, MODELS.whisperTurbo.name);
});

test("an 8 GB Apple machine takes the baseline path, not the Apple one", () => {
  // An M1 Air with 8 GB cannot hold the offline model alongside everything
  // else; memory pressure is not worth the accuracy.
  const result = selectTier(
    machine({ isAppleSilicon: true, totalMemGb: 8, physicalCores: 8, platform: "darwin" })
  );

  assert.equal(result.tier, "T1");
  assert.equal(result.archive, null);
});

test("multilingual swaps both models, and only those", () => {
  const en = selectTier(machine());
  const multi = selectTier(machine(), { language: "multilingual" });

  assert.equal(multi.tier, en.tier);
  assert.equal(multi.live.name, MODELS.streamingMulti.name);
  assert.equal(multi.archive.name, MODELS.archiveMulti.name);
});

test("download size is the sum of what was actually selected", () => {
  const baseline = selectTier(machine({ totalMemGb: 8, physicalCores: 6 }));
  const standard = selectTier(machine());

  assert.equal(baseline.downloadGb, MODELS.streamingEn.diskGb);
  assert.ok(
    standard.downloadGb > baseline.downloadGb,
    "a machine taking the archive pass downloads more"
  );
});

test("low disk warns without demoting the machine", () => {
  // Running out of space is a "free some up" problem, not a reason to decide
  // permanently that this machine is slower than it is.
  const result = selectTier(machine({ freeDiskGb: 1 }));

  assert.equal(result.tier, "T2");
  assert.ok(result.warnings.includes("lowDisk"));
});

test("battery is surfaced but does not change the selection", () => {
  const plugged = selectTier(machine());
  const battery = selectTier(machine({ onBattery: true }));

  assert.equal(battery.tier, plugged.tier);
  assert.ok(battery.warnings.includes("onBattery"));
});

test("an empty or unknown snapshot still returns something runnable", () => {
  // The probe can fail — a locked-down machine, a missing sysctl. Falling back
  // to the most conservative tier beats refusing to transcribe.
  for (const input of [undefined, null, {}, { totalMemGb: "unknown" }]) {
    const result = selectTier(input);
    assert.ok(result.live, "every outcome must name a live model");
    assert.equal(result.tier, "T0");
  }
});

test("the tier boundaries sit exactly on the stated thresholds", () => {
  // Written against the exported constants rather than literals, so moving a
  // threshold does not quietly leave a test asserting the old one.
  assert.equal(selectTier(machine({ totalMemGb: MIN_RAM_STREAMING_GB - 0.1 })).tier, "T0");
  assert.equal(selectTier(machine({ totalMemGb: MIN_RAM_STREAMING_GB })).tier, "T1");
  assert.equal(selectTier(machine({ totalMemGb: MIN_RAM_ARCHIVE_GB - 0.1 })).tier, "T1");
  assert.equal(selectTier(machine({ totalMemGb: MIN_RAM_ARCHIVE_GB })).tier, "T2");
});

test("a GPU cannot rescue a machine without the memory to use it", () => {
  // 8 GB with a big card still cannot afford the archive model the GPU tier
  // exists to run, so it takes the baseline path rather than claiming T5.
  const result = selectTier(machine({ totalMemGb: 8, gpu: { cudaCapable: true, vramGb: 12 } }));

  assert.equal(result.tier, "T1");
  assert.equal(result.archive, null);
});
