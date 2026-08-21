const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildMemoryProfile,
  decideConsolidation,
  memoryContentHash,
  minConfidenceFor,
  normalizeMemoryObject,
} = require("../../src/helpers/memoryObjects.js");

const CTX = { meetingId: "mtg_1", noteId: 7, now: "2026-08-19T10:00:00.000Z" };

function raw(overrides = {}) {
  return {
    type: "decision",
    content: "Ship the pricing page on Friday.",
    source_segments: ["7:seg-12"],
    confidence: 0.9,
    ...overrides,
  };
}

test("a well-formed object is accepted and filled in", () => {
  const result = normalizeMemoryObject(raw(), CTX);
  assert.equal(result.ok, true);
  assert.equal(result.object.meeting_id, "mtg_1");
  assert.equal(result.object.note_id, 7);
  assert.equal(result.object.status, "open");
  assert.equal(result.object.sync_status, "local_only", "V1 keeps everything local (§19.3)");
  assert.match(result.object.id, /^[0-9a-f-]{36}$/);
});

test("an object with no evidence is refused", () => {
  // §19.3. A claim the user cannot check is worse than no claim: the app would
  // repeat it back as fact with nothing behind it.
  assert.deepEqual(normalizeMemoryObject(raw({ source_segments: [] }), CTX), {
    ok: false,
    reason: "no_source_segments",
  });
  assert.equal(normalizeMemoryObject(raw({ source_segments: undefined }), CTX).ok, false);
});

test("invented types are refused", () => {
  assert.deepEqual(normalizeMemoryObject(raw({ type: "vibe" }), CTX), {
    ok: false,
    reason: "unknown_type",
  });
});

test("person_fact and preference need more confidence than other types", () => {
  // §19.3. A wrong action item is a stale task; a wrong person_fact is the
  // assistant misremembering who the user is, and it decays far more slowly.
  assert.equal(minConfidenceFor("decision"), 0.6);
  assert.equal(minConfidenceFor("person_fact"), 0.8);

  const middling = { confidence: 0.7, source_segments: ["7:seg-1"] };
  assert.equal(normalizeMemoryObject(raw(middling), CTX).ok, true);
  assert.equal(
    normalizeMemoryObject(raw({ ...middling, type: "person_fact" }), CTX).reason,
    "low_confidence"
  );
});

test("one malformed entry does not throw, so a batch survives it", () => {
  for (const bad of [null, undefined, "text", 42, {}]) {
    const result = normalizeMemoryObject(bad, CTX);
    assert.equal(result.ok, false);
    assert.ok(result.reason);
  }
});

test("subject stays a role, so it can live outside the encrypted store", () => {
  assert.equal(normalizeMemoryObject(raw({ subject: "user" }), CTX).object.subject, "user");
  // Anything else collapses to "other" — a person's name is content and belongs
  // in the sealed document, not in a queryable column.
  assert.equal(normalizeMemoryObject(raw({ subject: "Dana Ruiz" }), CTX).object.subject, "other");
});

test("the same claim reworded hashes the same", () => {
  // "pricing is $40k" and "Pricing is $40k." are one fact. Treating them as two
  // is how a store fills with the same sentence thirty times.
  const a = memoryContentHash({
    type: "project_fact",
    subject: "other",
    content: "Pricing is $40k.",
  });
  const b = memoryContentHash({
    type: "project_fact",
    subject: "other",
    content: "  pricing   is $40k  ",
  });
  assert.equal(a, b);
});

test("a different claim of the same kind hashes differently", () => {
  const a = memoryContentHash({
    type: "project_fact",
    subject: "other",
    content: "Pricing is $40k",
  });
  const b = memoryContentHash({
    type: "project_fact",
    subject: "other",
    content: "Pricing is $55k",
  });
  assert.notEqual(a, b);
});

test("a repeat of a known fact is a duplicate, not a new row", () => {
  const candidate = normalizeMemoryObject(
    raw({ type: "project_fact", content: "Pricing is $40k" }),
    CTX
  ).object;
  const existing = [{ ...candidate, id: "old-1" }];

  assert.deepEqual(decideConsolidation(candidate, existing), {
    action: "duplicate",
    target: "old-1",
  });
});

test("a changed fact supersedes the one it replaces", () => {
  const old = normalizeMemoryObject(
    raw({ type: "project_fact", content: "Pricing is $40k" }),
    CTX
  ).object;
  const next = normalizeMemoryObject(raw({ type: "project_fact", content: "Pricing is $55k" }), {
    ...CTX,
    now: "2026-09-01T10:00:00.000Z",
  }).object;

  assert.deepEqual(decideConsolidation(next, [{ ...old, id: "old-1" }]), {
    action: "supersede",
    target: "old-1",
  });
});

test("two similar action items are two commitments, not a replacement", () => {
  // Collapsing them would silently drop work the user promised to do — the
  // opposite of the failure a stale fact causes.
  const first = normalizeMemoryObject(
    raw({ type: "action_item", content: "Send the pricing deck" }),
    CTX
  ).object;
  const second = normalizeMemoryObject(
    raw({ type: "action_item", content: "Send the revised pricing deck" }),
    CTX
  ).object;

  assert.deepEqual(decideConsolidation(second, [{ ...first, id: "old-1" }]), { action: "insert" });
});

test("a fact about a different subject does not collide", () => {
  const mine = normalizeMemoryObject(
    raw({
      type: "preference",
      subject: "user",
      content: "Prefers short summaries",
      confidence: 0.9,
    }),
    CTX
  ).object;
  const theirs = normalizeMemoryObject(
    raw({
      type: "preference",
      subject: "other",
      content: "Prefers long summaries",
      confidence: 0.9,
    }),
    CTX
  ).object;

  assert.deepEqual(decideConsolidation(theirs, [{ ...mine, id: "old-1" }]), { action: "insert" });
});

test("a superseded row is not superseded again", () => {
  const old = normalizeMemoryObject(
    raw({ type: "project_fact", content: "Pricing is $40k" }),
    CTX
  ).object;
  const next = normalizeMemoryObject(
    raw({ type: "project_fact", content: "Pricing is $70k" }),
    CTX
  ).object;

  const result = decideConsolidation(next, [{ ...old, id: "old-1", status: "superseded" }]);
  assert.deepEqual(result, { action: "insert" });
});

test("the pinned profile carries only durable facts about the user", () => {
  const profile = buildMemoryProfile([
    {
      type: "preference",
      subject: "user",
      status: "open",
      confidence: 0.9,
      content: "Prefers bullets",
    },
    {
      type: "person_fact",
      subject: "user",
      status: "open",
      confidence: 0.85,
      content: "Based in Seoul",
    },
    // Someone else's preference is not part of who the user is.
    {
      type: "preference",
      subject: "other",
      status: "open",
      confidence: 0.9,
      content: "Likes calls",
    },
    // Open work is a status query, not something to pay for on every message.
    { type: "action_item", subject: "user", status: "open", confidence: 0.9, content: "Send deck" },
    { type: "preference", subject: "user", status: "superseded", confidence: 0.9, content: "Old" },
  ]);

  assert.equal(profile, "- Prefers bullets\n- Based in Seoul");
});

test("the pinned profile is capped, because every message pays for it", () => {
  const many = Array.from({ length: 200 }, (_, i) => ({
    type: "preference",
    subject: "user",
    status: "open",
    confidence: 0.9,
    content: `Preference number ${i} stated at some length to take up room`,
  }));
  assert.ok(buildMemoryProfile(many).length <= 1200);
});
