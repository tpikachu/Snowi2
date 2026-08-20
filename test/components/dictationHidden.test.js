const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Dictation is switched off for V1 (features.DICTATION_ENABLED). These tests
 * are about the ways it kept showing anyway: a surface named for what it does
 * rather than for dictation, and a default that pointed at a hidden tab.
 */

const load = () => import("../../src/components/settings/settingsNav.ts");
const loadFeatures = () => import("../../src/config/features.js");

const read = (relative) => fs.readFileSync(path.join(__dirname, "..", "..", relative), "utf8");

test("no reachable nav entry belongs to dictation", async () => {
  const { SETTINGS_SECTIONS } = await load();
  const { DICTATION_ENABLED, DICTATION_SETTINGS_IDS } = await loadFeatures();
  if (DICTATION_ENABLED) return;

  for (const section of SETTINGS_SECTIONS) {
    for (const entry of [...(section.anchors ?? []), ...(section.panels ?? [])]) {
      assert.equal(
        DICTATION_SETTINGS_IDS.has(entry.id),
        false,
        `${section.id} still lists ${entry.id}`
      );
    }
  }
});

test("no search result can land on a dictation surface", async () => {
  const { SETTINGS_SEARCH_INDEX } = await load();
  const { DICTATION_ENABLED, DICTATION_SETTINGS_IDS } = await loadFeatures();
  if (DICTATION_ENABLED) return;

  for (const entry of SETTINGS_SEARCH_INDEX) {
    assert.equal(DICTATION_SETTINGS_IDS.has(entry.anchor ?? ""), false, entry.labelKey);
    assert.equal(DICTATION_SETTINGS_IDS.has(entry.panel ?? ""), false, entry.labelKey);
  }
});

test("the first tab of each panelled section is one the user can see", async () => {
  const { SPEECH_TABS, LLM_TABS } = await load();
  const { DICTATION_SETTINGS_IDS } = await loadFeatures();

  // SettingsPage defaults its tab props to these. A literal default was how
  // the dictation panels stayed reachable with no tab to match them.
  assert.ok(SPEECH_TABS.length > 0);
  assert.ok(LLM_TABS.length > 0);
  assert.equal(DICTATION_SETTINGS_IDS.has(SPEECH_TABS[0]), false);
  assert.equal(DICTATION_SETTINGS_IDS.has(LLM_TABS[0]), false);
});

test("SettingsPage does not default its tabs to a literal", () => {
  const source = read("src/components/SettingsPage.tsx");

  assert.match(source, /speechTab = SPEECH_TABS\[0\]/);
  assert.match(source, /llmTab = LLM_TABS\[0\]/);
});

test("SettingsGroup hides a group belonging to a hidden feature", () => {
  // The single choke point: the nav pane filters anchors through
  // isVisibleEntry, and a group that does not consult the same predicate is
  // how a whole block of dictation settings stays on screen with no nav link.
  const source = read("src/components/settings/SettingsGroup.tsx");

  assert.match(source, /isVisibleEntry/);
  assert.match(source, /if \(!isVisibleEntry\(id\)\) return null;/);
});

test("the dictation-only general groups are named in the hidden set", async () => {
  const { DICTATION_SETTINGS_IDS } = await loadFeatures();

  // Each of these reads as a general setting and is not:
  //   sound        -> dictationCues + pauseMediaOnDictation
  //   floatingIcon -> the dictation HUD's auto-hide
  //   waylandPaste -> ydotool setup for auto-paste
  for (const id of ["sound", "floatingIcon", "waylandPaste"]) {
    assert.equal(DICTATION_SETTINGS_IDS.has(id), true, id);
  }
});

test("the shared VAD group filters its dictation toggle on its own", () => {
  // renderWhisperVadSettings is mounted under Note Recording too, so the
  // group id is not "dictation" and SettingsGroup cannot hide the row.
  const source = read("src/components/SettingsPage.tsx");
  const group = source.slice(source.indexOf("const renderWhisperVadSettings"));
  const dictationToggle = group.indexOf("vad.toggles.dictation.title");
  const guard = group.indexOf("{DICTATION_ENABLED && (");

  assert.ok(dictationToggle > 0, "the dictation VAD toggle still exists");
  assert.ok(guard > 0 && guard < dictationToggle, "and it is behind the flag");
});
