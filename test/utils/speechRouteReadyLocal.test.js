const test = require("node:test");
const assert = require("node:assert/strict");
const { speechRouteReadiness } = require("../../src/utils/speechRouteReady.ts");

const local = (overrides) =>
  speechRouteReadiness({
    transcriptionMode: "local",
    provider: "",
    model: "",
    secret: () => "",
    localProvider: "nvidia",
    localModel: "nemotron-speech-streaming-en-0.6b",
    localFallbackModel: "parakeet-tdt-0.6b-v3",
    installed: () => true,
    ...overrides,
  });

test("a local model on disk is ready", () => {
  assert.equal(local({}), "ready");
});

test("a local model picked but not on disk needs its download", () => {
  assert.equal(local({ installed: () => false }), "needsDownload");
});

test("with the disk not listed yet a local engine is taken as ready", () => {
  assert.equal(local({ installed: () => null }), "ready");
  assert.equal(local({ installed: undefined }), "ready");
});

test("no pick at all rides the route's fallback: ready on disk, otherwise a model is wanted", () => {
  const seen = [];
  assert.equal(
    local({
      localModel: "",
      installed: (provider, model) => {
        seen.push([provider, model]);
        return true;
      },
    }),
    "ready"
  );
  assert.deepEqual(seen, [["nvidia", "parakeet-tdt-0.6b-v3"]]);
  assert.equal(local({ localModel: "", installed: () => false }), "needsModel");
  assert.equal(local({ localModel: "", localFallbackModel: "" }), "needsModel");
});

test("the cloud judgement is unchanged", () => {
  assert.equal(
    speechRouteReadiness({
      transcriptionMode: "providers",
      provider: "openai",
      model: "gpt-4o-mini-transcribe",
      secret: () => "",
    }),
    "needsKey"
  );
  assert.equal(
    speechRouteReadiness({
      transcriptionMode: "providers",
      provider: "openai",
      model: "",
      secret: () => "sk-x",
    }),
    "needsModel"
  );
});
