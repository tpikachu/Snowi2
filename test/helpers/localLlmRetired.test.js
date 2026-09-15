const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

/**
 * Local language models are hidden (LOCAL_LLM_ENABLED false — client
 * direction 2026-09-15: the cue card's thin answer beside a competitor's had
 * come from Qwen3.5 9B). A scope stored in local mode must resolve as cloud
 * on the read path, never route to llama-server, and follow whatever keys
 * exist — without a migration that could run in one window and not another,
 * and without rewriting a selection the flag may one day restore.
 */
const MARKERS = { _llmScopeKeysMigrated: "1", _llmScopeRepair: "1" };

test("a scope stored on a local model resolves as cloud and follows the keys", async (t) => {
  installBrowserGlobals(t, {
    initialStorage: {
      ...MARKERS,
      chatAgentMode: "local",
      chatAgentProvider: "qwen",
      chatAgentModel: "qwen3.5-9b-q4_k_m",
      actionsMode: "local",
      actionsProvider: "qwen",
      actionsModel: "qwen3.5-9b-q4_k_m",
    },
    window: { dispatchEvent: () => true },
  });
  const vite = await createRendererServer(t, { cachePrefix: "snowy-local-llm-retired-" });
  const { useSettingsStore, selectResolvedLLMConfig, selectLLMConfigReady, setCoreLlmEngine } =
    await vite.ssrLoadModule("/stores/settingsStore.ts");
  const { LOCAL_LLM_ENABLED } = await vite.ssrLoadModule("/config/features.js");
  const state = () => useSettingsStore.getState();

  await t.test("the flag is off in this build", () => {
    assert.equal(LOCAL_LLM_ENABLED, false);
  });

  await t.test("with no key it reads as cloud that needs setup, never as local", () => {
    for (const scope of ["chatIntelligence", "actions"]) {
      const cfg = selectResolvedLLMConfig(state(), scope);
      assert.equal(cfg.mode, "providers", scope);
      assert.equal(cfg.provider, "", scope);
      assert.equal(cfg.model, "", scope);
      assert.equal(selectLLMConfigReady(state(), cfg), false, scope);
    }
    // Nothing was written: the stored selection survives for a flip back.
    assert.equal(localStorage.getItem("chatAgentMode"), "local");
    assert.equal(localStorage.getItem("chatAgentModel"), "qwen3.5-9b-q4_k_m");
  });

  await t.test("a key hydrated from disk resolves both scopes at that provider's defaults", () => {
    useSettingsStore.setState({ anthropicApiKey: "sk-ant-on-disk" });
    const chat = selectResolvedLLMConfig(state(), "chatIntelligence");
    assert.deepEqual(
      [chat.mode, chat.provider, chat.model],
      ["providers", "anthropic", "claude-sonnet-5"]
    );
    const actions = selectResolvedLLMConfig(state(), "actions");
    assert.deepEqual(
      [actions.mode, actions.provider, actions.model],
      ["providers", "anthropic", "claude-haiku-4-5"]
    );
    assert.equal(selectLLMConfigReady(state(), chat), true);
    assert.equal(selectLLMConfigReady(state(), actions), true);
    assert.equal(localStorage.getItem("chatAgentMode"), "local");
    useSettingsStore.setState({ anthropicApiKey: "" });
  });

  await t.test("a key typed in the app makes the scope ready at that provider", () => {
    state().setOpenaiApiKey("sk-typed");
    const chat = selectResolvedLLMConfig(state(), "chatIntelligence");
    assert.deepEqual([chat.mode, chat.provider, chat.model], ["providers", "openai", "gpt-5-mini"]);
    assert.equal(selectLLMConfigReady(state(), chat), true);
    const actions = selectResolvedLLMConfig(state(), "actions");
    assert.deepEqual([actions.provider, actions.model], ["openai", "gpt-5-nano"]);
  });

  await t.test("a later key does not move a scope that already serves", () => {
    state().setGeminiApiKey("AIza-typed");
    const chat = selectResolvedLLMConfig(state(), "chatIntelligence");
    assert.deepEqual([chat.provider, chat.model], ["openai", "gpt-5-mini"]);
  });

  await t.test("the engine switch refuses local", () => {
    setCoreLlmEngine("local");
    const chat = selectResolvedLLMConfig(state(), "chatIntelligence");
    assert.equal(chat.mode, "providers");
    assert.equal(chat.provider, "openai");
  });
});

test("a cloud id kept under local mode — the old fresh-install default — keeps its provider", async (t) => {
  installBrowserGlobals(t, {
    initialStorage: {
      ...MARKERS,
      chatAgentMode: "local",
      chatAgentProvider: "openai",
      chatAgentModel: "gpt-5-mini",
    },
    window: { dispatchEvent: () => true },
  });
  const vite = await createRendererServer(t, { cachePrefix: "snowy-local-llm-retired-cloud-id-" });
  const { useSettingsStore, selectResolvedLLMConfig, selectLLMConfigReady } =
    await vite.ssrLoadModule("/stores/settingsStore.ts");
  const state = () => useSettingsStore.getState();

  await t.test("unkeyed, it still names the provider so Settings can ask for its key", () => {
    const chat = selectResolvedLLMConfig(state(), "chatIntelligence");
    assert.deepEqual([chat.mode, chat.provider, chat.model], ["providers", "openai", "gpt-5-mini"]);
    assert.equal(selectLLMConfigReady(state(), chat), false);
  });

  await t.test("another provider's key on disk beats the unkeyed stored one", () => {
    useSettingsStore.setState({ geminiApiKey: "AIza-on-disk" });
    const chat = selectResolvedLLMConfig(state(), "chatIntelligence");
    assert.deepEqual([chat.provider, chat.model], ["gemini", "gemini-3.5-flash"]);
    useSettingsStore.setState({ geminiApiKey: "" });
  });

  await t.test("its own key makes it ready exactly as stored", () => {
    useSettingsStore.setState({ openaiApiKey: "sk-on-disk" });
    const chat = selectResolvedLLMConfig(state(), "chatIntelligence");
    assert.deepEqual([chat.provider, chat.model], ["openai", "gpt-5-mini"]);
    assert.equal(selectLLMConfigReady(state(), chat), true);
  });
});
