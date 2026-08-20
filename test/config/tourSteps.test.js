const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const LOCALES = path.join(ROOT, "src", "locales");

const loadSteps = () => import("../../src/config/tourSteps.ts");
const loadSetup = () => import("../../src/utils/tourSetup.ts");

const languages = fs
  .readdirSync(LOCALES)
  .filter((entry) => fs.statSync(path.join(LOCALES, entry)).isDirectory());

const translation = (lang) =>
  JSON.parse(fs.readFileSync(path.join(LOCALES, lang, "translation.json"), "utf8"));

const lookup = (tree, key) =>
  key.split(".").reduce((node, part) => (node == null ? undefined : node[part]), tree);

/** Every file that could carry a `data-tour` anchor. */
function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "dist" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(tsx|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const allSource = sourceFiles(path.join(ROOT, "src"))
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");

test("every step points at an anchor something actually renders", async () => {
  const { TOUR_STEPS } = await loadSteps();

  for (const step of TOUR_STEPS) {
    // The anchor is set either directly (data-tour="x") or through the rail's
    // tourAnchor prop, as a JSX attribute or an entry in its navItems array.
    const declared = new RegExp(
      `(data-tour=|tourAnchor[:=] ?)"${step.anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`
    );
    assert.match(allSource, declared, `${step.id} points at a missing anchor: ${step.anchor}`);
  }
});

test("every step's copy exists in every language", async () => {
  const { TOUR_STEPS } = await loadSteps();

  for (const lang of languages) {
    const tree = translation(lang);
    for (const step of TOUR_STEPS) {
      const keys = [step.titleKey, step.bodyKey, step.bodyKeyWhenReady, step.action?.labelKey];
      for (const key of keys.filter(Boolean)) {
        const value = lookup(tree, key);
        assert.equal(typeof value, "string", `${lang} is missing ${key}`);
        assert.notEqual(value.trim(), "", `${lang} has ${key} empty`);
      }
    }
  }
});

test("the tour covers model setup, because a fresh install has none", async () => {
  const { TOUR_STEPS } = await loadSteps();
  const setup = TOUR_STEPS.find((step) => step.id === "models");

  assert.ok(setup, "the model-setup step is the one a new user cannot skip past safely");
  assert.equal(setup.action?.settingsSection, "llms");
  // Ahead of notes/chat/home: those describe features that do not work
  // properly until this one is done.
  const order = TOUR_STEPS.map((step) => step.id);
  assert.ok(order.indexOf("models") < order.indexOf("chat"), "setup comes before chat");
  assert.ok(order.indexOf("models") < order.indexOf("notes"), "setup comes before notes");
});

test("a changed tour re-runs for someone who already finished it", async () => {
  const { TOUR_VERSION } = await loadSteps();
  // The steps changed, so a completed-at-1 install must see the new ones.
  assert.ok(TOUR_VERSION >= 2, "TOUR_VERSION must be bumped when the steps change");
});

test("setup counts as done only when both model-backed features have one", async () => {
  const { isModelSetupComplete } = await loadSetup();

  assert.equal(isModelSetupComplete({ noteFormattingModel: "a", chatModel: "b" }), true);
  // A write-up model with no chat model still lands the user on a chat that
  // cannot answer — which is the confusion the step exists to prevent.
  assert.equal(isModelSetupComplete({ noteFormattingModel: "a" }), false);
  assert.equal(isModelSetupComplete({ chatModel: "b" }), false);
  assert.equal(isModelSetupComplete({}), false);
  assert.equal(isModelSetupComplete({ noteFormattingModel: "  ", chatModel: "b" }), false);
  assert.equal(isModelSetupComplete({ noteFormattingModel: null, chatModel: null }), false);
});

test("the setup step changes its copy and drops its button once configured", async () => {
  const { TOUR_STEPS } = await loadSteps();
  const { tourStepBodyKey, showsTourAction } = await loadSetup();
  const setup = TOUR_STEPS.find((step) => step.id === "models");

  assert.equal(tourStepBodyKey(setup, false), setup.bodyKey);
  assert.equal(tourStepBodyKey(setup, true), setup.bodyKeyWhenReady);
  assert.equal(showsTourAction(setup, false), true);
  assert.equal(showsTourAction(setup, true), false, "no nagging a configured install");
});

test("steps with one body read the same either way", async () => {
  const { TOUR_STEPS } = await loadSteps();
  const { tourStepBodyKey, showsTourAction } = await loadSetup();

  for (const step of TOUR_STEPS.filter((s) => !s.bodyKeyWhenReady)) {
    assert.equal(tourStepBodyKey(step, true), step.bodyKey, step.id);
    assert.equal(tourStepBodyKey(step, false), step.bodyKey, step.id);
  }
  for (const step of TOUR_STEPS.filter((s) => !s.action)) {
    assert.equal(showsTourAction(step, false), false, step.id);
  }
});

test("step ids are unique, so the progress dots track the right step", async () => {
  const { TOUR_STEPS } = await loadSteps();
  const ids = TOUR_STEPS.map((step) => step.id);

  assert.equal(new Set(ids).size, ids.length);
});
