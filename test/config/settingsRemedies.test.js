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

test("a missing local inference runtime is a configuration failure", async (t) => {
  const { isConfigurationFailure, llmRemedy } = await load(t);

  // Verbatim from modelManagerBridge.js. It reads like a broken install, but
  // the fix is in Settings either way: pick a cloud provider, or download the
  // local model that ships the runtime.
  const message = "llama-server binary not found. Please ensure the app is installed correctly.";
  assert.equal(isConfigurationFailure({ message }), true);
  assert.equal(llmRemedy("noteFormatting", { message }), "configureNoteFormatting");

  // And by code, for the paths that keep it across IPC.
  assert.equal(isConfigurationFailure({ code: "LLAMASERVER_NOT_FOUND" }), true);
});

test("the binary pattern is anchored to a named runtime", async (t) => {
  const { isConfigurationFailure } = await load(t);

  // A bare "not found" is a whole class of runtime errors that Settings cannot
  // fix, so the pattern names the binaries rather than matching the phrase.
  assert.equal(isConfigurationFailure({ message: "File not found" }), false);
  assert.equal(isConfigurationFailure({ message: "Note not found" }), false);
  assert.equal(isConfigurationFailure({ message: "404 not found" }), false);
  assert.equal(
    isConfigurationFailure({ message: "whisper-server binary not found. Reinstall." }),
    true
  );
});

test("a reachable model that simply failed gets no button", async (t) => {
  const { llmRemedy } = await load(t);

  // A rate limit is worth retrying; sending the user to Settings would be a
  // dead end and would imply they configured something wrong.
  assert.equal(llmRemedy("noteFormatting", { message: "Rate limit exceeded" }), null);
  assert.equal(llmRemedy("chatIntelligence", { message: "The model returned 503" }), null);
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
