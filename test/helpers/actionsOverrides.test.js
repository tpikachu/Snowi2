const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/actionsOverrides.js");

test("self-hosted forwards remoteUrl as lanUrl and the api key (regression: was hitting OpenAI)", async () => {
  const { buildActionsOverrides } = await load();
  const overrides = buildActionsOverrides(
    {
      mode: "self-hosted",
      remoteUrl: "http://192.168.1.126:11434/v1",
      model: "llama3",
      customApiKey: "sk-local",
    },
    false
  );
  assert.equal(overrides.lanUrl, "http://192.168.1.126:11434/v1");
  assert.equal(overrides.customApiKey, "sk-local");
  assert.equal(overrides.provider, undefined);
  assert.equal(overrides.baseUrl, undefined);
  assert.equal(overrides.inferenceScope, "actions");
});

test("self-hosted with no key still routes via lanUrl", async () => {
  const { buildActionsOverrides } = await load();
  const overrides = buildActionsOverrides(
    { mode: "self-hosted", remoteUrl: "http://host:8080/v1", customApiKey: "" },
    false
  );
  assert.equal(overrides.lanUrl, "http://host:8080/v1");
  assert.equal(overrides.customApiKey, undefined);
  assert.equal(overrides.inferenceScope, "actions");
});

test("providers/custom forwards cloudBaseUrl as baseUrl and the key", async () => {
  const { buildActionsOverrides } = await load();
  const overrides = buildActionsOverrides(
    {
      mode: "providers",
      provider: "custom",
      cloudBaseUrl: "https://api.example.com/v1",
      customApiKey: "sk-custom",
    },
    false
  );
  assert.deepEqual(overrides, {
    inferenceScope: "actions",
    provider: "custom",
    baseUrl: "https://api.example.com/v1",
    customApiKey: "sk-custom",
    lanUrl: undefined,
  });
});

test("providers with a first-party cloud provider passes provider only, no key/baseUrl", async () => {
  const { buildActionsOverrides } = await load();
  const overrides = buildActionsOverrides(
    { mode: "providers", provider: "anthropic", customApiKey: "should-not-leak" },
    false
  );
  assert.deepEqual(overrides, {
    inferenceScope: "actions",
    provider: "anthropic",
    baseUrl: undefined,
    customApiKey: undefined,
    lanUrl: undefined,
  });
});

test("local mode pins the local provider and leaks no key", async () => {
  const { buildActionsOverrides } = await load();
  const overrides = buildActionsOverrides(
    { mode: "local", model: "qwen2.5-3b", customApiKey: "irrelevant" },
    false
  );
  assert.deepEqual(overrides, {
    inferenceScope: "actions",
    provider: "local",
    baseUrl: undefined,
    customApiKey: undefined,
    lanUrl: undefined,
  });
});

test("local mode with no model stays local (regression: inherited cloud id hit the cloud)", async () => {
  const { buildActionsOverrides } = await load();
  const overrides = buildActionsOverrides(
    { mode: "local", model: "", customApiKey: "sk-cloud" },
    false
  );
  assert.equal(overrides.provider, "local");
  assert.equal(overrides.customApiKey, undefined);
  assert.equal(overrides.inferenceScope, "actions");
});

test("enterprise mode pins its provider instead of inheriting cleanup routing", async () => {
  const { buildActionsOverrides } = await load();
  const overrides = buildActionsOverrides(
    { mode: "enterprise", provider: "bedrock", customApiKey: "irrelevant" },
    false
  );
  assert.deepEqual(overrides, {
    inferenceScope: "actions",
    provider: "bedrock",
    baseUrl: undefined,
    customApiKey: undefined,
    lanUrl: undefined,
  });
});
