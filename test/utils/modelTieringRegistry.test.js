const test = require("node:test");
const assert = require("node:assert/strict");

const { MODELS, selectTier } = require("../../src/utils/modelTiering.js");
const registry = require("../../src/models/modelRegistryData.json");

/**
 * modelTiering names models as string literals; the download path looks those
 * names up in the model registry. Nothing but this test connects the two, so a
 * rename on either side would otherwise surface as a download that fails at
 * the moment a new user first tries to set the app up.
 */

const lookup = (model) =>
  model.runtime === "whisper"
    ? registry.whisperModels[model.name]
    : registry.parakeetModels[model.name];

test("every model the tiering can pick exists in the registry", () => {
  for (const [key, model] of Object.entries(MODELS)) {
    assert.ok(lookup(model), `MODELS.${key} names "${model.name}", which the registry has no entry for`);
  }
});

test("the streaming models really are streaming builds", () => {
  // `runtime: "online"` is what routes a model to the online websocket server.
  // Picking an offline build for the live path would decode nothing until the
  // meeting ended.
  for (const key of ["streamingEn", "streamingMulti"]) {
    assert.equal(MODELS[key].runtime, "online");
    assert.equal(
      registry.parakeetModels[MODELS[key].name].runtime,
      "online",
      `${MODELS[key].name} is not an online build in the registry`
    );
  }
});

test("the archive models are offline builds", () => {
  for (const key of ["archiveEn", "archiveMulti"]) {
    assert.equal(MODELS[key].runtime, "offline");
    assert.notEqual(
      registry.parakeetModels[MODELS[key].name].runtime,
      "online",
      `${MODELS[key].name} is a streaming build being used for the archive pass`
    );
  }
});

test("declared disk sizes are close to what the registry will download", () => {
  // Not an exact match — the tiering rounds to a tenth of a gigabyte, and the
  // UI shows the registry's own figure. This catches a size that drifted by
  // enough to misinform the download prompt.
  for (const [key, model] of Object.entries(MODELS)) {
    const registrySizeGb = lookup(model).sizeMb / 1000;
    const drift = Math.abs(registrySizeGb - model.diskGb);
    assert.ok(
      drift < 0.1,
      `MODELS.${key} claims ${model.diskGb} GB; the registry says ${registrySizeGb} GB`
    );
  }
});

test("the language variants are actually for the languages claimed", () => {
  assert.equal(registry.parakeetModels[MODELS.streamingEn.name].language, "en");
  assert.equal(registry.parakeetModels[MODELS.archiveEn.name].language, "en");
  assert.equal(registry.parakeetModels[MODELS.streamingMulti.name].language, "multilingual");
  assert.equal(registry.parakeetModels[MODELS.archiveMulti.name].language, "multilingual");
});

test("every tier a real machine can land in names downloadable models", () => {
  // Walks the tier table through representative machines rather than asserting
  // against MODELS directly, so a tier that starts returning a model the table
  // does not list is still caught.
  const machines = [
    { name: "no avx2", totalMemGb: 32, physicalCores: 8, hasAvx2: false },
    { name: "baseline", totalMemGb: 8, physicalCores: 6, hasAvx2: true },
    { name: "standard", totalMemGb: 16, physicalCores: 8, hasAvx2: true },
    {
      name: "gpu",
      totalMemGb: 32,
      physicalCores: 12,
      hasAvx2: true,
      gpu: { cudaCapable: true, vramGb: 12 },
    },
    {
      name: "apple",
      totalMemGb: 16,
      physicalCores: 8,
      hasAvx2: true,
      isAppleSilicon: true,
      platform: "darwin",
    },
  ];

  for (const machine of machines) {
    for (const language of ["en", "multilingual"]) {
      const result = selectTier(machine, { language });
      assert.ok(lookup(result.live), `${machine.name}/${language}: live model is not downloadable`);
      if (result.archive) {
        assert.ok(
          lookup(result.archive),
          `${machine.name}/${language}: archive model is not downloadable`
        );
      }
    }
  }
});
