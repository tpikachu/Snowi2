const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/reasoningRouting.js");

test("cloud provider maps to the providers mode", async () => {
  const { deriveReasoningMode } = await load();
  assert.equal(deriveReasoningMode("corti"), "providers");
});

test("custom provider maps to the self-hosted mode", async () => {
  const { deriveReasoningMode } = await load();
  assert.equal(deriveReasoningMode("custom"), "self-hosted");
});

test("fan-out routes provider, model and mode to all five scopes", async () => {
  const { buildReasoningScopePatches } = await load();
  const { dictationCleanup, actions, dictationAgent, chatIntelligence, dictationTranslation } =
    buildReasoningScopePatches(
      {
        useCleanupModel: true,
        cleanupProvider: "corti",
        cleanupModel: "corti-s1-instant",
        cleanupCloudMode: "byok",
      },
      "providers"
    );

  assert.equal(dictationCleanup.cleanupProvider, "corti");
  assert.equal(dictationCleanup.cleanupModel, "corti-s1-instant");
  assert.equal(dictationCleanup.cleanupMode, "providers");

  for (const scope of [actions, dictationAgent, chatIntelligence, dictationTranslation]) {
    assert.equal(scope.provider, "corti");
    assert.equal(scope.model, "corti-s1-instant");
    assert.equal(scope.cloudMode, "byok");
    assert.equal(scope.mode, "providers");
  }
});

test("fan-out with partial settings only mirrors the provided routing fields", async () => {
  const { buildReasoningScopePatches } = await load();
  const { dictationCleanup, actions, dictationAgent, chatIntelligence, dictationTranslation } =
    buildReasoningScopePatches({ useCleanupModel: true }, "providers");

  assert.equal(dictationCleanup.useCleanupModel, true);
  assert.equal(dictationCleanup.cleanupMode, "providers");
  assert.equal("cleanupProvider" in dictationCleanup, false);

  for (const scope of [actions, dictationAgent, chatIntelligence, dictationTranslation]) {
    assert.equal(scope.mode, "providers");
    assert.equal("provider" in scope, false);
    assert.equal("model" in scope, false);
    assert.equal("cloudMode" in scope, false);
  }
});

test("onboarding routes transcription and reasoning to corti in the eu region with an api key", async () => {
  const { buildCortiOnboardingPayloads } = await load();
  const { transcription, reasoning } = buildCortiOnboardingPayloads(
    { id: "corti", models: [{ id: "corti-transcribe" }] },
    { id: "corti", models: [{ id: "corti-s1-instant" }, { id: "corti-s1" }] },
    "eu",
    true
  );

  assert.deepEqual(transcription, {
    useLocalWhisper: false,
    cloudTranscriptionMode: "byok",
    cloudTranscriptionProvider: "corti",
    cloudTranscriptionModel: "corti-transcribe",
  });
  assert.deepEqual(reasoning, {
    useCleanupModel: true,
    cleanupProvider: "corti",
    cleanupModel: "corti-s1-instant",
    cleanupCloudMode: "byok",
  });
});

test("onboarding forces cleanup enabled on the corti path", async () => {
  const { buildCortiOnboardingPayloads } = await load();
  const { reasoning } = buildCortiOnboardingPayloads(
    { id: "corti", models: [{ id: "corti-transcribe" }] },
    { id: "corti", models: [{ id: "corti-s1-instant" }] },
    "eu",
    true
  );
  assert.equal(reasoning.useCleanupModel, true);
});

test("us data region leaves reasoning on its default routing, transcription stays corti", async () => {
  const { buildCortiOnboardingPayloads } = await load();
  const { transcription, reasoning } = buildCortiOnboardingPayloads(
    { id: "corti", models: [{ id: "corti-transcribe" }] },
    { id: "corti", models: [{ id: "corti-s1-instant" }] },
    "us",
    true
  );

  assert.equal(reasoning, null);
  assert.equal(transcription.cloudTranscriptionProvider, "corti");
});

test("eu region without an api key leaves reasoning on its default routing", async () => {
  const { buildCortiOnboardingPayloads } = await load();
  const { reasoning } = buildCortiOnboardingPayloads(
    { id: "corti", models: [{ id: "corti-transcribe" }] },
    { id: "corti", models: [{ id: "corti-s1-instant" }] },
    "eu",
    false
  );
  assert.equal(reasoning, null);
});

test("undefined data region leaves reasoning on its default routing", async () => {
  const { buildCortiOnboardingPayloads } = await load();
  const { reasoning } = buildCortiOnboardingPayloads(
    { id: "corti", models: [{ id: "corti-transcribe" }] },
    { id: "corti", models: [{ id: "corti-s1-instant" }] },
    undefined,
    true
  );
  assert.equal(reasoning, null);
});

test("missing corti reasoning provider leaves reasoning on its default routing", async () => {
  const { buildCortiOnboardingPayloads } = await load();
  const { transcription, reasoning } = buildCortiOnboardingPayloads(
    { id: "corti", models: [{ id: "corti-transcribe" }] },
    undefined,
    "eu",
    true
  );

  assert.equal(reasoning, null);
  assert.equal(transcription.cloudTranscriptionProvider, "corti");
});

test("corti reasoning provider with empty models leaves reasoning on its default routing", async () => {
  const { buildCortiOnboardingPayloads } = await load();
  const { reasoning } = buildCortiOnboardingPayloads(
    { id: "corti", models: [{ id: "corti-transcribe" }] },
    { id: "corti", models: [] },
    "eu",
    true
  );
  assert.equal(reasoning, null);
});

test("a scope inherits the fallback key when it inherits the endpoint", async () => {
  const { inheritsFallbackEndpoint } = await load();
  assert.equal(inheritsFallbackEndpoint({ mode: "self-hosted" }, "self-hosted"), true);
});

test("a scope on its own remote url keeps its own key", async () => {
  const { inheritsFallbackEndpoint } = await load();
  assert.equal(
    inheritsFallbackEndpoint(
      { mode: "self-hosted", remoteUrl: "http://host:8080/v1" },
      "self-hosted"
    ),
    false
  );
});

test("a scope on its own cloud base url keeps its own key", async () => {
  const { inheritsFallbackEndpoint } = await load();
  assert.equal(
    inheritsFallbackEndpoint(
      { mode: "providers", cloudBaseUrl: "https://api.example.com/v1" },
      "providers"
    ),
    false
  );
});

test("a differing mode never borrows the key (regression: key sent to the wrong host)", async () => {
  const { inheritsFallbackEndpoint } = await load();
  assert.equal(inheritsFallbackEndpoint({ mode: "providers" }, "self-hosted"), false);
});

test("no fallback scope means nothing to inherit", async () => {
  const { inheritsFallbackEndpoint } = await load();
  assert.equal(inheritsFallbackEndpoint({ mode: "providers" }, undefined), false);
});
