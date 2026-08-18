const test = require("node:test");
const assert = require("node:assert/strict");
const { getEnterpriseAIModel } = require("../../src/helpers/enterpriseAiProviders.js");

test("manual Azure setup preserves legacy endpoints and API-key auth", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  let request;
  global.fetch = async (url, init) => {
    request = {
      url: String(url),
      headers: Object.fromEntries(new Headers(init.headers)),
    };
    return new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const model = getEnterpriseAIModel("azure", "legacy-deployment", "legacy-api-key", {
    azureEndpoint: "https://legacy.example.com/custom/openai",
    azureApiVersion: "2024-10-21",
  });
  await assert.rejects(
    model.doGenerate({ prompt: [{ role: "user", content: [{ type: "text", text: "Hello" }] }] })
  );
  assert.equal(request.url, "https://legacy.example.com/custom/openai/responses");
  assert.equal(request.headers["api-key"], "legacy-api-key");
});

test("unknown providers fail closed", () => {
  assert.throws(() => getEnterpriseAIModel("openai", "gpt", "key", {}), /Unsupported enterprise/);
});
