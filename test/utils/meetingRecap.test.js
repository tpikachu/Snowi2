const test = require("node:test");
const assert = require("node:assert/strict");

const { buildMeetingRecap, recapAttendeeNames } = require("../../src/utils/meetingRecap.ts");

const LABELS = { attendees: "Attendees" };

const attendees = (...people) => JSON.stringify(people);

test("a full recap: heading, attendees, then the write-up", () => {
  const recap = buildMeetingRecap({
    title: "Acme weekly",
    formattedDate: "Aug 19, 2026",
    participants: attendees(
      { displayName: "Dana Ruiz", email: "dana@acme.com" },
      { email: "sam@acme.com" }
    ),
    enhancedContent: "## Decisions\n- Ship Friday",
    labels: LABELS,
  });
  assert.equal(
    recap,
    "**Acme weekly — Aug 19, 2026**\nAttendees: Dana Ruiz, sam@acme.com\n\n## Decisions\n- Ship Friday"
  );
});

test("no write-up means no recap, not an empty shell", () => {
  assert.equal(buildMeetingRecap({ title: "Acme", enhancedContent: "   ", labels: LABELS }), null);
});

test("missing pieces drop their lines instead of leaving blanks", () => {
  const recap = buildMeetingRecap({
    title: "Acme weekly",
    enhancedContent: "Summary line",
    labels: LABELS,
  });
  assert.equal(recap, "**Acme weekly**\n\nSummary line");

  const noHeading = buildMeetingRecap({
    title: "",
    enhancedContent: "Summary line",
    labels: LABELS,
  });
  assert.equal(noHeading, "Summary line");
});

test("attendee names parse defensively and prefer display names", () => {
  assert.deepEqual(
    recapAttendeeNames(
      attendees({ displayName: " Dana ", email: "d@a.com" }, { email: "s@a.com" })
    ),
    ["Dana", "s@a.com"]
  );
  assert.deepEqual(recapAttendeeNames("not json"), []);
  assert.deepEqual(recapAttendeeNames(null), []);
  assert.deepEqual(recapAttendeeNames(attendees({ responseStatus: "accepted" })), []);
});
