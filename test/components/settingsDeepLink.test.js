const test = require("node:test");
const assert = require("node:assert/strict");

async function load() {
  return await import("../../src/components/settings/settingsNav.ts");
}

test("a link naming a panel lands on that panel", async () => {
  const { resolveDeepLink } = await load();

  assert.deepEqual(resolveDeepLink("llms", "actions"), { section: "llms", llmTab: "actions" });
  assert.deepEqual(resolveDeepLink("llms", "chatIntelligence"), {
    section: "llms",
    llmTab: "chatIntelligence",
  });
  assert.deepEqual(resolveDeepLink("speechToText", "noteRecording"), {
    section: "speechToText",
    speechTab: "noteRecording",
  });
});

test("a legacy section id resolves to its section and its sub-tab", async () => {
  const { resolveDeepLink } = await load();

  // Old "meetings" links predate the Actions rename and carry no panel.
  assert.deepEqual(resolveDeepLink("meetings"), { section: "llms", llmTab: "actions" });
});

test("a link into a hidden feature keeps the section and drops the panel", async () => {
  const { resolveDeepLink } = await load();

  // Dictation is off in V1, so its panels are filtered out of SPEECH_TABS and
  // LLM_TABS. The link still has to land somewhere reachable rather than
  // select a tab the nav pane does not render.
  assert.deepEqual(resolveDeepLink("transcription"), { section: "speechToText" });
  assert.deepEqual(resolveDeepLink("llms", "dictationCleanup"), { section: "llms" });

  // Upload is off too (its view is hidden from the icon rail), so legacy
  // upload links land on the section rather than a tab that is not rendered.
  assert.deepEqual(resolveDeepLink("uploadTranscription"), { section: "speechToText" });
  assert.deepEqual(resolveDeepLink("speechToText", "upload"), { section: "speechToText" });
});

test("an explicit panel beats the legacy sub-tab for the same section", async () => {
  const { resolveDeepLink } = await load();

  assert.deepEqual(resolveDeepLink("meetings", "chatIntelligence"), {
    section: "llms",
    llmTab: "chatIntelligence",
  });
});

test("a panel the section does not have is dropped, not guessed", async () => {
  const { resolveDeepLink } = await load();

  // The caller falls back to a *stored* tab, so returning a bogus panel here
  // would be worse than returning none: it would look like a successful nav.
  assert.deepEqual(resolveDeepLink("llms", "noteRecording"), { section: "llms" });
  assert.deepEqual(resolveDeepLink("llms", "noteFormatting"), { section: "llms" });
  assert.deepEqual(resolveDeepLink("privacyData", "actions"), { section: "privacyData" });
});

test("every remedy for a visible feature points at a panel that exists", async () => {
  const { resolveDeepLink, isVisibleEntry } = await load();
  const { SETTINGS_REMEDIES } = await import("../../src/config/settingsRemedies.ts");

  // The bug this guards: Home's "Set up" for Actions opened Language Models on
  // whichever tab was last visited. A remedy that names a panel has to resolve
  // to one, or the button silently lands somewhere unrelated.
  for (const [remedy, link] of Object.entries(SETTINGS_REMEDIES)) {
    const resolved = resolveDeepLink(link.section, link.panel);
    assert.equal(resolved.section, link.section, `${remedy} keeps its section`);
    if (!isVisibleEntry(link.panel)) continue;
    assert.equal(
      resolved.speechTab ?? resolved.llmTab,
      link.panel,
      `${remedy} resolves to its named panel`
    );
  }
});
