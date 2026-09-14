const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/services/ai/reasoningEffortRecovery.ts");

const NEW_WORDING =
  "Unsupported value: 'minimal' is not supported with the 'gpt-5.5' model. " +
  "Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.";
const OLD_WORDING =
  "Unsupported value: 'reasoning_effort' does not support 'minimal' with this model. " +
  "Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.";
const FIRST_GEN_WORDING =
  "Unsupported value: 'none' is not supported with the 'gpt-5-nano' model. " +
  "Supported values are: 'minimal', 'low', 'medium', and 'high'.";

test("both wordings of the effort rejection yield the supported list", async () => {
  const { supportedEffortsFromError } = await load();
  const expected = ["none", "low", "medium", "high", "xhigh"];
  assert.deepEqual(supportedEffortsFromError(NEW_WORDING), expected);
  assert.deepEqual(supportedEffortsFromError(OLD_WORDING), expected);
  // Wrapped in an error body, double-quoted, with "max" on the end (5.6).
  assert.deepEqual(
    supportedEffortsFromError(
      '{"error":{"message":"Supported values are: \\"none\\", \\"low\\", \\"medium\\", \\"high\\", \\"xhigh\\", and \\"max\\"."}}'
    ),
    ["none", "low", "medium", "high", "xhigh", "max"]
  );
});

test("a supported-values list for some other parameter is not mistaken for an effort enum", async () => {
  const { supportedEffortsFromError } = await load();
  assert.equal(
    supportedEffortsFromError("Supported values are: 'auto', 'default', and 'flex'."),
    null
  );
  assert.equal(supportedEffortsFromError("model not found"), null);
  assert.equal(supportedEffortsFromError(""), null);
  assert.equal(supportedEffortsFromError(undefined), null);
});

test("the pick prefers a true off switch, then the floors", async () => {
  const { pickSuppressEffort } = await load();
  assert.equal(pickSuppressEffort(["none", "low", "medium", "high", "xhigh"]), "none");
  assert.equal(pickSuppressEffort(["minimal", "low", "medium", "high"]), "minimal");
  assert.equal(pickSuppressEffort(["low", "medium", "high"]), "low");
  assert.equal(pickSuppressEffort(["medium", "high"]), null);
});

test("learning from an error remembers the value per model and resolves ahead of the table", async () => {
  const {
    forgetLearnedEfforts,
    learnSuppressEffortFromError,
    learnedSuppressEffort,
    resolveSuppressEffort,
  } = await load();
  forgetLearnedEfforts();

  // The table's guess for a first-generation model is "minimal" — until the
  // API says otherwise for this one id.
  assert.equal(resolveSuppressEffort("gpt-5-nano", "x"), "minimal");
  assert.equal(learnSuppressEffortFromError("gpt-5-nano", "minimal", FIRST_GEN_WORDING), null);
  assert.equal(
    learnedSuppressEffort("gpt-5-nano"),
    null,
    "nothing better on offer: not remembered"
  );

  assert.equal(learnSuppressEffortFromError("gpt-5.5", "minimal", NEW_WORDING), "none");
  assert.equal(learnedSuppressEffort("GPT-5.5"), "none", "case-insensitive");
  assert.equal(resolveSuppressEffort("gpt-5.5", "x"), "none");
  // Unknown family, unlearned: the caller's fallback.
  assert.equal(resolveSuppressEffort("some-model", "low"), "low");

  forgetLearnedEfforts();
  assert.equal(learnedSuppressEffort("gpt-5.5"), null);
});

test("an error's text is read from message and responseBody alike", async () => {
  const { apiErrorText } = await load();
  assert.equal(apiErrorText(new Error("boom")), "boom");
  assert.equal(apiErrorText({ message: "m", responseBody: "{...}" }), "m\n{...}");
  assert.equal(apiErrorText(null), "");
  assert.equal(apiErrorText("string"), "");
});
