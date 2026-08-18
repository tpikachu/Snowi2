const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/dictationRouting.js");

test("voice agent hotkey routes to the agent without a wake word", async () => {
  const { resolveDictationRouteKind } = await load();

  assert.equal(
    resolveDictationRouteKind({
      cleanupReachable: true,
      agentReachable: true,
      agentInvoked: false,
      voiceAgentRequested: true,
    }),
    "agent"
  );
});

test("voice agent hotkey never triggers cleanup", async () => {
  const { resolveDictationRouteKind } = await load();

  // Even with cleanup enabled and reachable, a voice agent recording with an
  // unreachable agent returns the raw transcript instead of falling back.
  assert.equal(
    resolveDictationRouteKind({
      cleanupReachable: true,
      agentReachable: false,
      agentInvoked: false,
      voiceAgentRequested: true,
    }),
    "skip"
  );
});

test("voice agent hotkey ignores the wake word state", async () => {
  const { resolveDictationRouteKind } = await load();

  assert.equal(
    resolveDictationRouteKind({
      cleanupReachable: false,
      agentReachable: true,
      agentInvoked: true,
      voiceAgentRequested: true,
    }),
    "agent"
  );
});

test("normal dictation with wake word routes to the agent", async () => {
  const { resolveDictationRouteKind } = await load();

  assert.equal(
    resolveDictationRouteKind({
      cleanupReachable: true,
      agentReachable: true,
      agentInvoked: true,
      voiceAgentRequested: false,
    }),
    "agent"
  );
});

test("normal dictation without wake word routes to cleanup", async () => {
  const { resolveDictationRouteKind } = await load();

  assert.equal(
    resolveDictationRouteKind({
      cleanupReachable: true,
      agentReachable: true,
      agentInvoked: false,
      voiceAgentRequested: false,
    }),
    "cleanup"
  );
});

test("wake word with unreachable agent falls back to cleanup", async () => {
  const { resolveDictationRouteKind } = await load();

  assert.equal(
    resolveDictationRouteKind({
      cleanupReachable: true,
      agentReachable: false,
      agentInvoked: true,
      voiceAgentRequested: false,
    }),
    "cleanup"
  );
});

test("skips reasoning when nothing is reachable", async () => {
  const { resolveDictationRouteKind } = await load();

  assert.equal(
    resolveDictationRouteKind({
      cleanupReachable: false,
      agentReachable: false,
      agentInvoked: false,
      voiceAgentRequested: false,
    }),
    "skip"
  );
});

test("agent is reachable in self-hosted mode without an explicit model", async () => {
  const { resolveDictationAgentReachability } = await load();

  assert.equal(
    resolveDictationAgentReachability({
      useDictationAgent: true,
      dictationAgentMode: "self-hosted",
      dictationAgentProvider: undefined,
      dictationAgentModel: "",
      isSelfHostedAgent: true,
    }),
    true
  );
});

test("agent is unreachable with an empty model on a model-required provider", async () => {
  const { resolveDictationAgentReachability } = await load();

  assert.equal(
    resolveDictationAgentReachability({
      useDictationAgent: true,
      dictationAgentMode: "providers",
      dictationAgentProvider: "openai",
      dictationAgentModel: "   ",
      isSelfHostedAgent: false,
    }),
    false
  );
});

test("agent is reachable with an explicit model (BYOK/local/enterprise)", async () => {
  const { resolveDictationAgentReachability } = await load();

  assert.equal(
    resolveDictationAgentReachability({
      useDictationAgent: true,
      dictationAgentMode: "providers",
      dictationAgentProvider: "openai",
      dictationAgentModel: "gpt-5.5",
      isSelfHostedAgent: false,
    }),
    true
  );
});

test("disabling the dictation agent overrides reachability", async () => {
  const { resolveDictationAgentReachability } = await load();

  assert.equal(
    resolveDictationAgentReachability({
      useDictationAgent: false,
      dictationAgentMode: "self-hosted",
      dictationAgentProvider: undefined,
      dictationAgentModel: "",
      isSelfHostedAgent: true,
    }),
    false
  );
});

test("translation hotkey routes to translation when reachable", async () => {
  const { resolveDictationRouteKind } = await load();

  assert.equal(
    resolveDictationRouteKind({
      cleanupReachable: true,
      agentReachable: true,
      agentInvoked: false,
      voiceAgentRequested: false,
      translationRequested: true,
      translationReachable: true,
    }),
    "translation"
  );
});

test("translation hotkey ignores the wake word state", async () => {
  const { resolveDictationRouteKind } = await load();

  assert.equal(
    resolveDictationRouteKind({
      cleanupReachable: false,
      agentReachable: true,
      agentInvoked: true,
      voiceAgentRequested: false,
      translationRequested: true,
      translationReachable: true,
    }),
    "translation"
  );
});

test("unreachable translation degrades to cleanup, not to the agent", async () => {
  const { resolveDictationRouteKind } = await load();

  // Deliberately different from the voice agent's hard skip: a dictation meant
  // for translation is still a useful dictation, so keep the cleanup.
  assert.equal(
    resolveDictationRouteKind({
      cleanupReachable: true,
      agentReachable: true,
      agentInvoked: true,
      voiceAgentRequested: false,
      translationRequested: true,
      translationReachable: false,
    }),
    "cleanup"
  );
});

test("unreachable translation with unreachable cleanup skips reasoning", async () => {
  const { resolveDictationRouteKind } = await load();

  assert.equal(
    resolveDictationRouteKind({
      cleanupReachable: false,
      agentReachable: true,
      agentInvoked: false,
      voiceAgentRequested: false,
      translationRequested: true,
      translationReachable: false,
    }),
    "skip"
  );
});

test("normal dictation never takes the translation route", async () => {
  const { resolveDictationRouteKind } = await load();

  assert.equal(
    resolveDictationRouteKind({
      cleanupReachable: true,
      agentReachable: false,
      agentInvoked: false,
      voiceAgentRequested: false,
      translationRequested: false,
      translationReachable: true,
    }),
    "cleanup"
  );
});

test("translation is unreachable when disabled", async () => {
  const { resolveDictationTranslationReachability } = await load();

  assert.equal(
    resolveDictationTranslationReachability({
      useDictationTranslation: false,
      translationTargetLanguage: "it",
      translationMode: "providers",
      translationProvider: "openai",
      translationModel: "gpt-5-mini",
      isSelfHostedTranslation: false,
    }),
    false
  );
});

test("translation is unreachable without a target language", async () => {
  const { resolveDictationTranslationReachability } = await load();

  assert.equal(
    resolveDictationTranslationReachability({
      useDictationTranslation: true,
      translationTargetLanguage: "   ",
      translationMode: "providers",
      translationProvider: "openai",
      translationModel: "gpt-5-mini",
      isSelfHostedTranslation: false,
    }),
    false
  );
});

test("translation is reachable in self-hosted mode without an explicit model", async () => {
  const { resolveDictationTranslationReachability } = await load();

  assert.equal(
    resolveDictationTranslationReachability({
      useDictationTranslation: true,
      translationTargetLanguage: "it",
      translationMode: "self-hosted",
      translationProvider: undefined,
      translationModel: "",
      isSelfHostedTranslation: true,
    }),
    true
  );
});

test("translation needs a model on model-required providers", async () => {
  const { resolveDictationTranslationReachability } = await load();

  assert.equal(
    resolveDictationTranslationReachability({
      useDictationTranslation: true,
      translationTargetLanguage: "it",
      translationMode: "providers",
      translationProvider: "openai",
      translationModel: "  ",
      isSelfHostedTranslation: false,
    }),
    false
  );

  assert.equal(
    resolveDictationTranslationReachability({
      useDictationTranslation: true,
      translationTargetLanguage: "it",
      translationMode: "providers",
      translationProvider: "openai",
      translationModel: "qwen3:8b",
      isSelfHostedTranslation: false,
    }),
    true
  );
});

test("local mode resolves the local provider, not stale provider state", async () => {
  const { resolveDictationAgentProvider } = await load();

  assert.equal(
    resolveDictationAgentProvider({
      dictationAgentMode: "local",
      dictationAgentProvider: "qwen",
    }),
    "local"
  );
});

test("BYOK providers mode passes the stored provider through", async () => {
  const { resolveDictationAgentProvider } = await load();

  assert.equal(
    resolveDictationAgentProvider({
      dictationAgentMode: "providers",
      dictationAgentProvider: "anthropic",
    }),
    "anthropic"
  );
});

test("blank stored provider resolves to undefined outside local mode", async () => {
  const { resolveDictationAgentProvider } = await load();

  assert.equal(
    resolveDictationAgentProvider({
      dictationAgentMode: "providers",
      dictationAgentProvider: "  ",
    }),
    undefined
  );
});

test("self-hosted mode clears stale providers", async () => {
  const { resolveDictationAgentProvider } = await load();

  assert.equal(
    resolveDictationAgentProvider({
      dictationAgentMode: "self-hosted",
      dictationAgentProvider: "openai",
    }),
    undefined
  );
});

test("self-hosted mode is unreachable without its endpoint", async () => {
  const { resolveDictationAgentReachability } = await load();

  assert.equal(
    resolveDictationAgentReachability({
      useDictationAgent: true,
      dictationAgentMode: "self-hosted",
      dictationAgentProvider: undefined,
      dictationAgentModel: "gpt-5-mini",
      isSelfHostedAgent: false,
    }),
    false
  );
});

test("provider and enterprise modes require an explicit provider", async () => {
  const { resolveDictationAgentReachability } = await load();

  for (const dictationAgentMode of ["providers", "enterprise"]) {
    assert.equal(
      resolveDictationAgentReachability({
        useDictationAgent: true,
        dictationAgentMode,
        dictationAgentProvider: undefined,
        dictationAgentModel: "gpt-5-mini",
        isSelfHostedAgent: false,
      }),
      false
    );
  }
});

test("display provider follows the active mode instead of stale state", async () => {
  const { resolveDictationAgentDisplayProvider } = await load();

  assert.equal(
    resolveDictationAgentDisplayProvider({
      dictationAgentMode: "local",
      dictationAgentProvider: "openai",
    }),
    "local"
  );
  assert.equal(
    resolveDictationAgentDisplayProvider({
      dictationAgentMode: "self-hosted",
      dictationAgentProvider: "openai",
    }),
    "self-hosted"
  );
});

test("translation provider: mode wins over stale provider state", async () => {
  const { resolveTranslationProviderId } = await load();

  for (const [translationMode, translationProvider, expected] of [
    ["providers", " groq ", "groq"],
    ["local", "qwen", "local"],
    ["local", "openai", "local"],
    ["self-hosted", "openai", undefined],
  ]) {
    assert.equal(
      resolveTranslationProviderId({
        translationMode,
        translationProvider,
      }),
      expected
    );
  }
});

test("translation provider: empty local provider routes to llama.cpp", async () => {
  const { resolveTranslationProviderId } = await load();

  assert.equal(
    resolveTranslationProviderId({
      translationMode: "local",
      translationProvider: "",
    }),
    "local"
  );
});

test("translation provider: incomplete provider modes fail closed", async () => {
  const { resolveTranslationProviderId } = await load();

  for (const translationMode of ["providers", "enterprise"]) {
    assert.equal(
      resolveTranslationProviderId({
        translationMode,
        translationProvider: "  ",
      }),
      undefined
    );
  }
});

// Screen-context image routing on the agent route.
const imageTarget = {
  hasScreenContext: true,
  visionOverrideActive: false,
  visionProviderImageWired: false,
  baseProviderImageWired: true,
  baseModelSupportsVision: false,
};

test("no captured screenshot never attaches", async () => {
  const { resolveAgentImageTarget } = await load();

  assert.deepEqual(
    resolveAgentImageTarget({
      ...imageTarget,
      hasScreenContext: false,
      visionOverrideActive: true,
      visionProviderImageWired: true,
      baseModelSupportsVision: true,
    }),
    { attach: false, useVisionOverride: false }
  );
});

test("BYOK base model attaches only when the registry marks it vision-capable", async () => {
  const { resolveAgentImageTarget } = await load();

  assert.deepEqual(resolveAgentImageTarget({ ...imageTarget, baseModelSupportsVision: true }), {
    attach: true,
    useVisionOverride: false,
  });
  assert.deepEqual(resolveAgentImageTarget(imageTarget), {
    attach: false,
    useVisionOverride: false,
  });
});

test("an unwired base provider never gets the image", async () => {
  const { resolveAgentImageTarget } = await load();

  assert.deepEqual(
    resolveAgentImageTarget({
      ...imageTarget,
      baseProviderImageWired: false,
      baseModelSupportsVision: true,
    }),
    { attach: false, useVisionOverride: false }
  );
});

test("an active vision override wins over the base model", async () => {
  const { resolveAgentImageTarget } = await load();

  assert.deepEqual(
    resolveAgentImageTarget({
      ...imageTarget,
      visionOverrideActive: true,
      visionProviderImageWired: true,
      baseModelSupportsVision: true,
    }),
    { attach: true, useVisionOverride: true }
  );
});

test("an active override lets a text-only base agent still get screen context", async () => {
  const { resolveAgentImageTarget } = await load();

  assert.deepEqual(
    resolveAgentImageTarget({
      ...imageTarget,
      visionOverrideActive: true,
      visionProviderImageWired: true,
      baseProviderImageWired: false,
    }),
    { attach: true, useVisionOverride: true }
  );
});

test("an override on a provider that can't send images drops the screenshot", async () => {
  const { resolveAgentImageTarget } = await load();

  // The user pointed the override at a provider whose client has no image
  // path; quietly using the base model instead would ignore that choice.
  assert.deepEqual(
    resolveAgentImageTarget({
      ...imageTarget,
      visionOverrideActive: true,
      visionProviderImageWired: false,
    }),
    { attach: false, useVisionOverride: false }
  );
});

test("an override toggled on but never configured falls back to the base rules", async () => {
  const { resolveAgentImageTarget } = await load();

  // Unconfigured, the vision scope just inherits the agent's own config, so
  // the base capability checks decide — never force an image onto a
  // text-only model.
  assert.deepEqual(
    resolveAgentImageTarget({
      ...imageTarget,
      visionOverrideActive: false,
      baseModelSupportsVision: true,
    }),
    { attach: true, useVisionOverride: false }
  );
  assert.deepEqual(resolveAgentImageTarget({ ...imageTarget, visionOverrideActive: false }), {
    attach: false,
    useVisionOverride: false,
  });
});
