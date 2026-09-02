const test = require("node:test");
const assert = require("node:assert/strict");

const { groupToolCalls } = require("../../src/utils/toolCallGroups.ts");

test("groups by name in first-appearance order", () => {
  const groups = groupToolCalls([
    { id: "1", name: "search_notes" },
    { id: "2", name: "get_note" },
    { id: "3", name: "get_note" },
  ]);
  assert.deepEqual(
    groups.map((g) => g.name),
    ["search_notes", "get_note"]
  );
  assert.deepEqual(
    groups[1].calls.map((c) => c.id),
    ["2", "3"]
  );
});

test("interleaved repeats still collapse into one group per tool", () => {
  const groups = groupToolCalls([
    { id: "1", name: "get_note" },
    { id: "2", name: "search_notes" },
    { id: "3", name: "get_note" },
    { id: "4", name: "get_note" },
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].name, "get_note");
  assert.equal(groups[0].calls.length, 3);
});

test("an empty list groups to nothing", () => {
  assert.deepEqual(groupToolCalls([]), []);
});
