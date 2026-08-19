const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer } = require("../lib/rendererTestHarness");

async function load(t) {
  const vite = await createRendererServer(t, { cachePrefix: "snowy-memory-prompt-" });
  return await vite.ssrLoadModule("/utils/memoryPrompt.ts");
}

const TODAY = "2026-08-19";

function claim(overrides = {}) {
  return {
    id: "mem_1",
    type: "commitment",
    subject: "user",
    status: "open",
    due_at: null,
    owner: null,
    content: "Send the vendor the revised quote",
    updated_at: "2026-08-01T00:00:00.000Z",
    content_available: true,
    ...overrides,
  };
}

test("marks a past due date overdue, and today as today", async (t) => {
  const { formatOpenCommitments } = await load(t);

  const text = formatOpenCommitments(
    [
      claim({ id: "a", content: "Ship the audit", due_at: "2026-08-10" }),
      claim({ id: "b", content: "Call the bank", due_at: TODAY }),
      claim({ id: "c", content: "Renew the licence", due_at: "2026-12-01" }),
    ],
    TODAY
  );

  assert.match(text, /Ship the audit — due 2026-08-10, OVERDUE/);
  assert.match(text, /Call the bank — due today/);
  assert.match(text, /Renew the licence — due 2026-12-01$/m);
});

test("dated commitments lead, soonest first, undated last", async (t) => {
  const { formatOpenCommitments } = await load(t);

  const lines = formatOpenCommitments(
    [
      claim({ id: "a", content: "No date" }),
      claim({ id: "b", content: "Later", due_at: "2026-10-01" }),
      claim({ id: "c", content: "Sooner", due_at: "2026-09-01" }),
    ],
    TODAY
  ).split("\n");

  assert.deepEqual(
    lines.map((l) => l.replace(/^- /, "").split(" —")[0]),
    ["Sooner", "Later", "No date"]
  );
});

test("names the owner only for someone else's commitment", async (t) => {
  const { formatOpenCommitments } = await load(t);

  const text = formatOpenCommitments(
    [
      claim({ id: "a", subject: "other", owner: "Priya", content: "Draft the SOW" }),
      claim({ id: "b", subject: "user", owner: "Me", content: "Review it" }),
    ],
    TODAY
  );

  assert.match(text, /- Priya: Draft the SOW/);
  // Prefixing the user's own commitments with their name reads as a third
  // party's to-do list rather than their own.
  assert.match(text, /- Review it/);
  assert.doesNotMatch(text, /Me: Review it/);
});

test("caps the slice and says how many it withheld", async (t) => {
  const { formatOpenCommitments, MAX_PINNED_COMMITMENTS } = await load(t);

  const many = Array.from({ length: MAX_PINNED_COMMITMENTS + 5 }, (_, i) =>
    claim({ id: `m${i}`, content: `Task ${i}` })
  );
  const lines = formatOpenCommitments(many, TODAY).split("\n");

  // Silently truncating would make "that is everything outstanding" a lie.
  assert.equal(lines.length, MAX_PINNED_COMMITMENTS + 1);
  assert.match(lines.at(-1), /5 more open — call search_memory/);
});

test("a claim whose sealed content cannot be read is left out, not shown blank", async (t) => {
  const { formatOpenCommitments } = await load(t);

  const text = formatOpenCommitments(
    [
      claim({ id: "a", content: null, content_available: false, due_at: "2026-08-01" }),
      claim({ id: "b", content: "Readable one" }),
    ],
    TODAY
  );

  assert.equal(text, "- Readable one");
});

test("no open commitments renders nothing at all", async (t) => {
  const { formatOpenCommitments } = await load(t);

  // An empty string is what keeps the whole section out of the prompt, rather
  // than pinning an empty heading onto every single message.
  assert.equal(formatOpenCommitments([], TODAY), "");
  assert.equal(formatOpenCommitments([claim({ content: "   " })], TODAY), "");
});
