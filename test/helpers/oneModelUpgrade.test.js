const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

/**
 * An install that ran rc9 (two models: chat and the write-up) updates into
 * rc10 (one model) with a working model. rc9 never wrote the chat route it
 * derived on the read path, so its localStorage holds no chat keys at all
 * when the only key is not OpenAI; and its write-up could run on a provider
 * the chat never had a key for. `repairChatRoute` runs once the keys have
 * hydrated at startup (initializeSettings) and materializes the route.
 */
const MARKERS = { _llmScopeKeysMigrated: "1", _llmScopeRepair: "1" };
const WINDOW = { dispatchEvent: () => true };

async function loadStore(t, initialStorage, prefix) {
  installBrowserGlobals(t, { initialStorage: { ...MARKERS, ...initialStorage }, window: WINDOW });
  const vite = await createRendererServer(t, { cachePrefix: prefix });
  return vite.ssrLoadModule("/stores/settingsStore.ts");
}

test("an rc9 install whose only key is not OpenAI updates into that provider's default, written down", async (t) => {
  const { useSettingsStore, selectResolvedLLMConfig, selectLLMConfigReady, repairChatRoute } =
    await loadStore(t, {}, "snowy-one-model-upgrade-a-");
  const state = () => useSettingsStore.getState();
  useSettingsStore.setState({ anthropicApiKey: "sk-ant-on-disk" });

  // Read as rc10 reads it, the bare default cannot serve.
  const before = selectResolvedLLMConfig(state(), "chatIntelligence");
  assert.deepEqual([before.provider, before.model], ["openai", "gpt-5-mini"]);
  assert.equal(selectLLMConfigReady(state(), before), false);

  assert.equal(repairChatRoute(), true);
  for (const scope of ["chatIntelligence", "actions"]) {
    const cfg = selectResolvedLLMConfig(state(), scope);
    assert.deepEqual(
      [cfg.mode, cfg.provider, cfg.model],
      ["providers", "anthropic", "claude-sonnet-5"],
      scope
    );
    assert.equal(selectLLMConfigReady(state(), cfg), true, scope);
  }
  assert.equal(localStorage.getItem("chatAgentProvider"), "anthropic");
  assert.equal(localStorage.getItem("chatAgentModel"), "claude-sonnet-5");
  assert.equal(localStorage.getItem("chatAgentMode"), "providers");
  // Idempotent: the next launch finds a working model and leaves it.
  assert.equal(repairChatRoute(), false);
});

test("an rc9 install whose key sat on the write-up's provider keeps writing there, and chat joins it", async (t) => {
  const { useSettingsStore, selectResolvedLLMConfig, repairChatRoute } = await loadStore(
    t,
    {
      chatAgentMode: "providers",
      chatAgentProvider: "openai",
      chatAgentModel: "gpt-5-mini",
      actionsMode: "providers",
      actionsProvider: "openrouter",
      actionsModel: "openai/gpt-5-nano",
    },
    "snowy-one-model-upgrade-b-"
  );
  const state = () => useSettingsStore.getState();
  useSettingsStore.setState({ openrouterApiKey: "sk-or-on-disk" });

  assert.equal(repairChatRoute(), true);
  for (const scope of ["chatIntelligence", "actions"]) {
    const cfg = selectResolvedLLMConfig(state(), scope);
    assert.deepEqual(
      [cfg.mode, cfg.provider, cfg.model],
      ["providers", "openrouter", "openai/gpt-5-nano"],
      scope
    );
  }
});

test("a working chat model is left alone even when the write-up ran elsewhere", async (t) => {
  const { useSettingsStore, selectResolvedLLMConfig, repairChatRoute } = await loadStore(
    t,
    {
      chatAgentMode: "providers",
      chatAgentProvider: "openai",
      chatAgentModel: "gpt-5.5",
      actionsMode: "providers",
      actionsProvider: "openrouter",
      actionsModel: "openai/gpt-5-nano",
    },
    "snowy-one-model-upgrade-c-"
  );
  const state = () => useSettingsStore.getState();
  useSettingsStore.setState({ openaiApiKey: "sk-on-disk", openrouterApiKey: "sk-or-on-disk" });

  assert.equal(repairChatRoute(), false);
  const chat = selectResolvedLLMConfig(state(), "chatIntelligence");
  assert.deepEqual([chat.provider, chat.model], ["openai", "gpt-5.5"]);
  // The one model: the write-up follows chat now, by design.
  const actions = selectResolvedLLMConfig(state(), "actions");
  assert.deepEqual([actions.provider, actions.model], ["openai", "gpt-5.5"]);
});

test("with no key anywhere nothing is written: Home and the dot say needs a model", async (t) => {
  const { repairChatRoute } = await loadStore(t, {}, "snowy-one-model-upgrade-d-");
  assert.equal(repairChatRoute(), false);
  assert.equal(localStorage.getItem("chatAgentProvider"), null);
});
