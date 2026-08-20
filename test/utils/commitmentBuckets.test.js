const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/utils/commitmentBuckets.ts");

const row = (id, overrides = {}) => ({
  id,
  meeting_id: "mtg_1",
  note_id: 1,
  type: "action_item",
  subject: "user",
  status: "open",
  due_at: null,
  confidence: 0.9,
  supersedes: null,
  superseded_by: null,
  created_at: "2026-08-01T10:00:00Z",
  updated_at: "2026-08-01T10:00:00Z",
  sync_status: "local_only",
  content: `commitment ${id}`,
  owner: null,
  source_segments: [],
  content_available: true,
  ...overrides,
});

test("sorts a due date into overdue, today or upcoming", async () => {
  const { commitmentBucket } = await load();
  const today = "2026-08-20";

  assert.equal(commitmentBucket("2026-08-19", today), "overdue");
  assert.equal(commitmentBucket("2026-08-20", today), "today");
  assert.equal(commitmentBucket("2026-08-21", today), "upcoming");
  assert.equal(commitmentBucket(null, today), "undated");
});

test("reads a full timestamp by its date half", async () => {
  const { commitmentBucket } = await load();

  // The extraction model writes whatever it likes into due_at.
  assert.equal(commitmentBucket("2026-08-20T23:59:59Z", "2026-08-20"), "today");
  assert.equal(commitmentBucket("2026-08-19T00:00:00+09:00", "2026-08-20"), "overdue");
});

test("a due date that is not a date is undated, never overdue", async () => {
  const { commitmentBucket } = await load();

  // Inventing an alarm from a malformed value is the worse failure: the user
  // cannot tell it from a real one.
  for (const bad of ["next Tuesday", "", "   ", "2026-13-99x", "soon"]) {
    assert.equal(commitmentBucket(bad, "2026-08-20"), "undated", JSON.stringify(bad));
  }
});

test("never parses a date string into a Date, so a timezone cannot shift it", async () => {
  const { commitmentBucket } = await load();

  // new Date("2026-08-20") is UTC midnight, which is 2026-08-19 anywhere west
  // of Greenwich — a commitment due today would read as overdue in New York.
  assert.equal(commitmentBucket("2026-08-20", "2026-08-20"), "today");
  assert.equal(commitmentBucket("2026-01-01", "2026-01-01"), "today");
  assert.equal(commitmentBucket("2026-12-31", "2026-12-31"), "today");
});

test("counts whole days across a month and a year boundary", async () => {
  const { daysBetween } = await load();

  assert.equal(daysBetween("2026-08-20", "2026-08-21"), 1);
  assert.equal(daysBetween("2026-08-31", "2026-09-01"), 1);
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
  assert.equal(daysBetween("2026-02-28", "2026-03-01"), 1, "2026 is not a leap year");
  assert.equal(daysBetween("2024-02-28", "2024-03-01"), 2, "2024 is");
  assert.equal(daysBetween("2026-08-21", "2026-08-20"), -1);
});

test("groups in urgency order and only keeps non-empty buckets", async () => {
  const { bucketCommitments } = await load();

  const result = bucketCommitments(
    [
      row("a", { due_at: "2026-08-25" }),
      row("b", { due_at: "2026-08-18" }),
      row("c", { due_at: "2026-08-20" }),
      row("d"),
    ],
    "2026-08-20"
  );

  assert.deepEqual(
    result.groups.map((g) => g.bucket),
    ["overdue", "today", "upcoming", "undated"]
  );
  assert.equal(result.groups[0].items[0].id, "b");
  assert.equal(result.total, 4);

  const noneOverdue = bucketCommitments([row("a", { due_at: "2026-08-25" })], "2026-08-20");
  assert.deepEqual(
    noneOverdue.groups.map((g) => g.bucket),
    ["upcoming"],
    "an empty bucket is not rendered as a heading with nothing under it"
  );
});

test("counts overdue across everything, not just the page", async () => {
  const { bucketCommitments } = await load();

  const rows = ["a", "b", "c", "d"].map((id) => row(id, { due_at: "2026-08-01" }));
  const result = bucketCommitments(rows, "2026-08-20", 2);

  // The badge must not say "2 overdue" because the card had room for two.
  assert.equal(result.overdueCount, 4);
  assert.equal(result.total, 4);
  assert.equal(result.hidden, 2);
  assert.equal(result.groups[0].items.length, 2);
});

test("drops a claim whose sealed content will not decrypt", async () => {
  const { bucketCommitments } = await load();

  const result = bucketCommitments(
    [row("a"), row("b", { content: null, content_available: false }), row("c", { content: "   " })],
    "2026-08-20"
  );

  // An empty row would be a commitment the user cannot read or act on.
  assert.equal(result.total, 1);
  assert.equal(result.groups[0].items[0].id, "a");
});

test("dated commitments outrank undated ones whatever their timestamps", async () => {
  const { bucketCommitments } = await load();

  const result = bucketCommitments(
    [
      row("undated", { updated_at: "2026-08-19T00:00:00Z" }),
      row("dated", { due_at: "2027-01-01", updated_at: "2026-01-01T00:00:00Z" }),
    ],
    "2026-08-20",
    1
  );

  assert.equal(result.groups[0].items[0].id, "dated");
});

test("undated commitments fall back to most recently touched", async () => {
  const { bucketCommitments } = await load();

  const result = bucketCommitments(
    [
      row("older", { updated_at: "2026-08-01T00:00:00Z" }),
      row("newer", { updated_at: "2026-08-19T00:00:00Z" }),
    ],
    "2026-08-20"
  );

  assert.deepEqual(
    result.groups[0].items.map((r) => r.id),
    ["newer", "older"]
  );
});

test("a limit of zero still reports the real totals", async () => {
  const { bucketCommitments } = await load();

  const result = bucketCommitments([row("a", { due_at: "2026-08-01" })], "2026-08-20", 0);
  assert.deepEqual(result.groups, []);
  assert.equal(result.total, 1);
  assert.equal(result.hidden, 1);
  assert.equal(result.overdueCount, 1);
});

test("localToday uses local calendar parts, not the UTC ones", async () => {
  const { localToday } = await load();

  // 00:30 on the 20th local time is still the 20th, even where that is the
  // 19th in UTC. Constructed with local parts so the assertion holds anywhere.
  assert.equal(localToday(new Date(2026, 7, 20, 0, 30)), "2026-08-20");
  assert.equal(localToday(new Date(2026, 0, 5, 23, 45)), "2026-01-05");
  assert.match(localToday(), /^\d{4}-\d{2}-\d{2}$/);
});
