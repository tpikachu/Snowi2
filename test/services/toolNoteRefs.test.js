const test = require("node:test");
const assert = require("node:assert/strict");

async function load() {
  return await import("../../src/services/tools/ToolRegistry.ts");
}

function stubTool(result) {
  return {
    name: "list_meetings",
    description: "stub",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    readOnly: true,
    execute: async () => result,
  };
}

const REFS = [
  { id: 3, title: "Vendor sync" },
  { id: 7, title: "Q3 planning" },
];

test("note refs reach the UI without reaching the model", async () => {
  const { ToolRegistry } = await load();
  const registry = new ToolRegistry();
  registry.register(
    stubTool({ success: true, data: { total: 2 }, displayText: "Found 2 meetings", noteRefs: REFS })
  );

  const modelVisible = await registry.toAISDKFormat().list_meetings.execute(
    {},
    { toolCallId: "call-1" }
  );

  // The whole reason noteRefs travels beside `data` rather than inside it: the
  // execute return value is what the model reads back as the tool's answer.
  assert.deepEqual(modelVisible, { total: 2 });
  assert.deepEqual(registry.takeNoteRefs("call-1"), REFS);
});

test("refs are keyed by call, so parallel calls do not collide", async () => {
  const { ToolRegistry } = await load();
  const registry = new ToolRegistry();
  const other = [{ id: 11, title: "Standup" }];
  let next = REFS;
  registry.register({
    ...stubTool(null),
    execute: async () => ({ success: true, data: {}, displayText: "ok", noteRefs: next }),
  });

  const tool = registry.toAISDKFormat().list_meetings;
  await tool.execute({}, { toolCallId: "a" });
  next = other;
  await tool.execute({}, { toolCallId: "b" });

  assert.deepEqual(registry.takeNoteRefs("a"), REFS);
  assert.deepEqual(registry.takeNoteRefs("b"), other);
});

test("taking consumes, so a call cannot be read twice", async () => {
  const { ToolRegistry } = await load();
  const registry = new ToolRegistry();
  registry.register(stubTool({ success: true, data: {}, displayText: "ok", noteRefs: REFS }));

  await registry.toAISDKFormat().list_meetings.execute({}, { toolCallId: "call-1" });

  assert.deepEqual(registry.takeNoteRefs("call-1"), REFS);
  assert.equal(registry.takeNoteRefs("call-1"), undefined);
});

test("a call that referenced no notes records nothing", async () => {
  const { ToolRegistry } = await load();
  const registry = new ToolRegistry();
  registry.register(stubTool({ success: true, data: { ok: true }, displayText: "ok" }));

  await registry.toAISDKFormat().list_meetings.execute({}, { toolCallId: "call-1" });

  assert.equal(registry.takeNoteRefs("call-1"), undefined);
  assert.equal(registry.takeNoteRefs(undefined), undefined);
});

test("a failing tool reports its message to the model and records no refs", async () => {
  const { ToolRegistry } = await load();
  const registry = new ToolRegistry();
  registry.register(stubTool({ success: false, data: null, displayText: "Space not found" }));

  const modelVisible = await registry.toAISDKFormat().list_meetings.execute(
    {},
    { toolCallId: "call-1" }
  );

  assert.deepEqual(modelVisible, { error: "Space not found" });
  assert.equal(registry.takeNoteRefs("call-1"), undefined);
});
