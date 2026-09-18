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

test("a local row carries what its labels are computed from", () => {
  const groups = buildModelPickerGroups({
    cloudProviders: [],
    keyedProviderIds: new Set(),
    localModels: [
      {
        id: "qwen3.5-9b-q4_k_m",
        label: "Qwen3.5 9B",
        providerId: "qwen",
        sizeBytes: 5889811552,
        tier: "best",
      },
    ],
    localGroupName: "On this computer",
  });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, "local");
  const [row] = groups[0].models;
  assert.equal(row.sizeBytes, 5889811552);
  assert.equal(row.tier, "best");
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

test("a provider that fronts more ids than it lists takes a typed id, but only once keyed", () => {
  const openrouter = {
    id: "openrouter",
    name: "OpenRouter",
    models: [{ id: "openai/gpt-5-mini", label: "GPT-5 Mini" }],
    acceptsAnyModelId: true,
  };
  const keyed = buildModelPickerGroups({
    cloudProviders: [openrouter],
    keyedProviderIds: new Set(["openrouter"]),
    localModels: [],
    localGroupName: "Local",
  });
  assert.equal(keyed[0].acceptsAnyModelId, true);
  const keyless = buildModelPickerGroups({
    cloudProviders: [openrouter],
    keyedProviderIds: new Set(),
    localModels: [],
    localGroupName: "Local",
  });
  assert.equal(keyless[0].hasKey, false);
  assert.equal(keyless[0].acceptsAnyModelId, false);
  // Vendors with a fixed catalog never take a typed id.
  const vendors = buildModelPickerGroups({
    cloudProviders,
    keyedProviderIds: new Set(["openai"]),
    localModels: [],
    localGroupName: "Local",
  });
  assert.ok(vendors.every((g) => g.acceptsAnyModelId === false));
});
