const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/utils/chatRouteRepair.ts");

const CLOUD = new Set(["openai", "anthropic", "openrouter", "gemini"]);
const base = (keyed, overrides = {}) => ({
  chatReady: false,
  chatMode: "providers",
  actions: { mode: "providers", provider: "", model: "" },
  isKeyed: (id) => keyed.includes(id),
  isCloudProvider: (id) => CLOUD.has(id),
  firstKeyedProvider: keyed[0] ?? null,
  ...overrides,
});

test("a model that can serve is never touched, whatever the write-up route says", async () => {
  const { planChatRouteRepair } = await load();
  const input = base(["openai", "openrouter"], {
    chatReady: true,
    actions: { mode: "providers", provider: "openrouter", model: "openai/gpt-5-nano" },
  });
  assert.equal(planChatRouteRepair(input), null);
});

test("an enterprise-managed model is never touched", async () => {
  const { planChatRouteRepair } = await load();
  assert.equal(planChatRouteRepair(base(["openai"], { chatMode: "enterprise" })), null);
});

test("the write-up's keyed cloud route is adopted: that is where the notes were written", async () => {
  const { planChatRouteRepair } = await load();
  const input = base(["openrouter"], {
    actions: { mode: "providers", provider: "openrouter", model: "openai/gpt-5-nano" },
  });
  assert.deepEqual(planChatRouteRepair(input), {
    provider: "openrouter",
    model: "openai/gpt-5-nano",
  });
  // A cloud id kept under local mode — the old fresh-install default — is
  // the same route.
  const underLocal = base(["anthropic"], {
    actions: { mode: "local", provider: "anthropic", model: "claude-opus-4-7" },
  });
  assert.deepEqual(planChatRouteRepair(underLocal), {
    provider: "anthropic",
    model: "claude-opus-4-7",
  });
});

test("a write-up route without a key, or on a local model, is passed over for the first keyed default", async () => {
  const { planChatRouteRepair } = await load();
  const unkeyed = base(["anthropic"], {
    actions: { mode: "providers", provider: "openrouter", model: "openai/gpt-5-nano" },
  });
  assert.deepEqual(planChatRouteRepair(unkeyed), {
    provider: "anthropic",
    model: "claude-sonnet-5",
  });
  const local = base(["openai"], {
    actions: { mode: "local", provider: "qwen", model: "qwen3.5-9b-q4_k_m" },
  });
  assert.deepEqual(planChatRouteRepair(local), { provider: "openai", model: "gpt-5-mini" });
});

test("with no key anywhere there is nothing to repair", async () => {
  const { planChatRouteRepair } = await load();
  assert.equal(planChatRouteRepair(base([])), null);
  // A keyed provider with no default (custom) is no better than none.
  assert.equal(
    planChatRouteRepair(base([], { firstKeyedProvider: "custom", isKeyed: () => true })),
    null
  );
});
