const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  FRIENDLY_CLOUD_PROVIDERS,
  recommendCloudProvider,
  orderCloudProviders,
} = require("../../src/components/onboarding/cloudProviderRecommendation.ts");

const ALL = [...FRIENDLY_CLOUD_PROVIDERS];

test("OpenAI is the default recommendation", () => {
  assert.equal(recommendCloudProvider([], ALL), "openai");
  assert.equal(recommendCloudProvider(["team", "clients"], ALL), "openai");
});

test("healthcare moves the badge to Corti — the FinishStep gate, applied earlier", () => {
  assert.equal(recommendCloudProvider(["healthcare"], ALL), "corti");
  assert.equal(recommendCloudProvider(["team", "healthcare"], ALL), "corti");
});

test("healthcare without Corti in the registry falls back to OpenAI", () => {
  assert.equal(
    recommendCloudProvider(["healthcare"], ["openai", "groq"]),
    "openai",
    "a badge on a provider that does not exist would recommend a dead card"
  );
});

test("no OpenAI in the registry falls back to the first available provider", () => {
  assert.equal(recommendCloudProvider([], ["groq", "mistral"]), "groq");
});

test("ordering puts the recommendation first and drops unavailable providers", () => {
  assert.deepEqual(orderCloudProviders(ALL, "corti"), [
    "corti",
    "openai",
    "groq",
    "mistral",
    "xai",
    "tinfoil",
  ]);
  assert.deepEqual(orderCloudProviders(["openai", "tinfoil"], "openai"), ["openai", "tinfoil"]);
  assert.equal(
    orderCloudProviders(ALL, "openai").includes("custom"),
    false,
    "custom stays behind Advanced"
  );
});

test("every friendly provider has a description key in the en locale", () => {
  const en = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../../src/locales/en/translation.json"), "utf8")
  );
  for (const id of FRIENDLY_CLOUD_PROVIDERS) {
    const description = en.transcriptionSetup?.cloud?.[id]?.description;
    assert.equal(
      typeof description === "string" && description.length > 0,
      true,
      `transcriptionSetup.cloud.${id}.description missing from en locale`
    );
  }
});

test("the healthcare literal matches USE_CASE_IDS", () => {
  // cloudProviderRecommendation keeps "healthcare" as a literal to stay free
  // of React imports; this pins it to the real id so a rename cannot silently
  // break the recommendation.
  const source = fs.readFileSync(
    path.join(__dirname, "../../src/components/onboarding/useCases.ts"),
    "utf8"
  );
  assert.match(source, /healthcare:\s*"healthcare"/);
});
