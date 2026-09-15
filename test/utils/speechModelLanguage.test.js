const test = require("node:test");
const assert = require("node:assert/strict");

const { speechModelLanguage } = require("../../src/utils/languageSupport.ts");

test("every English variant gets the English pair", () => {
  // The registry stores regions; the raw value was once compared to "en",
  // which sent every English speaker to the multilingual pair.
  for (const language of ["en", "en-US", "en-GB", "en-AU"]) {
    assert.equal(speechModelLanguage(language), "en", language);
  }
});

test("any other language, and auto-detect, get the multilingual pair", () => {
  for (const language of ["auto", "de", "es-ES", "ja", "zh-CN", "", null, undefined]) {
    assert.equal(speechModelLanguage(language), "multilingual", String(language));
  }
});
