const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

/**
 * Local language models are on offer again (LOCAL_LLM_ENABLED true — client
 * direction 2026-09-18, with labels on every row). What the store must hold:
 * a stored local selection resolves as local; a fresh install starts on
 * cloud; a cloud provider id kept under local mode — the fresh-install
 * default until this change — means cloud; and the hidden-flag path
 * (2026-09-15) stays exact for the next flip, tested through the exported
 * normalizeLocalMode with `enabled` forced off.
 */
const MARKERS = { _llmScopeKeysMigrated: "1", _llmScopeRepair: "1" };

test("a stored local selection resolves as local, and the write-up follows the one model", async (t) => {
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
  const vite = await createRendererServer(t, { cachePrefix: "snowy-local-llm-mode-" });
  const { useSettingsStore, selectResolvedLLMConfig, setResolvedLLMConfig, setCoreLlmEngine } =
    await vite.ssrLoadModule("/stores/settingsStore.ts");
  const { LOCAL_LLM_ENABLED } = await vite.ssrLoadModule("/config/features.js");
  const state = () => useSettingsStore.getState();

  await t.test("the flag is on in this build", () => {
    assert.equal(LOCAL_LLM_ENABLED, true);
  });

  await t.test("the model reads exactly what was stored, and the write-up resolves to it", () => {
    for (const scope of ["chatIntelligence", "actions"]) {
      const cfg = selectResolvedLLMConfig(state(), scope);
      assert.deepEqual(
        [cfg.mode, cfg.provider, cfg.model],
        ["local", "qwen", "qwen3.5-9b-q4_k_m"],
        scope
      );
    }
    assert.equal(localStorage.getItem("chatAgentMode"), "local");
  });

  await t.test(
    "flipping to cloud seeds the first keyed provider's default, and the write-up follows",
    () => {
      // Straight into the store: the typed-key setter's debounced disk write
      // would outlive this test's window (scopeDefaultsOnKey covers the setter).
      useSettingsStore.setState({ openaiApiKey: "sk-on-disk" });
      setCoreLlmEngine("cloud");
      const chat = selectResolvedLLMConfig(state(), "chatIntelligence");
      assert.deepEqual(
        [chat.mode, chat.provider, chat.model],
        ["providers", "openai", "gpt-5-mini"]
      );
      const actions = selectResolvedLLMConfig(state(), "actions");
      assert.deepEqual(
        [actions.mode, actions.provider, actions.model],
        ["providers", "openai", "gpt-5-mini"]
      );
    }
  );

  await t.test(
    "flipping back to local clears the cloud id rather than sending it to llama-server",
    () => {
      setCoreLlmEngine("local");
      const chat = selectResolvedLLMConfig(state(), "chatIntelligence");
      assert.deepEqual([chat.mode, chat.provider, chat.model], ["local", "", ""]);
      // The write-up is the same model, so it is cleared with it.
      const actions = selectResolvedLLMConfig(state(), "actions");
      assert.deepEqual([actions.mode, actions.provider, actions.model], ["local", "", ""]);
    }
  );

  await t.test(
    "picking a local model in Settings routes chat and the write-up at it together",
    () => {
      setResolvedLLMConfig("chatIntelligence", {
        mode: "local",
        provider: "qwen",
        model: "qwen3.5-4b-q4_k_m",
      });
      for (const scope of ["chatIntelligence", "actions"]) {
        const cfg = selectResolvedLLMConfig(state(), scope);
        assert.deepEqual(
          [cfg.mode, cfg.provider, cfg.model],
          ["local", "qwen", "qwen3.5-4b-q4_k_m"],
          scope
        );
      }
    }
  );
});

test("a fresh install starts on cloud, and a cloud id under local mode means cloud", async (t) => {
  installBrowserGlobals(t, {
    initialStorage: { ...MARKERS },
    window: { dispatchEvent: () => true },
  });
  const vite = await createRendererServer(t, { cachePrefix: "snowy-local-llm-mode-fresh-" });
  const { useSettingsStore, selectResolvedLLMConfig, selectLLMConfigReady, normalizeLocalMode } =
    await vite.ssrLoadModule("/stores/settingsStore.ts");
  const state = () => useSettingsStore.getState();

  await t.test("fresh: providers mode with OpenAI's default model, not ready without a key", () => {
    const chat = selectResolvedLLMConfig(state(), "chatIntelligence");
    assert.deepEqual([chat.mode, chat.provider, chat.model], ["providers", "openai", "gpt-5-mini"]);
    assert.equal(selectLLMConfigReady(state(), chat), false);
    assert.equal(selectResolvedLLMConfig(state(), "actions").mode, "providers");
  });

  await t.test(
    "the pre-2026-09-18 default — a cloud id stored under local mode — resolves as cloud",
    () => {
      const cfg = normalizeLocalMode(state(), {
        scope: "chatIntelligence",
        mode: "local",
        provider: "openai",
        model: "gpt-5-mini",
        cloudMode: "",
      });
      assert.deepEqual(
        [cfg.mode, cfg.provider, cfg.model, cfg.cloudMode],
        ["providers", "openai", "gpt-5-mini", "byok"]
      );
      // A local family id under local mode is what it says.
      const local = normalizeLocalMode(state(), {
        scope: "chatIntelligence",
        mode: "local",
        provider: "qwen",
        model: "qwen3.5-9b-q4_k_m",
      });
      assert.equal(local.mode, "local");
      assert.equal(local.provider, "qwen");
    }
  );

  await t.test(
    "with the flag off (kept for the next hide) a local scope resolves as cloud and follows the keys",
    () => {
      const stored = {
        scope: "chatIntelligence",
        mode: "local",
        provider: "qwen",
        model: "qwen3.5-9b-q4_k_m",
      };
      let cfg = normalizeLocalMode(state(), stored, false);
      assert.deepEqual([cfg.mode, cfg.provider, cfg.model], ["providers", "", ""]);

      useSettingsStore.setState({ anthropicApiKey: "sk-ant-on-disk" });
      cfg = normalizeLocalMode(state(), stored, false);
      assert.deepEqual(
        [cfg.mode, cfg.provider, cfg.model],
        ["providers", "anthropic", "claude-sonnet-5"]
      );
      useSettingsStore.setState({ anthropicApiKey: "" });

      const cloudId = {
        scope: "chatIntelligence",
        mode: "local",
        provider: "openai",
        model: "gpt-5-mini",
      };
      // Unkeyed, it still names the provider so Settings can ask for its key.
      cfg = normalizeLocalMode(state(), cloudId, false);
      assert.deepEqual([cfg.mode, cfg.provider, cfg.model], ["providers", "openai", "gpt-5-mini"]);
      // Another provider's key beats the unkeyed stored one.
      useSettingsStore.setState({ geminiApiKey: "AIza-on-disk" });
      cfg = normalizeLocalMode(state(), cloudId, false);
      assert.deepEqual([cfg.provider, cfg.model], ["gemini", "gemini-3.5-flash"]);
      useSettingsStore.setState({ geminiApiKey: "" });
      // Its own key makes it ready exactly as stored.
      useSettingsStore.setState({ openaiApiKey: "sk-on-disk" });
      cfg = normalizeLocalMode(state(), cloudId, false);
      assert.deepEqual([cfg.provider, cfg.model], ["openai", "gpt-5-mini"]);
      useSettingsStore.setState({ openaiApiKey: "" });
    }
  );
});
