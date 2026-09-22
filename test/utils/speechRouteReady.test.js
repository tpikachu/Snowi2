const test = require("node:test");
const assert = require("node:assert/strict");
const { speechRouteReadiness } = require("../../src/utils/speechRouteReady.ts");

const secrets = (values) => (field) => values[field] ?? "";

test("a cloud speech provider without its key is not ready", () => {
  assert.equal(
    speechRouteReadiness({
      transcriptionMode: "providers",
      provider: "openai",
      model: "gpt-4o-transcribe",
      secret: secrets({}),
    }),
    "needsKey"
  );
  assert.equal(
    speechRouteReadiness({
      transcriptionMode: "providers",
      provider: "openai",
      model: "gpt-4o-transcribe",
      secret: secrets({ openaiApiKey: "   " }),
    }),
    "needsKey"
  );
});

test("a keyed provider with a model is ready; without a model it is not", () => {
  assert.equal(
    speechRouteReadiness({
      transcriptionMode: "providers",
      provider: "openai",
      model: "gpt-4o-transcribe",
      secret: secrets({ openaiApiKey: "sk-x" }),
    }),
    "ready"
  );
  assert.equal(
    speechRouteReadiness({
      transcriptionMode: "providers",
      provider: "openai",
      model: "",
      secret: secrets({ openaiApiKey: "sk-x" }),
    }),
    "needsModel"
  );
});

test("Corti needs both its client id and secret; its non-secret fields do not count", () => {
  const base = { transcriptionMode: "providers", provider: "corti", model: "corti-1" };
  assert.equal(
    speechRouteReadiness({ ...base, secret: secrets({ cortiClientId: "id" }) }),
    "needsKey"
  );
  assert.equal(
    speechRouteReadiness({
      ...base,
      secret: secrets({ cortiClientId: "id", cortiClientSecret: "s" }),
    }),
    "ready"
  );
});

test("the bar's old check missed xAI and Mistral; this one knows every speech provider", () => {
  for (const [provider, field] of [
    ["xai", "xaiApiKey"],
    ["mistral", "mistralApiKey"],
    ["groq", "groqApiKey"],
    ["tinfoil", "tinfoilApiKey"],
  ]) {
    const base = { transcriptionMode: "providers", provider, model: "m" };
    assert.equal(speechRouteReadiness({ ...base, secret: secrets({}) }), "needsKey", provider);
    assert.equal(
      speechRouteReadiness({ ...base, secret: secrets({ [field]: "k" }) }),
      "ready",
      provider
    );
  }
});

test("a provider the meeting route cannot stream through reads as no model", () => {
  for (const provider of ["custom", "", "nope"]) {
    assert.equal(
      speechRouteReadiness({
        transcriptionMode: "providers",
        provider,
        model: "whisper-1",
        secret: secrets({ openaiApiKey: "sk-x" }),
      }),
      "needsModel",
      provider || "(empty)"
    );
  }
});

test("local and self-hosted engines are ready as far as credentials go", () => {
  for (const transcriptionMode of ["local", "self-hosted"]) {
    assert.equal(
      speechRouteReadiness({ transcriptionMode, provider: "", model: "", secret: secrets({}) }),
      "ready"
    );
  }
});
