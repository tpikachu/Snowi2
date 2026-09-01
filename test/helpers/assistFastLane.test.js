const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

/**
 * resolveFastLaneLLMConfig picks the model the meeting assistant's Fast
 * answers run on: the user's explicit override when callable, else the chat
 * provider's small sibling, else the chat model itself. Getting this wrong
 * either slows the one mode that promises speed, or silently answers on a
 * model the user never chose credentials for.
 */
test("resolveFastLaneLLMConfig picks the fastest callable model", async (t) => {
  installBrowserGlobals(t, { initialStorage: { _llmScopeKeysMigrated: "1" } });
  const vite = await createRendererServer(t, { cachePrefix: "snowy-fastlane-test-" });
  const { useSettingsStore } = await vite.ssrLoadModule("/stores/settingsStore.ts");
  const { resolveFastLaneLLMConfig, resolveChatLaneConfig, FAST_LANE_MODELS } =
    await vite.ssrLoadModule("/utils/assistFastLane.ts");
  const state = () => useSettingsStore.getState();

  await t.test("an unready chat scope resolves to null — no lane without the feature", () => {
    assert.equal(resolveFastLaneLLMConfig(state()), null);
  });

  await t.test("a BYOK chat model derives its provider's small sibling", () => {
    useSettingsStore.setState({
      chatAgentMode: "providers",
      chatAgentProvider: "openai",
      chatAgentModel: "gpt-5.5",
      openaiApiKey: "sk-test",
    });
    const resolved = resolveFastLaneLLMConfig(state());
    assert.equal(resolved.source, "derived");
    assert.equal(resolved.config.model, FAST_LANE_MODELS.openai);
    assert.equal(resolved.config.provider, "openai");
  });

  await t.test("a chat model that already is the sibling stays put", () => {
    useSettingsStore.setState({ chatAgentModel: FAST_LANE_MODELS.openai });
    const resolved = resolveFastLaneLLMConfig(state());
    assert.equal(resolved.source, "chat");
    assert.equal(resolved.config.model, FAST_LANE_MODELS.openai);
  });

  await t.test("a provider without a mapped sibling keeps the chat model", () => {
    useSettingsStore.setState({
      chatAgentProvider: "tinfoil",
      chatAgentModel: "kimi-k2-6",
      tinfoilApiKey: "tk-test",
    });
    const resolved = resolveFastLaneLLMConfig(state());
    assert.equal(resolved.source, "chat");
    assert.equal(resolved.config.model, "kimi-k2-6");
  });

  await t.test("a callable override wins over derivation", () => {
    useSettingsStore.setState({
      chatAgentProvider: "openai",
      chatAgentModel: "gpt-5.5",
      useChatFastModel: true,
      chatFastMode: "providers",
      chatFastProvider: "anthropic",
      chatFastModel: "claude-haiku-4-5",
      anthropicApiKey: "ak-test",
    });
    const resolved = resolveFastLaneLLMConfig(state());
    assert.equal(resolved.source, "override");
    assert.equal(resolved.config.provider, "anthropic");
    assert.equal(resolved.config.model, "claude-haiku-4-5");
  });

  await t.test("a half-configured override falls through instead of breaking Fast", () => {
    // The override's provider loses its key: the request path would 401, so
    // the lane must fall back to the derivation rung, not fail.
    useSettingsStore.setState({ anthropicApiKey: "" });
    const resolved = resolveFastLaneLLMConfig(state());
    assert.equal(resolved.source, "derived");
    assert.equal(resolved.config.provider, "openai");
    assert.equal(resolved.config.model, FAST_LANE_MODELS.openai);
  });

  await t.test("the fast chat lane is a single shot on the fast model", () => {
    // Fast in chat means no tool loop and no thinking — the whole point is
    // the first token, and a tool round-trip is another entire model turn.
    const lane = resolveChatLaneConfig(state(), "fast");
    assert.equal(lane.lane, "fast");
    assert.equal(lane.allowTools, false);
    assert.equal(lane.disableThinking, true);
    assert.equal(lane.config.model, FAST_LANE_MODELS.openai);
  });

  await t.test("the thinking chat lane is the full agent on the chat model", () => {
    // The user's own thinking setting rides through untouched — set it to the
    // value the fast lane would never produce, and see it survive.
    useSettingsStore.setState({ chatAgentDisableThinking: false });
    const lane = resolveChatLaneConfig(state(), "thinking");
    assert.equal(lane.lane, "thinking");
    assert.equal(lane.allowTools, true);
    assert.equal(lane.config.model, "gpt-5.5");
    assert.equal(lane.disableThinking, false);
  });

  await t.test("an unresolvable fast lane degrades to the thinking lane, and says so", () => {
    // With the chat scope unready, fast has no feature to belong to. The
    // thinking path's unconfigured-model handling explains itself; failing
    // some other way here would produce an error nobody can act on.
    useSettingsStore.setState({ openaiApiKey: "" });
    const lane = resolveChatLaneConfig(state(), "fast");
    assert.equal(lane.lane, "thinking");
    assert.equal(lane.allowTools, true);
  });
});
