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

test("the undotted gpt-5 generation floors at minimal — it rejects none, and the fast lane's latency depends on it", async () => {
  const { getModelFamilyConstraints } = await load();
  for (const id of ["gpt-5", "gpt-5-nano", "gpt-5-mini", "GPT-5-Chat-Latest"]) {
    const family = getModelFamilyConstraints(id);
    assert.equal(family?.family, "gpt-5", id);
    assert.equal(family?.reasoningEffort?.suppressValue, "minimal", id);
  }
});

test("every dotted gpt-5.x generation rejects minimal and suppresses with its real off switch, none", async () => {
  const { getModelFamilyConstraints } = await load();
  // Live-probed 2026-09-11: 5.2 and 5.5 answer "Supported values are: 'none',
  // 'low', 'medium', 'high', and 'xhigh'" to "minimal", exactly like 5.6.
  // Sending "minimal" was "Enhancement error" on every note write-up.
  for (const id of [
    "gpt-5.2",
    "gpt-5.5",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "GPT-5.7",
  ]) {
    const family = getModelFamilyConstraints(id);
    assert.equal(family?.family, "gpt-5", id);
    assert.equal(family?.reasoningEffort?.suppressValue, "none", id);
  }
});

test("the gpt-5 anchor excludes its lookalikes", async () => {
  const { getModelFamilyConstraints } = await load();
  // gpt-oss must keep its own family (its ids arrive prefixed), and the
  // non-reasoning gpt-4.1 generation must match nothing.
  assert.equal(getModelFamilyConstraints("openai/gpt-oss-120b")?.family, "gpt-oss");
  assert.equal(getModelFamilyConstraints("gpt-4.1-nano"), null);
});
