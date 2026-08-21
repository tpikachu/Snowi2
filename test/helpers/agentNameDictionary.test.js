const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/agentNameDictionary.js");

// An empty delta means no write at all, which is what stops startup from
// touching the dictionary when the renderer cache is stale (#1295).
test("asks for no changes when the agent name is already present", async () => {
  const { agentNameDictionaryChanges } = await load();
  const result = agentNameDictionaryChanges(["Snowy", "Alice", "Bob"], "Snowy");
  assert.deepEqual(result, { add: [], remove: [] });
});

test("asks for no changes for a stale one-word cache that already has the name", async () => {
  const { agentNameDictionaryChanges } = await load();
  assert.deepEqual(agentNameDictionaryChanges(["Snowy"], "Snowy"), {
    add: [],
    remove: [],
  });
});

test("adds the agent name when missing, without naming other words", async () => {
  const { agentNameDictionaryChanges } = await load();
  assert.deepEqual(agentNameDictionaryChanges(["Alice"], "Snowy"), {
    add: ["Snowy"],
    remove: [],
  });
});

test("swaps the previous agent name for the new one on rename", async () => {
  const { agentNameDictionaryChanges } = await load();
  assert.deepEqual(agentNameDictionaryChanges(["Snowy", "Alice"], "Jarvis", "Snowy"), {
    add: ["Jarvis"],
    remove: ["Snowy"],
  });
});

test("does not ask to remove an old name the dictionary never had", async () => {
  const { agentNameDictionaryChanges } = await load();
  assert.deepEqual(agentNameDictionaryChanges(["Jarvis", "Alice"], "Jarvis", "Snowy"), {
    add: [],
    remove: [],
  });
});

test("ignores a blank agent name", async () => {
  const { agentNameDictionaryChanges } = await load();
  assert.deepEqual(agentNameDictionaryChanges(["Alice"], "   "), { add: [], remove: [] });
});

test("never names a word outside the agent name itself", async () => {
  const { agentNameDictionaryChanges } = await load();
  const dictionary = ["Snowy", "Alice", "Bob", "Imported Term"];
  const { add, remove } = agentNameDictionaryChanges(dictionary, "Jarvis", "Snowy");
  assert.deepEqual([...add, ...remove].sort(), ["Jarvis", "Snowy"]);
});

test("does not remove agent name when only surrounding whitespace changes", async () => {
  const { agentNameDictionaryChanges } = await load();
  assert.deepEqual(agentNameDictionaryChanges(["Snowy"], "  Snowy  ", "Snowy"), {
    add: [],
    remove: [],
  });
});

test("removes previous agent name when oldName contains surrounding whitespace", async () => {
  const { agentNameDictionaryChanges } = await load();
  assert.deepEqual(agentNameDictionaryChanges(["Snowy", "Alice"], "Jarvis", "  Snowy  "), {
    add: ["Jarvis"],
    remove: ["Snowy"],
  });
});
