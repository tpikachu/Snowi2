const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

/**
 * selectLLMConfigReady is what stops a status surface from calling a scope
 * "working" when a request through it would fail: several scopes default to a
 * cloud model before anyone chose one, fallback chains can hand a local-mode
 * scope a cloud id, and a BYOK provider without its key 401s on first use.
 */
test("selectLLMConfigReady judges a scope the way the request path will", async (t) => {
  installBrowserGlobals(t, { initialStorage: { _llmScopeKeysMigrated: "1" } });
  const vite = await createRendererServer(t, { cachePrefix: "snowy-llm-ready-test-" });
  const { useSettingsStore, selectLLMConfigReady, selectResolvedLLMConfig } =
    await vite.ssrLoadModule("/stores/settingsStore.ts");
  const state = () => useSettingsStore.getState();

  await t.test("the fresh-install chat defaults are not ready", () => {
    // Local mode holding the defaulted cloud model id — the exact state that
    // used to render as "Working · OpenAI GPT-5 Mini" on Home.
    const chat = selectResolvedLLMConfig(state(), "chatIntelligence");
    assert.equal(chat.mode, "local");
    assert.equal(chat.model, "gpt-5-mini");
    assert.equal(selectLLMConfigReady(state(), chat), false);
  });

  await t.test("a BYOK provider needs its key, not just a model", () => {
    const cfg = { mode: "providers", provider: "openai", model: "gpt-5-mini" };
    assert.equal(selectLLMConfigReady(state(), cfg), false);
    useSettingsStore.setState({ openaiApiKey: "sk-test" });
    assert.equal(selectLLMConfigReady(state(), cfg), true);
    useSettingsStore.setState({ openaiApiKey: "" });
    assert.equal(selectLLMConfigReady(state(), cfg), false);
  });

  await t.test("local mode needs a model the local registry actually ships", () => {
    const local = (model) => ({ mode: "local", provider: "qwen", model });
    assert.equal(selectLLMConfigReady(state(), local("qwen3.5-9b-q4_k_m")), true);
    // A cloud id left behind by a fallback chain cannot start a llama server.
    assert.equal(selectLLMConfigReady(state(), local("gpt-5-mini")), false);
    assert.equal(selectLLMConfigReady(state(), local("")), false);
  });

  await t.test("self-hosted needs the endpoint and a model", () => {
    const lan = { mode: "self-hosted", provider: "lan", model: "llama3" };
    assert.equal(selectLLMConfigReady(state(), lan), false);
    assert.equal(
      selectLLMConfigReady(state(), { ...lan, remoteUrl: "http://10.0.0.5:11434/v1" }),
      true
    );
  });

  await t.test("custom is callable with either a key or its own endpoint", () => {
    const custom = { mode: "providers", provider: "custom", model: "some-model" };
    assert.equal(selectLLMConfigReady(state(), custom), false);
    assert.equal(selectLLMConfigReady(state(), { ...custom, customApiKey: "k" }), true);
    assert.equal(
      selectLLMConfigReady(state(), { ...custom, cloudBaseUrl: "http://proxy.local/v1" }),
      true
    );
  });

  await t.test("providers mode with no provider is never ready", () => {
    assert.equal(
      selectLLMConfigReady(state(), { mode: "providers", provider: "", model: "gpt-5-mini" }),
      false
    );
  });
});
