const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/utils/providerReroute.ts");

test("only the scopes on the removed provider move, each to the next keyed provider's default", async () => {
  const { planRerouteOffProvider } = await load();
  const routes = [
    { scope: "chatIntelligence", mode: "providers", provider: "anthropic" },
    { scope: "actions", mode: "providers", provider: "openai" },
  ];
  assert.deepEqual(planRerouteOffProvider(routes, "anthropic", "openai"), [
    { scope: "chatIntelligence", from: "anthropic", to: "openai", model: "gpt-5-mini" },
  ]);
  // The other provider's key going takes the other scope, at its own default.
  assert.deepEqual(planRerouteOffProvider(routes, "openai", "anthropic"), [
    { scope: "actions", from: "openai", to: "anthropic", model: "claude-haiku-4-5" },
  ]);
});

test("with no keyed provider left the scope is cleared, not left on a dead route", async () => {
  const { planRerouteOffProvider } = await load();
  const routes = [
    { scope: "chatIntelligence", mode: "providers", provider: "openai" },
    { scope: "actions", mode: "providers", provider: "openai" },
  ];
  assert.deepEqual(planRerouteOffProvider(routes, "openai", null), [
    { scope: "chatIntelligence", from: "openai", to: null, model: null },
    { scope: "actions", from: "openai", to: null, model: null },
  ]);
  // A next provider with no defaults (custom) is no better than none.
  assert.deepEqual(planRerouteOffProvider(routes, "openai", "custom"), [
    { scope: "chatIntelligence", from: "openai", to: null, model: null },
    { scope: "actions", from: "openai", to: null, model: null },
  ]);
});

test("local, self-hosted and enterprise scopes are never touched by a cloud key", async () => {
  const { planRerouteOffProvider } = await load();
  const routes = [
    { scope: "chatIntelligence", mode: "local", provider: "openai" },
    { scope: "actions", mode: "enterprise", provider: "openai" },
  ];
  assert.deepEqual(planRerouteOffProvider(routes, "openai", "anthropic"), []);
});
