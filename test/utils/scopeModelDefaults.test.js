const test = require("node:test");
const assert = require("node:assert/strict");

const { defaultModelForProvider } = require("../../src/utils/scopeModelDefaults.ts");
const registry = require("../../src/models/modelRegistryData.json");

test("the OpenAI default is the balanced everyday model, not the cheapest", () => {
  // One model serves chat and the write-up (client, 2026-09-22); the fast
  // lane derives Nano on its own.
  assert.equal(defaultModelForProvider("openai"), "gpt-5-mini");
});

test("a provider without a catalog defaults to nothing", () => {
  assert.equal(defaultModelForProvider("custom"), null);
  assert.equal(defaultModelForProvider(""), null);
});

test("every default names a model that exists in that provider's registry catalog", () => {
  // A default pointing at a renamed or retired model id would 404 on the
  // first request after key entry - the worst possible first impression.
  const catalog = new Map(
    registry.cloudProviders.map((provider) => [
      provider.id,
      new Set(provider.models.map((m) => m.id)),
    ])
  );
  for (const providerId of ["openai", "anthropic", "gemini", "groq", "tinfoil", "corti"]) {
    const models = catalog.get(providerId);
    assert.ok(models, `provider ${providerId} missing from registry`);
    const model = defaultModelForProvider(providerId);
    assert.ok(model, `${providerId} has no default`);
    assert.ok(models.has(model), `${providerId} default "${model}" not in registry`);
  }
});

test("the OpenRouter default is a curated slug whose vendor model the registry knows", () => {
  const {
    OPENROUTER_CURATED_MODELS,
    openrouterPickerModels,
    openrouterModelLabel,
  } = require("../../src/config/openrouterModels.ts");
  const curated = new Set(OPENROUTER_CURATED_MODELS.map((m) => m.id));
  const model = defaultModelForProvider("openrouter");
  assert.ok(curated.has(model), `openrouter default "${model}" is not curated`);
  for (const entry of OPENROUTER_CURATED_MODELS) {
    // vendor/slug, as OpenRouter addresses them.
    assert.match(entry.id, /^[a-z0-9-]+\/[a-z0-9.-]+$/);
    const provider = registry.cloudProviders.find((p) => p.id === entry.upstreamProvider);
    assert.ok(
      provider?.models.some((m) => m.id === entry.upstreamId),
      `${entry.id}: upstream ${entry.upstreamProvider}/${entry.upstreamId} missing from registry`
    );
  }
  // The picker rows borrow the vendor's label and one-liner.
  const mini = openrouterPickerModels().find((m) => m.id === "openai/gpt-5-mini");
  assert.equal(mini.label, "GPT-5 Mini");
  assert.equal(mini.descriptionKey, "models.descriptions.cloud.openai_gpt_5_mini");
  assert.equal(openrouterModelLabel("openai/gpt-5-mini"), "GPT-5 Mini");
  assert.equal(openrouterModelLabel("mistralai/mistral-small-2603"), null);
});
