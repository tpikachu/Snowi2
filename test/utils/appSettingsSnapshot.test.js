const test = require("node:test");
const assert = require("node:assert/strict");

const { buildAppSettingsSnapshot } = require("../../src/utils/appSettingsSnapshot.ts");

const baseInput = () => ({
  hotkeys: {
    dictation: "Control+Shift+Space",
    voiceAgent: "",
    translation: "F9",
    meeting: "Control+Shift+M",
    chatAgent: "Control+Shift+C",
    activationMode: "tap",
  },
  dictationEnabled: false,
  appearance: { theme: "auto", uiLanguage: "en", uiTextScale: "1.1" },
  aiModels: {
    chatIntelligence: { mode: "byok", provider: "anthropic", model: "claude-sonnet-4-6" },
  },
  notifications: { meetingDetection: true },
});

test("dictation-gated slots are absent while the feature is off", () => {
  const snapshot = buildAppSettingsSnapshot(baseInput());
  assert.deepEqual(Object.keys(snapshot.hotkeys).sort(), ["chatAgent", "meeting"]);
  assert.equal(snapshot.hotkeys.meeting, "Control+Shift+M");
});

test("with dictation on, all five slots and the activation mode appear", () => {
  const snapshot = buildAppSettingsSnapshot({ ...baseInput(), dictationEnabled: true });
  assert.deepEqual(Object.keys(snapshot.hotkeys).sort(), [
    "activationMode",
    "chatAgent",
    "dictation",
    "meeting",
    "translation",
    "voiceAgent",
  ]);
  // An unbound slot says so instead of returning an empty string the model
  // would have to interpret.
  assert.equal(snapshot.hotkeys.voiceAgent, "not set");
});

test("model scopes pass through only mode, provider, and model", () => {
  const input = baseInput();
  // Simulates a caller mistake: extra fields on a scope never survive.
  input.aiModels.chatIntelligence.customApiKey = "sk-secret";
  const snapshot = buildAppSettingsSnapshot(input);
  assert.deepEqual(snapshot.aiModels.chatIntelligence, {
    mode: "byok",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
  });
});

test("appearance is renamed for the reader and nothing else rides along", () => {
  const snapshot = buildAppSettingsSnapshot(baseInput());
  assert.deepEqual(snapshot.appearance, { theme: "auto", uiLanguage: "en", textSize: "1.1" });
  assert.deepEqual(snapshot.notifications, { meetingDetection: true });
});
