const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

/**
 * Entering a provider key IS the model setup: the moment a provider's first
 * key lands, chat and actions adopt that provider's defaults
 * (scopeModelDefaults.ts) — and only scopes that could not serve are touched,
 * so a later key or an explicit pick is never overridden.
 */
test("a provider key arriving assigns scope defaults exactly once", async (t) => {
  installBrowserGlobals(t, {
    initialStorage: { _llmScopeKeysMigrated: "1" },
    // Unlike llmConfigReady's setState shortcuts, this test drives the real
    // key setters, which announce the change via window.dispatchEvent.
    window: { dispatchEvent: () => true },
  });
  const vite = await createRendererServer(t, { cachePrefix: "snowy-scope-defaults-test-" });
  const { useSettingsStore, selectResolvedLLMConfig, setResolvedLLMConfig } =
    await vite.ssrLoadModule("/stores/settingsStore.ts");
  const state = () => useSettingsStore.getState();

  await t.test("the first key sets the agreed defaults for chat and actions", () => {
    state().setOpenaiApiKey("sk-test");
    const chat = selectResolvedLLMConfig(state(), "chatIntelligence");
    assert.equal(chat.mode, "providers");
    assert.equal(chat.provider, "openai");
    assert.equal(chat.model, "gpt-5-mini");
    const actions = selectResolvedLLMConfig(state(), "actions");
    assert.equal(actions.mode, "providers");
    assert.equal(actions.provider, "openai");
    assert.equal(actions.model, "gpt-5-nano");
  });

  await t.test("a second provider's key does not override a working scope", () => {
    state().setAnthropicApiKey("sk-ant-test");
    assert.equal(selectResolvedLLMConfig(state(), "chatIntelligence").model, "gpt-5-mini");
    assert.equal(selectResolvedLLMConfig(state(), "actions").model, "gpt-5-nano");
  });

  await t.test("an explicit pick survives its provider's key being re-entered", () => {
    setResolvedLLMConfig("chatIntelligence", {
      mode: "providers",
      provider: "anthropic",
      model: "claude-fable-5",
    });
    // Key removed and re-entered: by the time defaults are considered the key
    // is already in state, so the explicitly picked scope reads as ready and
    // stays untouched.
    state().setAnthropicApiKey("");
    state().setAnthropicApiKey("sk-ant-test-2");
    assert.equal(selectResolvedLLMConfig(state(), "chatIntelligence").model, "claude-fable-5");
  });

  // The real setters arm persistence debounces (250ms secret save, 1000ms env
  // write). Let them fire while the stubbed window still exists — after
  // teardown they would throw into an uncaughtException instead.
  await new Promise((resolve) => setTimeout(resolve, 1200));
});
