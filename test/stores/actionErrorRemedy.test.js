const test = require("node:test");
const assert = require("node:assert/strict");

async function load() {
  return await import("../../src/stores/actionProcessingStore.ts");
}

const ACTION = { id: 1, name: "Generate Notes", prompt: "Summarise.", is_builtin: 1 };
const LABELS = {
  noModel: "No AI model is set up for note formatting yet.",
  noEndpoint: "No self-hosted server URL is set for note formatting.",
  actionFailed: "Action failed",
};

test("an unconfigured model reports a remedy, not just a complaint", async () => {
  const { runBackgroundAction, consumeErrorEvents } = await load();
  consumeErrorEvents();

  runBackgroundAction(101, "some notes", "hash", ACTION, { modelId: "" }, LABELS);

  const [event, ...rest] = consumeErrorEvents();
  assert.equal(rest.length, 0);
  assert.equal(event.noteId, 101);
  assert.equal(event.message, LABELS.noModel);
  // The remedy is what lets the toast offer the trip to the setting. Without
  // it the user is told to configure something and left to find the page.
  assert.equal(event.remedy, "configureNoteFormatting");
});

test("consuming drains the queue", async () => {
  const { runBackgroundAction, consumeErrorEvents } = await load();
  consumeErrorEvents();

  runBackgroundAction(102, "some notes", "hash", ACTION, { modelId: "" }, LABELS);
  assert.equal(consumeErrorEvents().length, 1);
  assert.deepEqual(consumeErrorEvents(), []);
});
