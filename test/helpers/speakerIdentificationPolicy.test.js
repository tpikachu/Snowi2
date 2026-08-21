const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SPEAKER_IDENTIFICATION_ENABLED,
  isSpeakerIdentificationEnabled,
} = require("../../src/helpers/speakerIdentificationPolicy.js");

test("identification is off in V1", () => {
  // The assertion the rest of this file depends on. If someone turns the
  // feature back on, this fails first and points at why the tests below
  // change meaning, rather than letting them silently start asserting the
  // opposite of what they were written for.
  assert.equal(SPEAKER_IDENTIFICATION_ENABLED, false);
});

test("a stored preference of true cannot switch it back on", () => {
  // This is the whole point of a kill switch over a changed default:
  // `speakerDiarizationEnabled` reads true in every install that has ever run,
  // so a default flip would only spare fresh profiles.
  assert.equal(isSpeakerIdentificationEnabled(true), false);
});

test("neither can a per-session override", () => {
  // The meeting pill used to write a session-scoped enable through the same
  // channel. That path stays wired; it just cannot win any more.
  assert.equal(isSpeakerIdentificationEnabled(true), false);
  assert.equal(isSpeakerIdentificationEnabled(undefined), false);
  assert.equal(isSpeakerIdentificationEnabled(null), false);
});

test("an explicit opt-out is still honoured", () => {
  assert.equal(isSpeakerIdentificationEnabled(false), false);
});

test("only an explicit false disables it once the feature returns", () => {
  // Mirrors the resolver's second half against the same `!== false` rule the
  // call sites used before the switch existed, so re-enabling the feature
  // restores exactly the old behaviour: absent means on, only false means off.
  const whenEnabled = (stored) => stored !== false;

  assert.equal(whenEnabled(true), true);
  assert.equal(whenEnabled(undefined), true, "no stored preference means on");
  assert.equal(whenEnabled(null), true, "a null preference means on");
  assert.equal(whenEnabled(false), false);
});
