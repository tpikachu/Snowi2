const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/dictionaryStartup.js");

test("startup prefers SQLite when the DB is ahead of the renderer cache (#1295)", async () => {
  const { chooseDictionaryStartupAction } = await load();
  const decision = chooseDictionaryStartupAction(
    ["Snowi", "Alice", "Bob"],
    ["Snowi"]
  );
  assert.equal(decision.action, "pull-db-to-local");
  assert.deepEqual(decision.words, ["Snowi", "Alice", "Bob"]);
});

test("startup pushes the renderer cache into an empty DB", async () => {
  const { chooseDictionaryStartupAction } = await load();
  const decision = chooseDictionaryStartupAction([], ["Snowi", "Alice"]);
  assert.equal(decision.action, "push-local-to-db");
  assert.deepEqual(decision.words, ["Snowi", "Alice"]);
});

test("startup is a no-op when both sides are empty", async () => {
  const { chooseDictionaryStartupAction } = await load();
  const decision = chooseDictionaryStartupAction([], []);
  assert.equal(decision.action, "noop");
  assert.deepEqual(decision.words, []);
});

test("startup still prefers DB when the renderer cache is empty", async () => {
  const { chooseDictionaryStartupAction } = await load();
  const decision = chooseDictionaryStartupAction(["Snowi", "Carol"], []);
  assert.equal(decision.action, "pull-db-to-local");
  assert.deepEqual(decision.words, ["Snowi", "Carol"]);
});
