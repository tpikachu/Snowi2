const test = require("node:test");
const assert = require("node:assert/strict");

const {
  webSearchAvailable,
  webSearchUnavailableReason,
  openrouterOnlineModel,
  WEB_SEARCH_PROVIDERS,
} = require("../../src/utils/webSearchSupport.ts");

/**
 * The cue card's web search is the provider's own server tool, so whether it
 * can run is a fact about the route the chat scope resolves to — and the
 * card shows the toggle disabled where it cannot, rather than failing a
 * question mid-call.
 */
test("the four routes with a search tool can; everything else reads as unavailable", () => {
  for (const provider of ["openai", "anthropic", "gemini", "openrouter"]) {
    assert.equal(webSearchAvailable({ mode: "providers", provider }), true, provider);
  }
  for (const provider of ["groq", "tinfoil", "corti", "custom", "xai", "mistral", ""]) {
    assert.equal(webSearchAvailable({ mode: "providers", provider }), false, provider);
  }
  assert.deepEqual([...WEB_SEARCH_PROVIDERS].sort(), [
    "anthropic",
    "gemini",
    "openai",
    "openrouter",
  ]);
});

test("only a cloud route counts: local, LAN and enterprise modes cannot search", () => {
  assert.equal(webSearchAvailable({ mode: "local", provider: "openai" }), false);
  assert.equal(webSearchAvailable({ mode: "self-hosted", provider: "openai" }), false);
  assert.equal(webSearchAvailable({ mode: "enterprise", provider: "bedrock" }), false);
  assert.equal(webSearchAvailable({ mode: "", provider: "openai" }), false);
  assert.equal(webSearchAvailable({ provider: "openai" }), false);
});

test("why it cannot: a model on this computer or a LAN server says switch the model; a cloud route blames the provider", () => {
  assert.equal(webSearchUnavailableReason({ mode: "providers", provider: "openai" }), null);
  assert.equal(webSearchUnavailableReason({ mode: "local", provider: "qwen" }), "local");
  assert.equal(webSearchUnavailableReason({ mode: "self-hosted", provider: "openai" }), "local");
  assert.equal(webSearchUnavailableReason({ mode: "providers", provider: "groq" }), "provider");
  assert.equal(webSearchUnavailableReason({ mode: "enterprise", provider: "bedrock" }), "provider");
});

test("OpenRouter's web option rides the model id, once", () => {
  assert.equal(openrouterOnlineModel("openai/gpt-5-mini"), "openai/gpt-5-mini:online");
  assert.equal(openrouterOnlineModel("openai/gpt-5-mini:online"), "openai/gpt-5-mini:online");
});
