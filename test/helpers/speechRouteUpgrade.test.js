const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

/**
 * The meeting speech route on an install written by rc9, read by today's
 * store (client report, 2026-09-23: "the app is not generating the
 * transcription at all" — suspected an old-vs-new configuration conflict).
 * Each case is the localStorage rc9's onboarding or Settings left behind
 * (its defaults are identical to today's for every speech key, checked by
 * diffing the two stores' initial state); the assertion is the route a
 * meeting would start with, and what Home says about it.
 */
const MARKERS = { onboardingCompleted: "true", tourCompletedVersion: "999" };

async function loadStore(t, initialStorage, prefix) {
  installBrowserGlobals(t, { initialStorage: { ...MARKERS, ...initialStorage }, window: {} });
  const vite = await createRendererServer(t, { cachePrefix: prefix });
  const store = await vite.ssrLoadModule("/stores/settingsStore.ts");
  const routing = await vite.ssrLoadModule("/helpers/meetingTranscriptionRouting.js");
  const registry = await vite.ssrLoadModule("/models/ModelRegistry.ts");
  const route = () => {
    const state = store.useSettingsStore.getState();
    const resolved = store.selectResolvedMeetingTranscription(state);
    return routing.resolveMeetingTranscriptionOptions({
      transcriptionMode: resolved.transcriptionMode,
      language: "en",
      localProvider: resolved.localTranscriptionProvider,
      whisperModel: resolved.whisperModel,
      parakeetModel: resolved.parakeetModel,
      selectedProvider: resolved.cloudTranscriptionProvider,
      selectedModel: resolved.cloudTranscriptionModel,
      byokProviders: registry.getStreamingTranscriptionProviders(),
    });
  };
  const readiness = () => store.selectMeetingSpeechReadiness(store.useSettingsStore.getState());
  return { store, route, readiness };
}

// rc9 onboarding, "Set it up for me", English: updateTranscriptionSettings on
// the base scope plus the meeting setters (OnboardingFlow.applyRecommendation).
const RC9_LOCAL_NVIDIA = {
  useLocalWhisper: "true",
  localTranscriptionProvider: "nvidia",
  parakeetModel: "nemotron-speech-streaming-en-0.6b",
  transcriptionMode: "local",
  meetingTranscriptionMode: "local",
  meetingUseLocalWhisper: "true",
  meetingLocalTranscriptionProvider: "nvidia",
  meetingParakeetModel: "nemotron-speech-streaming-en-0.6b",
  meetingFollowsTranscription: "false",
};

// rc9 onboarding on a cloud provider: base keys only, the meeting scope
// derived (the finish step's meeting mirror).
const RC9_CLOUD_OPENAI = {
  useLocalWhisper: "false",
  transcriptionMode: "providers",
  cloudTranscriptionProvider: "openai",
  cloudTranscriptionModel: "gpt-4o-mini-transcribe",
  cloudTranscriptionMode: "byok",
  meetingTranscriptionMode: "providers",
  meetingUseLocalWhisper: "false",
  meetingCloudTranscriptionProvider: "openai",
  meetingCloudTranscriptionMode: "byok",
  meetingFollowsTranscription: "false",
};

// An install from before the meeting scope existed: base keys only, the
// follow flag never written, so the copy migration runs on this launch.
const PRE_MEETING_SCOPE = {
  useLocalWhisper: "true",
  localTranscriptionProvider: "nvidia",
  parakeetModel: "parakeet-tdt-0.6b-v3",
};

test("rc9's local NVIDIA setup starts a meeting on that model", async (t) => {
  const { route, readiness, store } = await loadStore(t, RC9_LOCAL_NVIDIA, "snowy-speech-up-a-");
  assert.deepEqual(
    [route().provider, route().localProvider, route().localModel],
    ["local", "nvidia", "nemotron-speech-streaming-en-0.6b"]
  );
  // The disk not listed yet: ready, as rc9 said. Listed without the model:
  // the honest answer, "needs download".
  assert.equal(readiness(), "ready");
  store.useSettingsStore.getState().setSpeechModelsOnDisk({ whisper: [], nvidia: [] });
  assert.equal(readiness(), "needsDownload");
  store.useSettingsStore
    .getState()
    .setSpeechModelsOnDisk({ whisper: [], nvidia: ["nemotron-speech-streaming-en-0.6b"] });
  assert.equal(readiness(), "ready");
});

test("rc9's cloud OpenAI setup starts a meeting on the OpenAI realtime route, ready only with its key", async (t) => {
  const { route, readiness, store } = await loadStore(t, RC9_CLOUD_OPENAI, "snowy-speech-up-b-");
  const r = route();
  assert.deepEqual(
    [r.provider, r.model, r.mode],
    ["openai-realtime", "gpt-4o-mini-transcribe", "byok"]
  );
  assert.equal(readiness(), "needsKey");
  store.useSettingsStore.setState({ openaiApiKey: "sk-on-disk" });
  assert.equal(readiness(), "ready");
});

test("an install from before the meeting scope inherits its base setup on this launch", async (t) => {
  const { route, readiness } = await loadStore(t, PRE_MEETING_SCOPE, "snowy-speech-up-c-");
  assert.deepEqual(
    [route().provider, route().localProvider, route().localModel],
    ["local", "nvidia", "parakeet-tdt-0.6b-v3"]
  );
  assert.equal(readiness(), "ready");
  assert.equal(localStorage.getItem("meetingLocalTranscriptionProvider"), "nvidia");
  assert.equal(localStorage.getItem("meetingFollowsTranscription"), "false");
});

test("a bare install with nothing written starts a meeting on Whisper base, and asks for its download once the disk is read", async (t) => {
  const { route, readiness, store } = await loadStore(t, {}, "snowy-speech-up-d-");
  assert.deepEqual(
    [route().provider, route().localProvider, route().localModel],
    ["local", "whisper", "base"]
  );
  // "base" is the store default, a pick as far as the route is concerned.
  store.useSettingsStore.getState().setSpeechModelsOnDisk({ whisper: [], nvidia: [] });
  assert.equal(readiness(), "needsDownload");
});
