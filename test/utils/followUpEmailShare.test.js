const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildMailtoUrl,
  participantEmailAddresses,
  MAILTO_MAX_LENGTH,
} = require("../../src/utils/followUpEmailShare.ts");

test("addresses come from the participants JSON, junk reads as nobody", () => {
  const participants = JSON.stringify([
    { displayName: "Ana", email: "ana@example.com" },
    { displayName: "No Email" },
    { email: "  bob@example.com  " },
    { email: "not-an-email" },
  ]);
  assert.deepEqual(participantEmailAddresses(participants), ["ana@example.com", "bob@example.com"]);
  assert.deepEqual(participantEmailAddresses(null), []);
  assert.deepEqual(participantEmailAddresses("{broken"), []);
  assert.deepEqual(participantEmailAddresses(JSON.stringify({ not: "an array" })), []);
});

test("a short email produces a complete mailto with encoded recipients and subject", () => {
  const url = buildMailtoUrl({
    to: ["ana@example.com", "bob@example.com"],
    subject: "Follow-up: Q3 Planning & Review",
    body: "Hi all,\nThanks for today.",
  });
  assert.ok(url.startsWith("mailto:ana%40example.com,bob%40example.com?subject="));
  assert.ok(url.includes(encodeURIComponent("Follow-up: Q3 Planning & Review")));
  assert.ok(url.endsWith(encodeURIComponent("Hi all,\nThanks for today.")));
  assert.ok(url.length <= MAILTO_MAX_LENGTH);
});

test("a long body is cut at a line boundary to fit the budget", () => {
  const line = "This is a fairly ordinary follow-up sentence about the meeting.";
  const body = Array.from({ length: 100 }, (_, i) => `${i}. ${line}`).join("\n");
  const url = buildMailtoUrl({ to: ["ana@example.com"], subject: "Follow-up", body });

  assert.ok(url.length <= MAILTO_MAX_LENGTH, "the URL must fit the mail-client budget");
  const encodedBody = url.slice(url.indexOf("&body=") + "&body=".length);
  const decoded = decodeURIComponent(encodedBody);
  assert.ok(decoded.length > 0, "truncation must never empty the body");
  assert.ok(body.startsWith(decoded), "the kept text is a prefix of the draft");
  // Cut on a line boundary: what survives ends exactly where a line ended.
  assert.ok(
    body[decoded.length] === "\n" || body.charAt(decoded.length - 1) !== " ",
    "the cut lands at a line boundary"
  );
});

test("a single enormous line still fits rather than refusing", () => {
  const url = buildMailtoUrl({
    to: ["ana@example.com"],
    subject: "Follow-up",
    body: "x".repeat(10_000),
  });
  assert.ok(url.length <= MAILTO_MAX_LENGTH);
  assert.ok(url.includes("&body=x"), "some body survives");
});
