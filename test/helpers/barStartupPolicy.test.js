const test = require("node:test");
const assert = require("node:assert");
const { shouldShowBarAtStartup } = require("../../src/helpers/barStartupPolicy");

test("shows the bar on a normal launch once onboarding is done", () => {
  assert.strictEqual(
    shouldShowBarAtStartup({ showBarAtStartup: true, onboardingDone: true, launchedHidden: false }),
    true
  );
});

test("stays hidden during the first run so onboarding owns the screen", () => {
  assert.strictEqual(
    shouldShowBarAtStartup({
      showBarAtStartup: true,
      onboardingDone: false,
      launchedHidden: false,
    }),
    false
  );
});

test("a hidden launch shows the bar even before onboarding — it is the only surface", () => {
  assert.strictEqual(
    shouldShowBarAtStartup({ showBarAtStartup: true, onboardingDone: false, launchedHidden: true }),
    true
  );
});

test("the user's opt-out beats everything", () => {
  assert.strictEqual(
    shouldShowBarAtStartup({ showBarAtStartup: false, onboardingDone: true, launchedHidden: true }),
    false
  );
});
