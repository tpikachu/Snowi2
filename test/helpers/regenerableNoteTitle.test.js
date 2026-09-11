const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/regenerableNoteTitle.js");
const LABELS = ["Untitled Note", "New note", "New note"]; // typical localized labels

test("empty / whitespace title is regenerable", async () => {
  const { isRegenerableNoteTitle } = await load();
  assert.equal(isRegenerableNoteTitle("", LABELS), true);
  assert.equal(isRegenerableNoteTitle("   ", LABELS), true);
  assert.equal(isRegenerableNoteTitle(null, LABELS), true);
});

test("builtin English placeholders are regenerable regardless of locale labels", async () => {
  const { isRegenerableNoteTitle } = await load();
  assert.equal(isRegenerableNoteTitle("Untitled Note", []), true);
  assert.equal(isRegenerableNoteTitle("New note", []), true);
  assert.equal(isRegenerableNoteTitle("New Note", []), true); // case-insensitive
  assert.equal(isRegenerableNoteTitle("untitled", []), true);
});

test("localized placeholder labels are regenerable", async () => {
  const { isRegenerableNoteTitle } = await load();
  assert.equal(isRegenerableNoteTitle("Nueva nota", ["Nueva nota", "Nota sin título"]), true);
  assert.equal(isRegenerableNoteTitle("Neue Notiz", ["Neue Notiz"]), true);
});

test("unedited calendar event name is regenerable", async () => {
  const { isRegenerableNoteTitle } = await load();
  assert.equal(isRegenerableNoteTitle("Weekly Team Sync", LABELS, "Weekly Team Sync"), true);
});

test("a manually-typed title is preserved (not regenerable)", async () => {
  const { isRegenerableNoteTitle } = await load();
  assert.equal(isRegenerableNoteTitle("Q3 Roadmap Decisions", LABELS), false);
  // even if a calendar event exists, a title that differs from it is user-set
  assert.equal(isRegenerableNoteTitle("My own title", LABELS, "Weekly Team Sync"), false);
});

// The dated default a meeting is born with ("Meeting — Sep 10, 5:32 AM") is a
// placeholder too. It reaches the predicate as its template, because the date
// it was stamped with is unknown to the caller — and the write-up must be free
// to replace it, or the note keeps the dated name forever (the demo's did).
test("the dated default title is regenerable, matched through its template", async () => {
  const { isRegenerableNoteTitle } = await load();
  const withTemplate = [...LABELS, "Meeting — {{date}}"];
  assert.equal(isRegenerableNoteTitle("Meeting — Sep 10, 5:32 AM", withTemplate), true);
  assert.equal(isRegenerableNoteTitle("Meeting — Sep 10, 17:32", withTemplate), true);
  // Localized templates around the slot, on either side.
  assert.equal(isRegenerableNoteTitle("Réunion — 10 sept., 05:32", ["Réunion — {{date}}"]), true);
  assert.equal(isRegenerableNoteTitle("会議 — 9月10日 5:32", ["会議 — {{date}}"]), true);
  assert.equal(isRegenerableNoteTitle("9月10日 5:32 の会議", ["{{date}} の会議"]), true);
  // The English template is built in, whatever the UI language.
  assert.equal(isRegenerableNoteTitle("Meeting — Sep 10, 5:32 AM", []), true);
});

test("a title the user typed under the same prefix is kept", async () => {
  const { isRegenerableNoteTitle } = await load();
  const withTemplate = [...LABELS, "Meeting — {{date}}"];
  // No time in the slot: this is a person's title, not the stamp.
  assert.equal(isRegenerableNoteTitle("Meeting — pricing with Acme", withTemplate), false);
  assert.equal(isRegenerableNoteTitle("Meeting —", withTemplate), false);
  assert.equal(isRegenerableNoteTitle("Kickoff — Sep 10, 5:32 AM", withTemplate), false);
});
