const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/services/ai/modelFamilyConstraints.ts");

test("family lookup matches anywhere in the id, case-insensitively", async () => {
  const { getModelFamilyConstraints } = await load();
  assert.equal(getModelFamilyConstraints("openai/GPT-OSS-120b")?.family, "gpt-oss");
  assert.equal(getModelFamilyConstraints("gpt-oss-safeguard-120b")?.family, "gpt-oss");
  assert.equal(getModelFamilyConstraints("qwen/qwen3-32b")?.family, "qwen");
  assert.equal(getModelFamilyConstraints("magistral-small-latest")?.family, "magistral");
});

test("unknown, empty, and missing ids resolve to no constraints", async () => {
  const { getModelFamilyConstraints } = await load();
  assert.equal(getModelFamilyConstraints("gpt-4o"), null);
  assert.equal(getModelFamilyConstraints(""), null);
  assert.equal(getModelFamilyConstraints(undefined), null);
});

test("gpt-oss has no reasoning off switch: suppress and cleanup both floor at low", async () => {
  const { getModelFamilyConstraints } = await load();
  const effort = getModelFamilyConstraints("gpt-oss-120b")?.reasoningEffort;
  assert.deepEqual(effort, { suppressValue: "low", cleanupValue: "low" });
});

test("the gpt-5 family floors at minimal — the fast lane's latency depends on it", async () => {
  const { getModelFamilyConstraints } = await load();
  for (const id of ["gpt-5-nano", "gpt-5-mini", "gpt-5.5", "gpt-5.6-luna"]) {
    const family = getModelFamilyConstraints(id);
    assert.equal(family?.family, "gpt-5", id);
    assert.equal(family?.reasoningEffort?.suppressValue, "minimal", id);
  }
});

test("the gpt-5 anchor excludes its lookalikes", async () => {
  const { getModelFamilyConstraints } = await load();
  // gpt-oss must keep its own family (its ids arrive prefixed), and the
  // non-reasoning gpt-4.1 generation must match nothing.
  assert.equal(getModelFamilyConstraints("openai/gpt-oss-120b")?.family, "gpt-oss");
  assert.equal(getModelFamilyConstraints("gpt-4.1-nano"), null);
});
