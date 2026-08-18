const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/agentNameDictionary.js");

// An empty delta means no write at all, which is what stops startup from
// touching the dictionary when the renderer cache is stale (#1295).
test("asks for no changes when the agent name is already present", async () => {
  const { agentNameDictionaryChanges } = await load();
  const result = agentNameDictionaryChanges(["Snowi", "Alice", "Bob"], "Snowi");
  assert.deepEqual(result, { add: [], remove: [] });
});

test("asks for no changes for a stale one-word cache that already has the name", async () => {
  const { agentNameDictionaryChanges } = await load();
  assert.deepEqual(agentNameDictionaryChanges(["Snowi"], "Snowi"), {
    add: [],
    remove: [],
  });
});

test("adds the agent name when missing, without naming other words", async () => {
  const { agentNameDictionaryChanges } = await load();
  assert.deepEqual(agentNameDictionaryChanges(["Alice"], "Snowi"), {
    add: ["Snowi"],
    remove: [],
  });
});

test("swaps the previous agent name for the new one on rename", async () => {
  const { agentNameDictionaryChanges } = await load();
  assert.deepEqual(agentNameDictionaryChanges(["Snowi", "Alice"], "Jarvis", "Snowi"), {
    add: ["Jarvis"],
    remove: ["Snowi"],
  });
});

test("does not ask to remove an old name the dictionary never had", async () => {
  const { agentNameDictionaryChanges } = await load();
  assert.deepEqual(agentNameDictionaryChanges(["Jarvis", "Alice"], "Jarvis", "Snowi"), {
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
  const dictionary = ["Snowi", "Alice", "Bob", "Imported Term"];
  const { add, remove } = agentNameDictionaryChanges(dictionary, "Jarvis", "Snowi");
  assert.deepEqual([...add, ...remove].sort(), ["Jarvis", "Snowi"]);
});

test("does not remove agent name when only surrounding whitespace changes", async () => {
  const { agentNameDictionaryChanges } = await load();
  assert.deepEqual(agentNameDictionaryChanges(["Snowi"], "  Snowi  ", "Snowi"), {
    add: [],
    remove: [],
  });
});

test("removes previous agent name when oldName contains surrounding whitespace", async () => {
  const { agentNameDictionaryChanges } = await load();
  assert.deepEqual(
    agentNameDictionaryChanges(["Snowi", "Alice"], "Jarvis", "  Snowi  "),
    {
      add: ["Jarvis"],
      remove: ["Snowi"],
    }
  );
});
