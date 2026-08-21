/**
 * What this machine can run, measured once and cached.
 *
 * Deliberately a set of cheap static reads, not a benchmark. A CPU burn test at
 * onboarding is slow, noisy on a machine that is also busy unpacking an
 * installer, and it delays the one thing the user actually came for. Every
 * signal here is a syscall or a short command; the whole probe is well under a
 * second and none of it blocks the window opening.
 *
 * The result feeds utils/modelTiering.js, which is where the decisions live.
 * This file only reports facts.
 *
 * Whether the choice was *right* is answered later, on real audio, by the
 * runtime sampling in the streaming path — not here.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const debugLogger = require("./debugLogger");

const PROBE_VERSION = 1;
const COMMAND_TIMEOUT_MS = 3000;

/** x86 feature flags we care about. AVX2 is the floor for sherpa-onnx INT8. */
const AVX2_PATTERN = /\bavx2\b/i;
const AVX512_PATTERN = /\bavx512/i;

/**
 * Windows has no cheap way to read either physical core count or CPU feature
 * flags — wmic is gone on 24H2+, and there is no flag list without a native
 * probe. Both come from PowerShell, asked together so the ~290 ms interpreter
 * start is paid once.
 *
 * `-Property NumberOfCores` is not a tidiness flag, it is the difference
 * between 280 ms and 1575 ms: without it WMI materializes every property of
 * Win32_Processor. Measured on an i9-10900K, same answer either way.
 *
 * Feature 40 is PF_AVX2_INSTRUCTIONS_AVAILABLE. Add-Type costs ~45 ms on top of
 * the interpreter start, which is cheap enough to keep the reliable answer
 * rather than guessing AVX2 from a CPU model string.
 */
const WINDOWS_CPU_SCRIPT = [
  "Add-Type -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern bool IsProcessorFeaturePresent(uint f);' -Name N -Namespace W;",
  "$cores = (Get-CimInstance -ClassName Win32_Processor -Property NumberOfCores |",
  "Measure-Object -Property NumberOfCores -Sum).Sum;",
  'Write-Output "cores=$cores";',
  'Write-Output "avx2=$([W.N]::IsProcessorFeaturePresent(40))";',
].join(" ");

let windowsCpuPromise = null;

function readWindowsCpu(execFileImpl) {
  if (!windowsCpuPromise) {
    windowsCpuPromise = run(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_CPU_SCRIPT],
      { execFileImpl }
    ).then((out) => ({
      physicalCores: parseInt(out.match(/cores=(\d+)/)?.[1] ?? "", 10),
      hasAvx2: /avx2=true/i.test(out),
    }));
  }
  return windowsCpuPromise;
}

/** Exposed for tests; the memo would otherwise outlive a case's fake exec. */
function resetWindowsCpuCache() {
  windowsCpuPromise = null;
}

function run(command, args, { execFileImpl = execFile } = {}) {
  return new Promise((resolve) => {
    try {
      execFileImpl(
        command,
        args,
        { timeout: COMMAND_TIMEOUT_MS, windowsHide: true },
        (error, stdout) => resolve(error ? "" : String(stdout || ""))
      );
    } catch {
      resolve("");
    }
  });
}

/**
 * Physical cores, which is what matters: the app pins ONNX threads to
 * min(4, cores * 0.75), and counting hyperthreads would let a 2-core machine
 * claim it has 4 and take a tier it cannot hold.
 *
 * os.cpus() reports logical CPUs everywhere, so this has to be asked of the
 * platform. When that fails, halving is the safer guess on x86 (SMT is the norm)
 * while arm64 rarely has SMT at all.
 */
async function detectPhysicalCores(deps = {}) {
  const { osImpl = os, execFileImpl = execFile } = deps;
  const logical = osImpl.cpus()?.length || 1;

  if (process.platform === "darwin") {
    const out = await run("sysctl", ["-n", "hw.physicalcpu"], { execFileImpl });
    const parsed = parseInt(out.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  } else if (process.platform === "linux") {
    try {
      const cpuinfo = fs.readFileSync("/proc/cpuinfo", "utf8");
      const ids = new Set(
        cpuinfo
          .split(/\n\n+/)
          .map((block) => {
            const physical = block.match(/physical id\s*:\s*(\d+)/)?.[1];
            const core = block.match(/core id\s*:\s*(\d+)/)?.[1];
            return physical !== undefined && core !== undefined ? `${physical}:${core}` : null;
          })
          .filter(Boolean)
      );
      if (ids.size > 0) return ids.size;
    } catch {
      // fall through to the estimate
    }
  } else if (process.platform === "win32") {
    const { physicalCores } = await readWindowsCpu(execFileImpl);
    if (Number.isFinite(physicalCores) && physicalCores > 0) return physicalCores;
  }

  const arch = osImpl.arch?.() || process.arch;
  return arch === "arm64" ? logical : Math.max(1, Math.floor(logical / 2));
}

/**
 * Apple Silicon has no AVX and does not need it — the check only governs x86,
 * where the INT8 kernels assume it. Reporting `true` on arm64 keeps the tiering
 * rule readable rather than making every caller special-case the architecture.
 */
async function detectCpuFeatures(deps = {}) {
  const { osImpl = os, execFileImpl = execFile } = deps;
  const arch = osImpl.arch?.() || process.arch;
  if (arch === "arm64") return { hasAvx2: true, hasAvx512: false };

  let flags = "";
  if (process.platform === "linux") {
    try {
      flags = fs.readFileSync("/proc/cpuinfo", "utf8");
    } catch {
      flags = "";
    }
  } else if (process.platform === "darwin") {
    flags = await run("sysctl", ["-n", "machdep.cpu.features", "machdep.cpu.leaf7_features"], {
      execFileImpl,
    });
  } else if (process.platform === "win32") {
    // AVX-512 is not reported: there is no processor-feature constant for it,
    // and nothing here uses it beyond labelling a tier.
    const { hasAvx2 } = await readWindowsCpu(execFileImpl);
    return { hasAvx2, hasAvx512: false };
  }

  return {
    hasAvx2: AVX2_PATTERN.test(flags),
    hasAvx512: AVX512_PATTERN.test(flags),
  };
}

async function detectAppleSilicon(deps = {}) {
  const { osImpl = os, execFileImpl = execFile } = deps;
  if (process.platform !== "darwin") return { isAppleSilicon: false, cpuBrand: null };

  const arch = osImpl.arch?.() || process.arch;
  const brand = (await run("sysctl", ["-n", "machdep.cpu.brand_string"], { execFileImpl })).trim();

  return {
    // Rosetta reports x64 while running on Apple hardware, so the brand string
    // decides rather than the architecture alone.
    isAppleSilicon: arch === "arm64" || /^Apple\s+M/i.test(brand),
    cpuBrand: brand || null,
  };
}

function detectFreeDiskGb(targetPath) {
  try {
    // statfsSync landed in Node 18.15; the app pins 24, but a missing symbol
    // here should degrade to "unknown" rather than fail the probe.
    if (typeof fs.statfsSync !== "function") return null;
    const stats = fs.statfsSync(targetPath);
    return Number(((stats.bavail * stats.bsize) / 1024 ** 3).toFixed(1));
  } catch {
    return null;
  }
}

async function detectGpu() {
  try {
    const { detectNvidiaGpu } = require("../utils/gpuDetection");
    const info = await detectNvidiaGpu();
    if (!info?.available) return null;
    return {
      vendor: "nvidia",
      name: info.name ?? null,
      vramGb: Number.isFinite(info.vramMb) ? Number((info.vramMb / 1024).toFixed(1)) : null,
      cudaCapable: Boolean(info.cudaCapable ?? info.available),
    };
  } catch (error) {
    debugLogger.debug("capabilityProbe: GPU detection unavailable", { error: error.message });
    return null;
  }
}

/**
 * Battery state is reported, never used to pick a model: a laptop unplugged at
 * first launch would otherwise be permanently assigned a worse tier than the
 * same laptop on a desk. The runtime sampler can throttle; selection should not.
 */
function detectOnBattery() {
  try {
    const { powerMonitor } = require("electron");
    return powerMonitor?.onBatteryPower ?? false;
  } catch {
    return false;
  }
}

async function probeCapabilities(deps = {}) {
  const { osImpl = os, cachePath = null } = deps;
  const startedAt = Date.now();

  const [physicalCores, features, apple] = await Promise.all([
    detectPhysicalCores(deps),
    detectCpuFeatures(deps),
    detectAppleSilicon(deps),
  ]);
  const gpu = await detectGpu();

  const snapshot = {
    probeVersion: PROBE_VERSION,
    totalMemGb: Number((osImpl.totalmem() / 1024 ** 3).toFixed(1)),
    freeMemGb: Number((osImpl.freemem() / 1024 ** 3).toFixed(1)),
    physicalCores,
    logicalCores: osImpl.cpus()?.length || 1,
    cpuModel: osImpl.cpus()?.[0]?.model?.trim() || apple.cpuBrand || "unknown",
    hasAvx2: features.hasAvx2,
    hasAvx512: features.hasAvx512,
    isAppleSilicon: apple.isAppleSilicon,
    gpu,
    freeDiskGb: cachePath
      ? detectFreeDiskGb(path.dirname(cachePath))
      : detectFreeDiskGb(os.homedir()),
    onBattery: detectOnBattery(),
    platform: process.platform,
    arch: osImpl.arch?.() || process.arch,
    probedAt: startedAt,
    probeMs: Date.now() - startedAt,
  };

  debugLogger.info("capabilityProbe completed", {
    ms: snapshot.probeMs,
    cores: snapshot.physicalCores,
    ram: snapshot.totalMemGb,
    avx2: snapshot.hasAvx2,
  });

  return snapshot;
}

/**
 * A fingerprint of the things that would change the answer, built only from
 * signals that cost nothing — no subprocess, no nvidia-smi.
 *
 * That constraint is the whole point. A fingerprint that included physical core
 * count or GPU name would have to run the expensive half of the probe just to
 * decide whether it could skip the expensive half of the probe. These four are
 * enough to notice a RAM upgrade, a restore onto different hardware, or a probe
 * that learned to measure something new.
 */
function capabilityFingerprint(snapshot) {
  if (!snapshot) return "";
  return [
    snapshot.probeVersion,
    snapshot.platform,
    snapshot.arch,
    snapshot.cpuModel,
    snapshot.logicalCores,
    Math.round(Number(snapshot.totalMemGb) || 0),
  ].join("|");
}

/** The same fingerprint for the machine as it is right now. */
function currentFingerprint(deps = {}) {
  const { osImpl = os } = deps;
  return capabilityFingerprint({
    probeVersion: PROBE_VERSION,
    platform: process.platform,
    arch: osImpl.arch?.() || process.arch,
    cpuModel: osImpl.cpus()?.[0]?.model?.trim() || "unknown",
    logicalCores: osImpl.cpus()?.length || 1,
    totalMemGb: osImpl.totalmem() / 1024 ** 3,
  });
}

function readCachedCapabilities(cachePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    if (parsed?.probeVersion !== PROBE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedCapabilities(cachePath, snapshot) {
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(snapshot, null, 2));
  } catch (error) {
    // A capability cache that cannot be written is a slower launch, not a
    // failure: the probe is cheap enough to repeat.
    debugLogger.warn("capabilityProbe: could not cache result", { error: error.message });
  }
}

/**
 * The normal entry point: cached result if the machine still looks the same,
 * otherwise a fresh probe.
 */
async function getCapabilities(cachePath, deps = {}) {
  if (!deps.force) {
    const cached = readCachedCapabilities(cachePath);
    if (cached && capabilityFingerprint(cached) === currentFingerprint(deps)) {
      return cached;
    }
  }

  const snapshot = await probeCapabilities({ ...deps, cachePath });
  writeCachedCapabilities(cachePath, snapshot);
  return snapshot;
}

module.exports = {
  probeCapabilities,
  getCapabilities,
  capabilityFingerprint,
  currentFingerprint,
  readCachedCapabilities,
  writeCachedCapabilities,
  detectPhysicalCores,
  detectCpuFeatures,
  detectAppleSilicon,
  detectFreeDiskGb,
  resetWindowsCpuCache,
  PROBE_VERSION,
};
