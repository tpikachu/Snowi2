const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/micFailure.js");

test("maps each getUserMedia failure name onto its own code and key", async () => {
  const { describeMicFailure } = await load();

  const cases = [
    ["NotAllowedError", "MIC_PERMISSION_DENIED", "permissionDenied"],
    ["PermissionDeniedError", "MIC_PERMISSION_DENIED", "permissionDenied"],
    ["NotFoundError", "MIC_NOT_FOUND", "notFound"],
    ["DevicesNotFoundError", "MIC_NOT_FOUND", "notFound"],
    ["NotReadableError", "MIC_IN_USE", "inUse"],
    ["TrackStartError", "MIC_IN_USE", "inUse"],
    ["MicUnusableError", "MIC_UNUSABLE", "unusable"],
  ];

  for (const [name, code, key] of cases) {
    const error = Object.assign(new Error("boom"), { name });
    const described = describeMicFailure(error);
    assert.equal(described.code, code, name);
    assert.equal(described.titleKey, `hooks.audioRecording.micErrors.${key}.title`, name);
    assert.equal(described.messageKey, `hooks.audioRecording.micErrors.${key}.description`, name);
  }
});

test("an unrecognised failure falls back to the generic copy, carrying its reason", async () => {
  const { describeMicFailure } = await load();
  const described = describeMicFailure(Object.assign(new Error("weird"), { name: "OddError" }));

  assert.equal(described.code, "MIC_ERROR");
  assert.equal(described.messageKey, "hooks.audioRecording.micErrors.generic.description");
  assert.equal(described.messageParams.reason, "weird");
});

test("names the device only when one was chosen and nothing worked", async () => {
  const { describeMicFailure } = await load();
  const unusable = Object.assign(new Error("no audio"), { name: "MicUnusableError" });

  assert.equal(
    describeMicFailure(unusable, "CABLE Output").messageKey,
    "hooks.audioRecording.micErrors.unusable.descriptionWithDevice"
  );
  assert.equal(describeMicFailure(unusable, "CABLE Output").messageParams.device, "CABLE Output");

  // Auto-picked input: naming a device the user never chose would only confuse.
  assert.equal(
    describeMicFailure(unusable, "").messageKey,
    "hooks.audioRecording.micErrors.unusable.description"
  );

  // A device label is irrelevant to a permissions problem.
  const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
  assert.equal(
    describeMicFailure(denied, "CABLE Output").messageKey,
    "hooks.audioRecording.micErrors.permissionDenied.description"
  );
});

test("every key it can produce exists in the base locale", async () => {
  const { describeMicFailure } = await load();
  const en = require("../../src/locales/en/translation.json");

  const resolve = (dotted) => dotted.split(".").reduce((node, part) => node?.[part], en);

  const names = [
    "NotAllowedError",
    "NotFoundError",
    "NotReadableError",
    "MicUnusableError",
    "OddError",
  ];

  for (const name of names) {
    for (const label of ["", "Some Device"]) {
      const described = describeMicFailure(Object.assign(new Error("x"), { name }), label);
      assert.equal(typeof resolve(described.titleKey), "string", described.titleKey);
      assert.equal(typeof resolve(described.messageKey), "string", described.messageKey);
    }
  }
});
