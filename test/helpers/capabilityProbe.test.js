const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  probeCapabilities,
  getCapabilities,
  capabilityFingerprint,
  currentFingerprint,
  readCachedCapabilities,
  writeCachedCapabilities,
  PROBE_VERSION,
} = require("../../src/helpers/capabilityProbe.js");

/** os stand-in, so a test machine's real hardware never decides an assertion. */
const fakeOs = (overrides = {}) => ({
  totalmem: () => (overrides.totalGb ?? 16) * 1024 ** 3,
  freemem: () => (overrides.freeGb ?? 8) * 1024 ** 3,
  cpus: () => new Array(overrides.logicalCores ?? 8).fill({ model: overrides.cpu ?? "Test CPU" }),
  arch: () => overrides.arch ?? "x64",
  homedir: () => os.homedir(),
});

const tempCache = (name) => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "snowy-probe-")), name);

test("reports the machine's memory and cores", async () => {
  const snapshot = await probeCapabilities({ osImpl: fakeOs({ totalGb: 32, logicalCores: 12 }) });

  assert.equal(snapshot.totalMemGb, 32);
  assert.equal(snapshot.logicalCores, 12);
  assert.equal(snapshot.probeVersion, PROBE_VERSION);
  assert.ok(snapshot.probeMs >= 0);
});

test("the probe stays cheap enough to run at launch", async () => {
  // This is a set of static reads, not a benchmark, because it runs while the
  // user waits for a window. The guard is deliberately tight: an earlier
  // version called `Get-CimInstance Win32_Processor` without `-Property`, which
  // made WMI materialize every property and cost 1575 ms on its own — a
  // regression a 5-second ceiling would have waved straight through.
  //
  // Measured here after the fix: ~365 ms warm on Windows, near zero elsewhere.
  const snapshot = await probeCapabilities({ osImpl: fakeOs() });
  assert.ok(
    snapshot.probeMs < 1500,
    `probe took ${snapshot.probeMs}ms; it must not become a benchmark`
  );
});

test("arm64 is reported as AVX2-capable so the tiering rule stays readable", async () => {
  // Apple Silicon has no AVX and does not need it — the flag only governs x86,
  // where the INT8 kernels assume it.
  const snapshot = await probeCapabilities({ osImpl: fakeOs({ arch: "arm64" }) });
  assert.equal(snapshot.hasAvx2, true);
  assert.equal(snapshot.hasAvx512, false);
});

test("the fingerprint uses only signals that cost nothing", () => {
  // If this ever included physical cores or the GPU name, the cache check would
  // have to run the expensive half of the probe to decide whether it could skip
  // the expensive half of the probe.
  const withGpu = {
    probeVersion: PROBE_VERSION,
    platform: "win32",
    arch: "x64",
    cpuModel: "Test CPU",
    logicalCores: 8,
    totalMemGb: 16,
    physicalCores: 4,
    gpu: { name: "RTX 4090" },
  };
  const withoutGpu = { ...withGpu, gpu: null, physicalCores: 99 };

  assert.equal(capabilityFingerprint(withGpu), capabilityFingerprint(withoutGpu));
});

test("the fingerprint changes when the machine really changes", () => {
  const base = {
    probeVersion: PROBE_VERSION,
    platform: "win32",
    arch: "x64",
    cpuModel: "Test CPU",
    logicalCores: 8,
    totalMemGb: 16,
  };

  const original = capabilityFingerprint(base);
  assert.notEqual(original, capabilityFingerprint({ ...base, totalMemGb: 32 }), "RAM upgrade");
  assert.notEqual(original, capabilityFingerprint({ ...base, cpuModel: "Other" }), "new machine");
  assert.notEqual(original, capabilityFingerprint({ ...base, arch: "arm64" }), "new arch");
  assert.notEqual(
    original,
    capabilityFingerprint({ ...base, probeVersion: PROBE_VERSION + 1 }),
    "probe learned to measure something new"
  );

  // Rounded, so normal fluctuation in reported total memory is not a new machine.
  assert.equal(original, capabilityFingerprint({ ...base, totalMemGb: 16.2 }));
});

test("a matching cache is returned without re-probing", async () => {
  const cachePath = tempCache("capability.json");
  const osImpl = fakeOs();

  const first = await getCapabilities(cachePath, { osImpl });
  assert.ok(fs.existsSync(cachePath));

  // Marked so a re-probe would be visible: probeCapabilities would overwrite it.
  const marked = { ...first, marker: "from-cache" };
  writeCachedCapabilities(cachePath, marked);

  const second = await getCapabilities(cachePath, { osImpl });
  assert.equal(second.marker, "from-cache");
});

test("a changed machine invalidates the cache", async () => {
  const cachePath = tempCache("capability.json");

  const before = await getCapabilities(cachePath, { osImpl: fakeOs({ totalGb: 8 }) });
  assert.equal(before.totalMemGb, 8);

  const after = await getCapabilities(cachePath, { osImpl: fakeOs({ totalGb: 32 }) });
  assert.equal(after.totalMemGb, 32);
});

test("force re-probes even when the cache matches", async () => {
  const cachePath = tempCache("capability.json");
  const osImpl = fakeOs();

  await getCapabilities(cachePath, { osImpl });
  writeCachedCapabilities(cachePath, {
    ...readCachedCapabilities(cachePath),
    marker: "stale",
  });

  const forced = await getCapabilities(cachePath, { osImpl, force: true });
  assert.equal(forced.marker, undefined);
});

test("a cache from an older probe version is ignored", () => {
  const cachePath = tempCache("capability.json");
  fs.writeFileSync(cachePath, JSON.stringify({ probeVersion: PROBE_VERSION - 1, totalMemGb: 4 }));

  assert.equal(readCachedCapabilities(cachePath), null);
});

test("a corrupt or missing cache reads as absent rather than throwing", () => {
  const cachePath = tempCache("capability.json");
  assert.equal(readCachedCapabilities(cachePath), null, "missing");

  fs.writeFileSync(cachePath, "{ not json");
  assert.equal(readCachedCapabilities(cachePath), null, "corrupt");
});

test("an unwritable cache path degrades to a slower launch, not a failure", async () => {
  // A capability cache that cannot be written is cheap to redo; refusing to
  // start would not be.
  const cachePath = path.join(os.tmpdir(), "snowy-probe-nonexistent", "\0invalid", "c.json");
  const snapshot = await getCapabilities(cachePath, { osImpl: fakeOs() });

  assert.ok(snapshot.totalMemGb > 0);
});

test("currentFingerprint matches what a fresh probe would produce", async () => {
  const osImpl = fakeOs({ totalGb: 16, logicalCores: 8, cpu: "Test CPU" });
  const snapshot = await probeCapabilities({ osImpl });

  assert.equal(currentFingerprint({ osImpl }), capabilityFingerprint(snapshot));
});
