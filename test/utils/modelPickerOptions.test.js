const test = require("node:test");
const assert = require("node:assert/strict");

const { buildModelPickerGroups } = require("../../src/utils/modelPickerOptions.ts");

const cloudProviders = [
  { id: "openai", name: "OpenAI", models: [{ id: "gpt-5.5", label: "GPT-5.5" }] },
  { id: "anthropic", name: "Anthropic", models: [{ id: "claude-sonnet-4-6", label: "Sonnet" }] },
  { id: "gemini", name: "Google", models: [{ id: "gemini-3-flash-preview", label: "Flash" }] },
];

test("keyed providers lead, local follows, keyless trail with no models", () => {
  const groups = buildModelPickerGroups({
    cloudProviders,
    keyedProviderIds: new Set(["anthropic"]),
    localModels: [{ id: "qwen-3", label: "Qwen 3", providerId: "qwen" }],
    localGroupName: "On this computer",
  });
  assert.deepEqual(
    groups.map((g) => [g.providerId, g.hasKey, g.models.length]),
    [
      ["anthropic", true, 1],
      ["local", true, 1],
      ["openai", false, 0],
      ["gemini", false, 0],
    ]
  );
});

test("no local models means no local group", () => {
  const groups = buildModelPickerGroups({
    cloudProviders,
    keyedProviderIds: new Set(["openai", "gemini"]),
    localModels: [],
    localGroupName: "On this computer",
  });
  assert.ok(groups.every((g) => g.kind === "cloud"));
  // Catalog order survives within each tier.
  assert.deepEqual(
    groups.map((g) => g.providerId),
    ["openai", "gemini", "anthropic"]
  );
});

test("a provider with no catalog models and no key is dropped, not advertised", () => {
  const groups = buildModelPickerGroups({
    cloudProviders: [...cloudProviders, { id: "tinfoil", name: "Tinfoil", models: [] }],
    keyedProviderIds: new Set(),
    localModels: [],
    localGroupName: "Local",
  });
  assert.ok(!groups.some((g) => g.providerId === "tinfoil"));
});
