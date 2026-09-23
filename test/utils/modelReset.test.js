const test = require("node:test");
const assert = require("node:assert/strict");
const { planDownloadedModelsReset } = require("../../src/utils/modelReset.ts");

test("every speech scope goes back to the local engine with no model picked", () => {
  const { strings, booleans } = planDownloadedModelsReset();
  for (const scope of ["", "meeting", "upload"]) {
    const key = (name) => (scope ? scope + name[0].toUpperCase() + name.slice(1) : name);
    assert.equal(strings[key("transcriptionMode")], "local", scope);
    assert.equal(booleans[key("useLocalWhisper")], true, scope);
    assert.equal(strings[key("localTranscriptionProvider")], "nvidia", scope);
    assert.equal(strings[key("whisperModel")], "", scope);
    assert.equal(strings[key("parakeetModel")], "", scope);
    assert.equal(strings[key("cloudTranscriptionProvider")], "", scope);
    assert.equal(strings[key("cloudTranscriptionModel")], "", scope);
  }
  assert.equal(Object.keys(strings).length, 18);
  assert.equal(Object.keys(booleans).length, 3);
});

test("no API key is in the plan", () => {
  const { strings, booleans } = planDownloadedModelsReset();
  for (const key of [...Object.keys(strings), ...Object.keys(booleans)]) {
    assert.doesNotMatch(key, /apiKey|Key$|Secret|Token/i, key);
  }
});
