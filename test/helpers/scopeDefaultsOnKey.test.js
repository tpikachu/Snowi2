const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

/**
 * Entering a provider key IS the model setup: the moment a provider's first
 * key lands, the one AI model adopts that provider's default
 * (scopeModelDefaults.ts) — only when it could not serve, so a later key or
 * an explicit pick is never overridden. The deliberate switch is the
 * provider card in Settings (setCoreCloudProvider) — the missing piece
 * behind "added the OpenRouter key, it still uses OpenAI" (client,
 * 2026-09-15). One model serves chat and the write-up (client, 2026-09-22):
 * the actions scope resolves to the chat pick.
 */
test("a provider key arriving assigns the default model exactly once", async (t) => {
  installBrowserGlobals(t, {
    initialStorage: { _llmScopeKeysMigrated: "1" },
    // Unlike llmConfigReady's setState shortcuts, this test drives the real
    // key setters, which announce the change via window.dispatchEvent.
    window: { dispatchEvent: () => true },
  });
  const vite = await createRendererServer(t, { cachePrefix: "snowy-scope-defaults-test-" });
  const {
    useSettingsStore,
    selectResolvedLLMConfig,
    selectResolvedActions,
    setResolvedLLMConfig,
    setCoreCloudProvider,
  } = await vite.ssrLoadModule("/stores/settingsStore.ts");
  const { consumeRouteNotices } = await vite.ssrLoadModule("/stores/routeNoticeStore.ts");
  const state = () => useSettingsStore.getState();
  const chat = () => selectResolvedLLMConfig(state(), "chatIntelligence");

  await t.test("the first key sets the agreed default, and the write-up follows it", () => {
    state().setOpenaiApiKey("sk-test");
    assert.equal(chat().mode, "providers");
    assert.equal(chat().provider, "openai");
    assert.equal(chat().model, "gpt-5-mini");
    const actions = selectResolvedLLMConfig(state(), "actions");
    assert.equal(actions.provider, "openai");
    assert.equal(actions.model, "gpt-5-mini");
    assert.equal(selectResolvedActions(state()).model, "gpt-5-mini");
  });

  await t.test("a second provider's key does not override a working model", () => {
    state().setAnthropicApiKey("sk-ant-test");
    assert.equal(chat().model, "gpt-5-mini");
  });

  await t.test("a removed key moves the model to the next keyed provider, and says so", () => {
    setResolvedLLMConfig("chatIntelligence", {
      mode: "providers",
      provider: "anthropic",
      model: "claude-fable-5",
    });
    assert.equal(selectResolvedLLMConfig(state(), "actions").model, "claude-fable-5");
    state().setAnthropicApiKey("");
    assert.equal(chat().provider, "openai");
    assert.equal(chat().model, "gpt-5-mini");
    assert.deepEqual(consumeRouteNotices(), [
      { from: "anthropic", to: "openai", model: "gpt-5-mini" },
    ]);
    // Re-entering the key never overrides a working model: the chip is
    // where a person picks Claude again.
    state().setAnthropicApiKey("sk-ant-test-2");
    assert.equal(chat().model, "gpt-5-mini");
    assert.deepEqual(consumeRouteNotices(), []);
  });

  await t.test(
    "choosing a provider card moves the model there, keeping a model already picked",
    () => {
      setResolvedLLMConfig("chatIntelligence", {
        mode: "providers",
        provider: "anthropic",
        model: "claude-fable-5",
      });
      setCoreCloudProvider("openai");
      assert.equal(chat().provider, "openai");
      assert.equal(chat().model, "gpt-5-mini");
      setCoreCloudProvider("anthropic");
      assert.equal(chat().provider, "anthropic");
      assert.equal(chat().model, "claude-sonnet-5");
    }
  );

  await t.test(
    "an OpenRouter key alone moves nothing; choosing its card routes at the curated slug",
    () => {
      state().setOpenrouterApiKey("sk-or-test");
      assert.equal(chat().provider, "anthropic");
      setCoreCloudProvider("openrouter");
      assert.equal(chat().model, "openai/gpt-5-mini");
    }
  );

  await t.test("the last key going stops at needs-a-model, never a local model", () => {
    state().setOpenaiApiKey("");
    state().setAnthropicApiKey("");
    assert.deepEqual(consumeRouteNotices(), []);
    state().setOpenrouterApiKey("");
    assert.equal(chat().provider, "");
    assert.equal(chat().model, "");
    assert.deepEqual(consumeRouteNotices(), [{ from: "openrouter", to: null, model: null }]);
  });

  await t.test("a provider outside the cloud catalog is refused", () => {
    state().setOpenaiApiKey("sk-test-3");
    setCoreCloudProvider("qwen");
    assert.equal(chat().provider, "openai");
  });

  // The real setters arm persistence debounces (250ms secret save, 1000ms env
  // write). Let them fire while the stubbed window still exists — after
  // teardown they would throw into an uncaughtException instead.
  await new Promise((resolve) => setTimeout(resolve, 1200));
});
