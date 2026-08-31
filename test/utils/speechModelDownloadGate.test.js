const test = require("node:test");
const assert = require("node:assert/strict");

const { speechDownloadBlocksMeetingStart } = require("../../src/utils/speechModelDownloadGate.ts");

const base = {
  downloadingModel: "parakeet-tdt-0.6b-v3",
  meetingUsesLocalModel: true,
  meetingProvider: "nvidia",
  meetingWhisperModel: "base",
  meetingParakeetModel: "parakeet-tdt-0.6b-v3",
};

test("the meeting's own model downloading blocks Start", () => {
  assert.equal(speechDownloadBlocksMeetingStart(base), true);
  assert.equal(
    speechDownloadBlocksMeetingStart({
      ...base,
      meetingProvider: "whisper",
      downloadingModel: "base",
    }),
    true
  );
});

test("a different model downloading never blocks — archive models and upgrades stay background", () => {
  // The whisper archive model downloading while meetings run on Parakeet.
  assert.equal(speechDownloadBlocksMeetingStart({ ...base, downloadingModel: "base" }), false);
  // An upgrade picked in Settings while the configured model already works.
  assert.equal(
    speechDownloadBlocksMeetingStart({ ...base, downloadingModel: "some-other-model" }),
    false
  );
});

test("no download, cloud transcription, or no configured model never block", () => {
  assert.equal(speechDownloadBlocksMeetingStart({ ...base, downloadingModel: null }), false);
  assert.equal(speechDownloadBlocksMeetingStart({ ...base, meetingUsesLocalModel: false }), false);
  assert.equal(speechDownloadBlocksMeetingStart({ ...base, meetingParakeetModel: "" }), false);
});
