const test = require("node:test");
const assert = require("node:assert/strict");

async function load() {
  return await import("../../src/stores/settingsNavigationStore.ts");
}

test("nothing is pending until something asks", async () => {
  const { consumeSettingsRequest } = await load();
  assert.equal(consumeSettingsRequest(), null);
});

test("carries the section and panel through to the consumer, then clears", async () => {
  const { requestSettings, consumeSettingsRequest } = await load();

  requestSettings({ section: "llms", panel: "actions" });
  assert.deepEqual(consumeSettingsRequest(), { section: "llms", panel: "actions" });

  // Cleared on read: the request is a one-shot instruction, not state. Leaving
  // it set would re-open settings on the next unrelated store update.
  assert.equal(consumeSettingsRequest(), null);
});

test("the panel is optional", async () => {
  const { requestSettings, consumeSettingsRequest } = await load();

  requestSettings({ section: "privacyData" });
  assert.deepEqual(consumeSettingsRequest(), { section: "privacyData" });
});

test("asking for the same target twice is two distinct requests", async () => {
  const { requestSettings, useSettingsNavigationStore } = await load();

  const before = useSettingsNavigationStore.getState().nonce;
  requestSettings({ section: "llms", panel: "actions" });
  const once = useSettingsNavigationStore.getState().nonce;
  requestSettings({ section: "llms", panel: "actions" });
  const twice = useSettingsNavigationStore.getState().nonce;

  // The reason the nonce exists: a user who dismisses settings and clicks the
  // same toast action again must be taken back. An unchanged `pending` object
  // alone would look like nothing happened.
  assert.equal(once, before + 1);
  assert.equal(twice, once + 1);
});
