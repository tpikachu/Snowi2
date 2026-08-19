const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

async function loadStore(t, initialStorage, cachePrefix) {
  installBrowserGlobals(t, { initialStorage });
  const vite = await createRendererServer(t, { cachePrefix });
  return await vite.ssrLoadModule("/stores/settingsStore.ts");
}

test("cloud dictation carries to note recording and upload", async (t) => {
  // What onboarding leaves behind when the user picks cloud transcription: the
  // dictation keys are written, the meeting and upload scopes never are.
  const { useSettingsStore, selectResolvedMeetingTranscription } = await loadStore(
    t,
    {
      meetingFollowsTranscription: "false",
      useLocalWhisper: "false",
      transcriptionMode: "providers",
      cloudTranscriptionProvider: "openai",
      cloudTranscriptionModel: "whisper-1",
    },
    "snowy-scope-inherit-cloud-"
  );

  const state = useSettingsStore.getState();
  // The bug this pins: meeting kept its own "local" default while every other
  // field inherited, so the first recording asked for a Whisper model the user
  // had deliberately not downloaded.
  assert.equal(state.meetingUseLocalWhisper, false);
  assert.equal(state.meetingTranscriptionMode, "providers");
  assert.equal(state.uploadUseLocalWhisper, false);
  assert.equal(selectResolvedMeetingTranscription(state).useLocalWhisper, false);
});

test("local dictation carries too — inheritance is not a cloud special case", async (t) => {
  const { useSettingsStore } = await loadStore(
    t,
    { meetingFollowsTranscription: "false", useLocalWhisper: "true", transcriptionMode: "local" },
    "snowy-scope-inherit-local-"
  );

  const state = useSettingsStore.getState();
  assert.equal(state.meetingUseLocalWhisper, true);
  assert.equal(state.meetingTranscriptionMode, "local");
});

test("an explicit meeting choice outranks the dictation lane", async (t) => {
  const { useSettingsStore } = await loadStore(
    t,
    {
      meetingFollowsTranscription: "false",
      useLocalWhisper: "false",
      transcriptionMode: "providers",
      // Someone who deliberately keeps meetings on-device while dictation goes
      // to the cloud must keep that, or the fix would quietly send their
      // meeting audio to a provider they opted out of.
      meetingUseLocalWhisper: "true",
      meetingTranscriptionMode: "local",
    },
    "snowy-scope-inherit-explicit-"
  );

  const state = useSettingsStore.getState();
  assert.equal(state.meetingUseLocalWhisper, true);
  assert.equal(state.meetingTranscriptionMode, "local");
  assert.equal(state.uploadUseLocalWhisper, false, "upload was not configured, so it still follows");
});

test("a stored mode alone still decides the lane for its scope", async (t) => {
  const { useSettingsStore } = await loadStore(
    t,
    {
      meetingFollowsTranscription: "false",
      useLocalWhisper: "true",
      transcriptionMode: "local",
      // Written by the Settings tab without the boolean beside it.
      meetingTranscriptionMode: "providers",
    },
    "snowy-scope-inherit-mode-only-"
  );

  assert.equal(useSettingsStore.getState().meetingUseLocalWhisper, false);
});

test("a stale dictation mode does not hand a scope a contradictory one", async (t) => {
  // The real state after onboarding picks cloud: migrateProviderSettings writes
  // transcriptionMode once at first launch, before any choice is made, and
  // updateTranscriptionSettings never rewrites it. So useLocalWhisper says
  // cloud while transcriptionMode still says local. Copying that verbatim would
  // give meetings a mode contradicting their own flag.
  const { useSettingsStore } = await loadStore(
    t,
    {
      meetingFollowsTranscription: "false",
      _providerSettingsMigrated: "1",
      useLocalWhisper: "false",
      transcriptionMode: "local",
      cloudTranscriptionProvider: "openai",
      cloudTranscriptionMode: "byok",
    },
    "snowy-scope-inherit-stale-"
  );

  const state = useSettingsStore.getState();
  assert.equal(state.meetingUseLocalWhisper, false);
  assert.equal(state.meetingTranscriptionMode, "providers");
});

test("a self-hosted dictation setup is inherited as self-hosted", async (t) => {
  const { useSettingsStore } = await loadStore(
    t,
    {
      meetingFollowsTranscription: "false",
      _providerSettingsMigrated: "1",
      useLocalWhisper: "false",
      transcriptionMode: "self-hosted",
      cloudTranscriptionProvider: "custom",
      cloudTranscriptionMode: "byok",
    },
    "snowy-scope-inherit-selfhosted-"
  );

  // Agrees with the lane, so it is kept rather than flattened to "providers".
  assert.equal(useSettingsStore.getState().meetingTranscriptionMode, "self-hosted");
});

test("mirroring pushes the dictation routing onto both derived scopes", async (t) => {
  const { useSettingsStore } = await loadStore(
    t,
    { meetingFollowsTranscription: "false", useLocalWhisper: "true", transcriptionMode: "local" },
    "snowy-scope-mirror-"
  );

  const s = useSettingsStore.getState();
  s.updateTranscriptionSettings({
    useLocalWhisper: false,
    cloudTranscriptionProvider: "openai",
    cloudTranscriptionModel: "whisper-1",
    cloudTranscriptionMode: "byok",
  });
  s.mirrorTranscriptionToDerivedScopes();

  const after = useSettingsStore.getState();
  assert.equal(after.meetingUseLocalWhisper, false);
  assert.equal(after.meetingCloudTranscriptionProvider, "openai");
  assert.equal(after.meetingCloudTranscriptionModel, "whisper-1");
  assert.equal(after.uploadUseLocalWhisper, false);
  assert.equal(after.uploadCloudTranscriptionProvider, "openai");
});
