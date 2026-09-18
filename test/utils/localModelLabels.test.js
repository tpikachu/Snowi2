const test = require("node:test");
const assert = require("node:assert/strict");

const {
  LOCAL_TOOL_MIN_PARAMS_B,
  localModelParamsB,
  localModelCanUseTools,
  localModelTier,
  localModelMemoryGb,
  localModelFit,
  describeLocalModel,
  splitFeaturedModels,
} = require("../../src/utils/localModelLabels.ts");

/**
 * Local language models came back (2026-09-18) on the condition that every
 * row answers three questions at the moment of choice: which one gives the
 * best meeting answers, will it run on this machine, and what does it give
 * up. These are the facts behind those labels.
 */

const QWEN_9B = 5889811552; // Qwen3.5 9B Q4_K_M, from the registry
const QWEN_2B = 1329766560;
const QWEN3_32B = 21260251955;

test("parameter counts read off the registry's ids — Gemma's E-prefix and MoE totals included", () => {
  assert.equal(localModelParamsB("qwen3.5-9b-q4_k_m"), 9);
  assert.equal(localModelParamsB("qwen3-1.7b-q8_0"), 1.7);
  assert.equal(localModelParamsB("qwen2.5-1.5b-instruct-q5_k_m"), 1.5);
  assert.equal(localModelParamsB("llama-3.2-1b-instruct-q4_k_m"), 1);
  assert.equal(localModelParamsB("mistral-7b-instruct-v0.3-q5_k_m"), 7);
  assert.equal(localModelParamsB("gemma-4-e4b-it-qat-q4_0"), 4);
  assert.equal(localModelParamsB("gemma-4-26b-a4b-it-q4_k_m"), 26);
  assert.equal(localModelParamsB("gpt-oss-20b-mxfp4"), 20);
  assert.equal(localModelParamsB("lfm2.5-8b-a1b-q4_k_m"), 8);
  assert.equal(localModelParamsB("lfm2.5-350m-q8_0"), 0);
});

test("tools go to models of 4B and up, the same line the chat agent draws", () => {
  assert.equal(LOCAL_TOOL_MIN_PARAMS_B, 4);
  assert.equal(localModelCanUseTools("qwen3.5-9b-q4_k_m"), true);
  assert.equal(localModelCanUseTools("gemma-4-e4b-it-qat-q4_0"), true);
  assert.equal(localModelCanUseTools("qwen3.5-2b-q4_k_m"), false);
  assert.equal(localModelCanUseTools("lfm2.5-350m-q8_0"), false);
});

test("the registry's tier wins; otherwise the parameter count decides", () => {
  assert.equal(localModelTier({ id: "qwen3.5-4b-q4_k_m", tier: "best" }), "best");
  assert.equal(localModelTier({ id: "qwen3-8b-q4_k_m" }), "best");
  assert.equal(localModelTier({ id: "mistral-7b-instruct-v0.3-q5_k_m" }), "best");
  assert.equal(localModelTier({ id: "gemma-3-4b-it-q4_k_m" }), "fast");
  assert.equal(localModelTier({ id: "llama-3.2-3b-instruct-q4_k_m" }), "light");
  assert.equal(localModelTier({ id: "lfm2.5-230m-q8_0" }), "light");
});

test("memory is the weights plus room for the cache and the runtime, rounded up", () => {
  assert.equal(localModelMemoryGb(QWEN_9B), 8);
  assert.equal(localModelMemoryGb(QWEN_2B), 3);
  assert.equal(localModelMemoryGb(QWEN3_32B), 24);
  assert.equal(localModelMemoryGb(0), 1);
});

test("fit keeps headroom for the OS and the meeting, and a discrete GPU's memory counts", () => {
  assert.equal(localModelFit(QWEN_9B, { totalMemGb: 16 }), "good");
  assert.equal(localModelFit(QWEN_9B, { totalMemGb: 10 }), "tight");
  assert.equal(localModelFit(QWEN_9B, { totalMemGb: 8 }), "poor");
  assert.equal(localModelFit(QWEN_9B, { totalMemGb: 8, vramGb: 12 }), "good");
  assert.equal(localModelFit(QWEN3_32B, { totalMemGb: 16, vramGb: 8 }), "poor");
  assert.equal(localModelFit(QWEN_9B, null), "unknown");
  assert.equal(localModelFit(QWEN_9B, { totalMemGb: 0 }), "unknown");
});

test("a row's labels, together", () => {
  assert.deepEqual(
    describeLocalModel(
      { id: "qwen3.5-2b-q4_k_m", sizeBytes: QWEN_2B, tier: "light" },
      { totalMemGb: 16 }
    ),
    { tier: "light", memoryGb: 3, fit: "good", toolsOff: true }
  );
  assert.deepEqual(
    describeLocalModel({ id: "qwen3-32b-q4_k_m", sizeBytes: QWEN3_32B }, { totalMemGb: 16 }),
    { tier: "best", memoryGb: 24, fit: "poor", toolsOff: false }
  );
});

test("the featured models lead and the rest tuck away — unless on disk or in use", () => {
  const models = [
    { id: "qwen3.5-9b", featured: true },
    { id: "qwen3-8b" },
    { id: "qwen3.5-4b", featured: true },
    { id: "qwen2.5-7b" },
  ];
  const plain = splitFeaturedModels(models, new Set());
  assert.deepEqual(
    plain.featured.map((m) => m.id),
    ["qwen3.5-9b", "qwen3.5-4b"]
  );
  assert.deepEqual(
    plain.more.map((m) => m.id),
    ["qwen3-8b", "qwen2.5-7b"]
  );
  const kept = splitFeaturedModels(models, new Set(["qwen2.5-7b"]));
  assert.deepEqual(
    kept.featured.map((m) => m.id),
    ["qwen3.5-9b", "qwen3.5-4b", "qwen2.5-7b"]
  );
  assert.deepEqual(
    kept.more.map((m) => m.id),
    ["qwen3-8b"]
  );
});
