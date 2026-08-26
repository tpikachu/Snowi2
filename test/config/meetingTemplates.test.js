const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  MEETING_TEMPLATES,
  meetingTemplateById,
  templatePromptFor,
} = require("../../src/config/meetingTemplates.ts");
const { meetingSystemPrompt } = require("../../src/stores/actionProcessingStore.ts");

test("unknown, empty and missing ids resolve to the default template", () => {
  assert.equal(meetingTemplateById(undefined).id, "default");
  assert.equal(meetingTemplateById(null).id, "default");
  assert.equal(meetingTemplateById("deleted-someday").id, "default");
  assert.equal(templatePromptFor(null), "");
  assert.equal(templatePromptFor("standup").length > 0, true);
});

test("template ids are unique and every non-default template carries a prompt", () => {
  const ids = MEETING_TEMPLATES.map((template) => template.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const template of MEETING_TEMPLATES) {
    if (template.id === "default") assert.equal(template.prompt, "");
    else assert.ok(template.prompt.trim().length > 0, template.id);
  }
});

test("every template label key exists in the English strings", () => {
  const translations = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../../src/locales/en/translation.json"), "utf8")
  );
  for (const template of MEETING_TEMPLATES) {
    const value = template.labelKey.split(".").reduce((node, key) => node?.[key], translations);
    assert.equal(typeof value, "string", template.labelKey);
  }
});

test("the template addendum sits before the action instructions", () => {
  const withTemplate = meetingSystemPrompt("This is a standup.");
  assert.ok(withTemplate.includes("TEMPLATE"));
  assert.ok(withTemplate.includes("This is a standup."));
  assert.ok(withTemplate.endsWith("Instructions: "), "action prompt is appended after this");
  assert.ok(
    withTemplate.indexOf("FORMAT RULES") < withTemplate.indexOf("This is a standup."),
    "base rules come first, so the template can override the default headings"
  );
});

test("no template means the prompt is the unmodified base", () => {
  const bare = meetingSystemPrompt();
  assert.ok(!bare.includes("TEMPLATE"));
  assert.equal(bare, meetingSystemPrompt(""));
  assert.equal(bare, meetingSystemPrompt("   "));
  assert.ok(bare.endsWith("Instructions: "));
});
