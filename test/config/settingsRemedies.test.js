const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer } = require("../lib/rendererTestHarness");

async function load(t) {
  const vite = await createRendererServer(t, { cachePrefix: "snowy-remedies-" });
  return await vite.ssrLoadModule("/config/settingsRemedies.ts");
}

test("a coded configuration failure earns a remedy", async (t) => {
  const { transcriptionRemedy } = await load(t);

  assert.equal(
    transcriptionRemedy("upload", { code: "CUSTOM_ENDPOINT_INVALID" }),
    "configureUploadTranscription"
  );
  assert.equal(
    transcriptionRemedy("meeting", { code: "MISSING_API_KEY" }),
    "configureMeetingTranscription"
  );
});

test("each scope lands on its own settings tab", async (t) => {
  const { transcriptionRemedy, remedyTarget } = await load(t);

  const failure = { code: "MISSING_API_KEY" };
  assert.deepEqual(remedyTarget(transcriptionRemedy("meeting", failure)), {
    section: "speechToText",
    panel: "noteRecording",
  });
  assert.deepEqual(remedyTarget(transcriptionRemedy("upload", failure)), {
    section: "speechToText",
    panel: "upload",
  });
  assert.deepEqual(remedyTarget(transcriptionRemedy("dictation", failure)), {
    section: "speechToText",
    panel: "dictation",
  });
});

test("uncoded main-process messages are still recognised", async (t) => {
  const { isConfigurationFailure } = await load(t);

  // Verbatim from ipcHandlers.js and tinfoilTranscription.js, which throw bare
  // Errors and predate any code.
  for (const message of [
    "xAI API key not configured",
    "Corti credentials not configured. Add them in Settings.",
    "Self-hosted transcription URL is not configured",
    'Whisper model "base" not downloaded. Please download it from Settings.',
  ]) {
    assert.equal(isConfigurationFailure({ message }), true, message);
  }
});

test("a runtime failure gets no button, because Settings would not help", async (t) => {
  const { isConfigurationFailure, transcriptionRemedy } = await load(t);

  // The cost of a false positive: sending someone to a settings page to fix a
  // silent recording, then having them come back none the wiser.
  for (const message of [
    "No speech detected in the recording",
    "Network request failed",
    "The transcription service returned 500",
    "ffmpeg exited with code 1",
    "Rate limit exceeded",
  ]) {
    assert.equal(isConfigurationFailure({ message }), false, message);
  }

  assert.equal(transcriptionRemedy("upload", { code: "NO_SPEECH_DETECTED" }), null);
});

test("nothing at all is not a configuration failure", async (t) => {
  const { isConfigurationFailure } = await load(t);

  assert.equal(isConfigurationFailure(null), false);
  assert.equal(isConfigurationFailure(undefined), false);
  assert.equal(isConfigurationFailure({}), false);
  assert.equal(isConfigurationFailure({ message: "" }), false);
  assert.equal(isConfigurationFailure({ message: "   " }), false);
});

test("every remedy resolves to a real settings target", async (t) => {
  const { SETTINGS_REMEDIES, remedyTarget } = await load(t);

  const sections = new Set(["general", "hotkeys", "speechToText", "llms", "privacyData", "system"]);
  for (const remedy of Object.keys(SETTINGS_REMEDIES)) {
    const target = remedyTarget(remedy);
    // A typo here is a button that opens Settings on the wrong page, which is
    // worse than no button: it looks like the app disagrees about the problem.
    assert.ok(sections.has(target.section), `${remedy} → unknown section ${target.section}`);
    assert.ok(target.panel, `${remedy} names no panel`);
  }
});
