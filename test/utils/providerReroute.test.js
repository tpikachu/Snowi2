const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/utils/providerReroute.ts");

test("the model moves only when it ran on the removed provider, to the next keyed provider's default", async () => {
  const { planRerouteOffProvider } = await load();
  const route = { mode: "providers", provider: "anthropic" };
  assert.deepEqual(planRerouteOffProvider(route, "anthropic", "openai"), {
    from: "anthropic",
    to: "openai",
    model: "gpt-5-mini",
  });
  // Another provider's key going leaves the model where it is.
  assert.equal(planRerouteOffProvider(route, "openai", "anthropic"), null);
});

test("with no keyed provider left the model is cleared, not left on a dead route", async () => {
  const { planRerouteOffProvider } = await load();
  const route = { mode: "providers", provider: "openai" };
  assert.deepEqual(planRerouteOffProvider(route, "openai", null), {
    from: "openai",
    to: null,
    model: null,
  });
  // A next provider with no defaults (custom) is no better than none.
  assert.deepEqual(planRerouteOffProvider(route, "openai", "custom"), {
    from: "openai",
    to: null,
    model: null,
  });
});

test("a local, self-hosted or enterprise model is never touched by a cloud key", async () => {
  const { planRerouteOffProvider } = await load();
  for (const mode of ["local", "self-hosted", "enterprise"]) {
    assert.equal(planRerouteOffProvider({ mode, provider: "openai" }, "openai", "anthropic"), null);
  }
});
