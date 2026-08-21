const test = require("node:test");
const assert = require("node:assert/strict");

const {
  migrateActionsScopeKeys,
  ACTIONS_SCOPE_RENAMES,
  LLM_TAB_KEY,
} = require("../../src/utils/actionsScopeMigration.ts");

const storage = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    all: () => Object.fromEntries(map),
  };
};

test("a configured model survives the rename", () => {
  const store = storage({
    noteFormattingMode: "providers",
    noteFormattingProvider: "anthropic",
    noteFormattingModel: "claude-sonnet-4-6",
  });
  migrateActionsScopeKeys(store);
  assert.equal(store.getItem("actionsMode"), "providers");
  assert.equal(store.getItem("actionsProvider"), "anthropic");
  assert.equal(store.getItem("actionsModel"), "claude-sonnet-4-6");
});

test("the old keys are left in place for a downgrade", () => {
  const store = storage({ noteFormattingModel: "gpt-5-mini" });
  migrateActionsScopeKeys(store);
  assert.equal(store.getItem("noteFormattingModel"), "gpt-5-mini");
});

test("a value chosen since the migration is never clobbered", () => {
  // Second launch: the user has since picked a different model, and the stale
  // pre-rename value must not overwrite it.
  const store = storage({ noteFormattingModel: "old-model", actionsModel: "new-model" });
  migrateActionsScopeKeys(store);
  assert.equal(store.getItem("actionsModel"), "new-model");
});

test("an empty string is a real setting, not a missing one", () => {
  // "" is how a cleared endpoint is stored; treating it as absent would leave
  // the new key unset and the scope falling back to a stale default.
  const store = storage({ noteFormattingCloudBaseUrl: "" });
  migrateActionsScopeKeys(store);
  assert.equal(store.getItem("actionsCloudBaseUrl"), "");
});

test("a fresh install is left completely alone", () => {
  const store = storage({});
  migrateActionsScopeKeys(store);
  assert.deepEqual(store.all(), {});
});

test("running twice changes nothing the first run did not", () => {
  const store = storage({ noteFormattingModel: "gpt-5-mini", noteFormattingMode: "providers" });
  migrateActionsScopeKeys(store);
  const afterFirst = store.all();
  migrateActionsScopeKeys(store);
  assert.deepEqual(store.all(), afterFirst);
});

test("the remembered settings tab follows the rename", () => {
  const store = storage({ [LLM_TAB_KEY]: "noteFormatting" });
  migrateActionsScopeKeys(store);
  assert.equal(store.getItem(LLM_TAB_KEY), "actions");
});

test("someone else's remembered tab is not touched", () => {
  const store = storage({ [LLM_TAB_KEY]: "chatIntelligence" });
  migrateActionsScopeKeys(store);
  assert.equal(store.getItem(LLM_TAB_KEY), "chatIntelligence");
});

test("every renamed key maps noteFormatting* onto actions*", () => {
  // Guards against a typo in the table itself, which would migrate a setting
  // into a key nothing reads — indistinguishable from losing it.
  for (const [from, to] of ACTIONS_SCOPE_RENAMES) {
    assert.match(from, /^noteFormatting[A-Z]/, `${from} is not an old scope key`);
    assert.equal(to, `actions${from.slice("noteFormatting".length)}`);
  }
});

test("the secret API key is deliberately not migrated here", () => {
  // It lives encrypted under userData/secure-keys, not in web storage. A row
  // for it would migrate an empty string over a key loaded later by IPC.
  const names = ACTIONS_SCOPE_RENAMES.map(([from]) => from);
  assert.equal(names.includes("noteFormattingCustomApiKey"), false);
});
