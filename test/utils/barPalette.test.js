const test = require("node:test");
const assert = require("node:assert/strict");

const {
  filterBarPalette,
  groupBarPalette,
  BAR_PALETTE_GROUP_ORDER,
} = require("../../src/utils/barPalette.ts");

const rows = [
  { id: "startMeeting", group: "actions", label: "Start meeting" },
  { id: "appWindow", group: "actions", label: "Open app window" },
  { id: "settings-general", group: "settings", label: "Preferences" },
  { id: "settings-hotkeys", group: "settings", label: "Hotkeys" },
  { id: "settings-llms", group: "settings", label: "Language models" },
];

test("an empty query keeps every row", () => {
  assert.equal(filterBarPalette(rows, "").length, rows.length);
  assert.equal(filterBarPalette(rows, "   ").length, rows.length);
});

test("filtering is a case-insensitive substring match on the label", () => {
  assert.deepEqual(
    filterBarPalette(rows, "HOT").map((r) => r.id),
    ["settings-hotkeys"]
  );
  assert.deepEqual(
    filterBarPalette(rows, "app win").map((r) => r.id),
    ["appWindow"]
  );
  assert.deepEqual(filterBarPalette(rows, "zzz"), []);
});

test("grouping renders actions before settings and drops empty groups", () => {
  const grouped = groupBarPalette(rows);
  assert.deepEqual(
    grouped.map((g) => g.group),
    ["actions", "settings"]
  );
  assert.deepEqual(BAR_PALETTE_GROUP_ORDER, ["actions", "settings"]);

  const settingsOnly = groupBarPalette(filterBarPalette(rows, "hot"));
  assert.deepEqual(
    settingsOnly.map((g) => g.group),
    ["settings"]
  );
  assert.equal(settingsOnly[0].rows.length, 1);
});
