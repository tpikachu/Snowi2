const test = require("node:test");
const assert = require("node:assert/strict");

const {
  readActionModelOverride,
  applyActionModelOverride,
} = require("../../src/utils/actionModelOverride.ts");

test("a complete override reads; anything partial or foreign does not", () => {
  assert.deepEqual(
    readActionModelOverride({
      model_mode: "providers",
      model_provider: "anthropic",
      model_id: "claude-sonnet-4-6",
    }),
    { mode: "providers", provider: "anthropic", model: "claude-sonnet-4-6" }
  );
  assert.equal(readActionModelOverride({}), null);
  assert.equal(
    readActionModelOverride({ model_mode: "providers", model_provider: "openai", model_id: "" }),
    null
  );
  // Modes the picker cannot produce never read as overrides, even complete.
  assert.equal(
    readActionModelOverride({
      model_mode: "self-hosted",
      model_provider: "x",
      model_id: "y",
    }),
    null
  );
});

test("applying an override swaps the model and clears every endpoint field", () => {
  const base = {
    mode: "self-hosted",
    provider: "custom",
    model: "old-model",
    cloudMode: "byok",
    cloudBaseUrl: "https://lan.example",
    remoteUrl: "http://192.168.0.2:8080",
    customApiKey: "secret",
  };
  const result = applyActionModelOverride(base, {
    mode: "providers",
    provider: "openai",
    model: "gpt-5-mini",
  });
  assert.equal(result.mode, "providers");
  assert.equal(result.provider, "openai");
  assert.equal(result.model, "gpt-5-mini");
  // The default scope's endpoints must not leak under a different provider.
  assert.equal(result.cloudBaseUrl, undefined);
  assert.equal(result.remoteUrl, undefined);
  assert.equal(result.customApiKey, undefined);
  assert.equal(result.cloudMode, undefined);
  // The base object is untouched.
  assert.equal(base.model, "old-model");
});
