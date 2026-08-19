const test = require("node:test");
const assert = require("node:assert/strict");
const { extractNoteCards } = require("../../src/components/chat/noteCards.ts");

const completed = (name, noteRefs) => ({
  id: `tc-${name}`,
  name,
  arguments: "{}",
  status: "completed",
  noteRefs,
});
const extractCards = (toolCalls) => extractNoteCards(toolCalls, "Note");

test("collects notes from every tool that reported them", () => {
  const cards = extractCards([
    completed("create_note", [{ id: 7, title: "Kickoff" }]),
    completed("get_note", [{ id: 9, title: "Roadmap" }]),
    completed("list_meetings", [{ id: 12, title: "Vendor sync" }]),
  ]);
  assert.deepEqual(cards, [
    { noteId: 7, title: "Kickoff" },
    { noteId: 9, title: "Roadmap" },
    { noteId: 12, title: "Vendor sync" },
  ]);
});

test("dedupes across tools and within one call, keeping first appearance", () => {
  const cards = extractCards([
    completed("update_note", [{ id: 3, title: "Sales sync" }]),
    completed("search_notes", [
      { id: 3, title: "Sales sync" },
      { id: 5, title: "Q3 plan" },
    ]),
    completed("search_notes", [{ id: 5, title: "Q3 plan" }]),
  ]);
  assert.deepEqual(cards, [
    { noteId: 3, title: "Sales sync" },
    { noteId: 5, title: "Q3 plan" },
  ]);
});

test("returns every referenced note, uncapped", () => {
  const refs = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, title: `Meeting ${i + 1}` }));
  // This list feeds citation rendering, which drops markers naming an id it
  // was not given. Capping here would silently delete the model's citations
  // past the cap — an answer listing 20 meetings would link only the first few.
  // The sources strip does its own capping, in resolveMessageSources.
  assert.equal(extractCards([completed("list_meetings", refs)]).length, 20);
});

test("incomplete calls and tools that reference no notes produce nothing", () => {
  const cards = extractCards([
    { ...completed("search_notes", [{ id: 1, title: "x" }]), status: "executing" },
    completed("copy_to_clipboard", undefined),
    completed("list_folders", []),
  ]);
  assert.deepEqual(cards, []);
});

test("skips ids that name nothing openable", () => {
  // Cloud hits carry null or UUID ids for notes with no local row; the rest are
  // values that would survive a bare truthiness check and then open nothing.
  const cards = extractCards([
    completed("search_notes", [
      { id: 0, title: "Zero" },
      { id: -3, title: "Negative" },
      { id: 1.8, title: "Float" },
      { id: false, title: "Boolean" },
      { id: "", title: "Empty string" },
      { id: null, title: "Cloud-only" },
      { id: "b1c2-uuid", title: "Cloud id" },
      { id: 10, title: "Valid Note" },
    ]),
  ]);
  assert.deepEqual(cards, [{ noteId: 10, title: "Valid Note" }]);
});

test("falls back to the default title when a ref has none", () => {
  const cards = extractCards([
    completed("create_note", [{ id: 12, title: "   \n\t " }]),
    completed("search_notes", [{ id: 14, title: undefined }]),
  ]);
  assert.deepEqual(cards, [
    { noteId: 12, title: "Note" },
    { noteId: 14, title: "Note" },
  ]);
});
