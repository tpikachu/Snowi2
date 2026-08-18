const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/meetingTranscriptionRouting.js");

const byokProviders = [
  {
    id: "openai",
    models: [{ id: "gpt-4o-mini-transcribe" }, { id: "gpt-4o-transcribe" }],
  },
  { id: "corti", models: [{ id: "corti-transcribe" }] },
  { id: "tinfoil", models: [{ id: "voxtral-mini-4b-realtime" }] },
];

const baseOptions = {
  transcriptionMode: "providers",
  language: "en",
  localProvider: "whisper",
  whisperModel: "small",
  parakeetModel: "parakeet-tdt-0.6b-v3",
  selectedProvider: "tinfoil",
  selectedModel: "voxtral-mini-4b-realtime",
  byokProviders,
  cortiEnvironment: "us",
  cortiTenant: "tenant",
  keyterms: ["Snowi"],
};

test("providers mode routes Tinfoil through its realtime client", async () => {
  const { resolveMeetingTranscriptionOptions } = await load();

  assert.deepEqual(resolveMeetingTranscriptionOptions(baseOptions), {
    provider: "tinfoil-realtime",
    model: "voxtral-mini-4b-realtime",
    mode: "byok",
    language: "en",
  });
});

test("BYOK OpenAI never downgrades to managed cloud when its key is unavailable", async () => {
  const { resolveMeetingTranscriptionOptions } = await load();

  assert.deepEqual(
    resolveMeetingTranscriptionOptions({
      ...baseOptions,
      selectedProvider: "openai",
      selectedModel: "gpt-4o-mini-transcribe",
    }),
    {
      provider: "openai-realtime",
      model: "gpt-4o-mini-transcribe",
      mode: "byok",
      language: "en",
    }
  );
});

test("self-hosted mode never follows a stale Tinfoil provider", async () => {
  const { resolveMeetingTranscriptionOptions } = await load();

  assert.throws(
    () =>
      resolveMeetingTranscriptionOptions({
        ...baseOptions,
        transcriptionMode: "self-hosted",
      }),
    /Self-hosted realtime transcription is not supported/
  );
});

test("local mode wins over stale cloud provider state", async () => {
  const { resolveMeetingTranscriptionOptions } = await load();

  assert.deepEqual(
    resolveMeetingTranscriptionOptions({
      ...baseOptions,
      transcriptionMode: "local",
      localProvider: "nvidia",
      parakeetModel: "nemotron-speech-streaming-en-0.6b",
    }),
    {
      provider: "local",
      localProvider: "nvidia",
      localModel: "nemotron-speech-streaming-en-0.6b",
      language: "en",
    }
  );
});

test("the removed managed cloud mode is rejected like any unsupported mode", async () => {
  const { resolveMeetingTranscriptionOptions } = await load();

  assert.throws(
    () =>
      resolveMeetingTranscriptionOptions({
        ...baseOptions,
        transcriptionMode: "openwhispr",
      }),
    /Unsupported Note Recording transcription mode/
  );
});

test("Corti keeps the meeting-specific connection settings", async () => {
  const { resolveMeetingTranscriptionOptions } = await load();

  assert.deepEqual(
    resolveMeetingTranscriptionOptions({
      ...baseOptions,
      selectedProvider: "corti",
      selectedModel: "corti-transcribe",
    }),
    {
      provider: "corti-realtime",
      model: "corti-transcribe",
      mode: "byok",
      language: "en",
      environment: "us",
      tenant: "tenant",
      keyterms: ["Snowi"],
    }
  );
});

test("unknown and custom providers fail closed", async () => {
  const { resolveMeetingTranscriptionOptions } = await load();

  for (const selectedProvider of ["custom", "groq", "", undefined]) {
    assert.throws(
      () =>
        resolveMeetingTranscriptionOptions({
          ...baseOptions,
          selectedProvider,
        }),
      /Unsupported Note Recording provider/
    );
  }
});
