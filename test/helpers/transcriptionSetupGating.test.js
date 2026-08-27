const test = require("node:test");
const assert = require("node:assert/strict");

const { canProceedSetup } = require("../../src/components/onboarding/transcriptionSetupGating.ts");

const EMPTY_KEYS = {
  openaiApiKey: "",
  groqApiKey: "",
  xaiApiKey: "",
  mistralApiKey: "",
  cortiClientId: "",
  cortiClientSecret: "",
  tinfoilApiKey: "",
};

const localGate = (overrides = {}) => ({
  useLocalWhisper: true,
  localTranscriptionProvider: "nvidia",
  whisperModel: "",
  parakeetModel: "parakeet-tdt-0.6b-v3",
  modelDownloaded: false,
  downloadActive: false,
  cloudTranscriptionProvider: "openai",
  keys: EMPTY_KEYS,
  ...overrides,
});

test("local mode passes with the model on disk", () => {
  assert.equal(canProceedSetup(localGate({ modelDownloaded: true })), true);
});

test("an active download counts as complete — onboarding must not wait on bandwidth", () => {
  assert.equal(canProceedSetup(localGate({ downloadActive: true })), true);
});

test("local mode blocks with no model selected, even mid-download", () => {
  assert.equal(
    canProceedSetup(localGate({ parakeetModel: "", downloadActive: true })),
    false,
    "an empty selection means nothing was chosen to download"
  );
});

test("local mode blocks with nothing on disk and nothing downloading", () => {
  assert.equal(canProceedSetup(localGate()), false);
});

test("the provider decides which model field gates", () => {
  const gate = localGate({
    localTranscriptionProvider: "whisper",
    whisperModel: "",
    parakeetModel: "parakeet-tdt-0.6b-v3",
    modelDownloaded: true,
  });
  assert.equal(canProceedSetup(gate), false, "whisper provider must not pass on a parakeet model");
  assert.equal(canProceedSetup({ ...gate, whisperModel: "base" }), true);
});

test("cloud providers gate on their own keys", () => {
  const cloud = (provider, keys) =>
    canProceedSetup({
      ...localGate({ useLocalWhisper: false, cloudTranscriptionProvider: provider }),
      keys: { ...EMPTY_KEYS, ...keys },
    });

  assert.equal(cloud("openai", {}), false);
  assert.equal(cloud("openai", { openaiApiKey: "sk-x" }), true);
  assert.equal(cloud("groq", { openaiApiKey: "sk-x" }), false);
  assert.equal(cloud("groq", { groqApiKey: "gsk-x" }), true);
  assert.equal(cloud("corti", { cortiClientId: "id" }), false, "Corti needs both halves");
  assert.equal(cloud("corti", { cortiClientId: "id", cortiClientSecret: "secret" }), true);
  assert.equal(cloud("custom", {}), true, "custom endpoints may be keyless");
  assert.equal(cloud("unknown-future", {}), false, "unknown providers fall back to OpenAI's key");
  assert.equal(cloud("unknown-future", { openaiApiKey: "sk-x" }), true);
});

test("whitespace keys do not count", () => {
  assert.equal(
    canProceedSetup({
      ...localGate({ useLocalWhisper: false }),
      keys: { ...EMPTY_KEYS, openaiApiKey: "   " },
    }),
    false
  );
});
