const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const {
  MeetingCryptoError,
  KEY_BYTES,
  generateKey,
  buildAad,
  seal,
  open,
  sealJson,
  openJson,
  wrapKey,
  unwrapKey,
} = require("../../src/helpers/meetingCrypto.js");

const AAD = {
  meetingId: "mtg_0198",
  objectType: "transcript",
  objectId: "seg_0042",
  schemaVersion: "snowi.meeting.v1",
};

test("round-trips content under the same key and AAD", () => {
  const key = generateKey();
  const aad = buildAad(AAD);
  const plaintext = Buffer.from("They are concerned about per-seat pricing.", "utf8");

  const envelope = seal({ key, plaintext, aad });
  assert.deepEqual(open({ key, envelope, aad }), plaintext);
});

test("generates 256-bit keys", () => {
  assert.equal(generateKey().length, KEY_BYTES);
  assert.notDeepEqual(generateKey(), generateKey());
});

test("never writes the plaintext into the envelope", () => {
  const key = generateKey();
  const envelope = seal({
    key,
    plaintext: "per-seat pricing objection",
    aad: buildAad(AAD),
  });
  assert.equal(envelope.includes(Buffer.from("per-seat", "utf8")), false);
});

test("uses a fresh nonce for every operation, so identical content differs on disk", () => {
  const key = generateKey();
  const aad = buildAad(AAD);
  const seals = new Set();
  for (let i = 0; i < 200; i += 1) {
    seals.add(seal({ key, plaintext: "same text", aad }).toString("hex"));
  }
  // A repeated nonce under one key is a total GCM break, so this must never collide.
  assert.equal(seals.size, 200);
});

test("rejects a key of the wrong length", () => {
  const aad = buildAad(AAD);
  assert.throws(
    () => seal({ key: crypto.randomBytes(16), plaintext: "x", aad }),
    MeetingCryptoError
  );
});

test("fails to open with a different key", () => {
  const aad = buildAad(AAD);
  const envelope = seal({ key: generateKey(), plaintext: "secret", aad });
  assert.throws(() => open({ key: generateKey(), envelope, aad }), MeetingCryptoError);
});

// §21.2: the AAD binds a blob to its meeting, type, id and schema. Without it,
// disk-level attackers could move one meeting's summary into another.
test("fails to open when any AAD field differs", () => {
  const key = generateKey();
  const envelope = seal({ key, plaintext: "secret", aad: buildAad(AAD) });

  for (const field of ["meetingId", "objectType", "objectId", "schemaVersion"]) {
    const tampered = buildAad({ ...AAD, [field]: `${AAD[field]}-other` });
    assert.throws(() => open({ key, envelope, aad: tampered }), MeetingCryptoError, field);
  }
});

test("AAD is unambiguous across field boundaries", () => {
  // Plain concatenation would make these two identical.
  const a = buildAad({ ...AAD, meetingId: "ab", objectType: "c" });
  const b = buildAad({ ...AAD, meetingId: "a", objectType: "bc" });
  assert.notDeepEqual(a, b);
});

test("AAD requires every field", () => {
  assert.throws(() => buildAad({ ...AAD, meetingId: "" }), MeetingCryptoError);
  assert.throws(() => buildAad({ ...AAD, objectId: undefined }), MeetingCryptoError);
});

test("detects tampering anywhere in the envelope", () => {
  const key = generateKey();
  const aad = buildAad(AAD);
  const original = seal({ key, plaintext: "a decision was made", aad });

  for (const index of [0, 4, 5, 10, 20, original.length - 1]) {
    const tampered = Buffer.from(original);
    tampered[index] ^= 0xff;
    assert.throws(
      () => open({ key, envelope: tampered, aad }),
      MeetingCryptoError,
      `byte ${index}`
    );
  }
});

test("rejects truncated or foreign envelopes", () => {
  const key = generateKey();
  const aad = buildAad(AAD);
  const envelope = seal({ key, plaintext: "x", aad });

  assert.throws(() => open({ key, envelope: envelope.subarray(0, 20), aad }), MeetingCryptoError);
  assert.throws(() => open({ key, envelope: crypto.randomBytes(64), aad }), MeetingCryptoError);
});

test("round-trips JSON", () => {
  const key = generateKey();
  const aad = buildAad(AAD);
  const value = { summary: "…", topics: ["pricing"], nested: { count: 3 } };
  assert.deepEqual(openJson({ key, envelope: sealJson({ key, value, aad }), aad }), value);
});

test("wraps and unwraps a per-meeting data key", () => {
  const installationKey = generateKey();
  const dek = generateKey();

  const wrapped = wrapKey({ wrappingKey: installationKey, key: dek, meetingId: "mtg_1" });
  assert.equal(wrapped.includes(dek), false, "wrapped key must not contain the raw DEK");
  assert.deepEqual(
    unwrapKey({ wrappingKey: installationKey, envelope: wrapped, meetingId: "mtg_1" }),
    dek
  );
});

// A wrapped DEK copied into another meeting's folder must be inert.
test("a wrapped key does not unwrap under another meeting id", () => {
  const installationKey = generateKey();
  const wrapped = wrapKey({
    wrappingKey: installationKey,
    key: generateKey(),
    meetingId: "mtg_1",
  });

  assert.throws(
    () => unwrapKey({ wrappingKey: installationKey, envelope: wrapped, meetingId: "mtg_2" }),
    MeetingCryptoError
  );
});

test("a wrapped key does not unwrap under a different installation key", () => {
  const wrapped = wrapKey({
    wrappingKey: generateKey(),
    key: generateKey(),
    meetingId: "mtg_1",
  });

  assert.throws(
    () => unwrapKey({ wrappingKey: generateKey(), envelope: wrapped, meetingId: "mtg_1" }),
    MeetingCryptoError
  );
});

// The header is inside the AAD precisely so a downgrade attempt breaks the tag
// rather than steering a future reader onto a weaker algorithm.
test("rejects a rewritten version or algorithm byte", () => {
  const key = generateKey();
  const aad = buildAad(AAD);
  const envelope = seal({ key, plaintext: "x", aad });

  const downgradedVersion = Buffer.from(envelope);
  downgradedVersion[4] = 2;
  assert.throws(() => open({ key, envelope: downgradedVersion, aad }), MeetingCryptoError);

  const downgradedAlgorithm = Buffer.from(envelope);
  downgradedAlgorithm[5] = 2;
  assert.throws(() => open({ key, envelope: downgradedAlgorithm, aad }), MeetingCryptoError);
});
