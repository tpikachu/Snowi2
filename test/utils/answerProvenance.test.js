const test = require("node:test");
const assert = require("node:assert/strict");

const { describeAnswerSources, sourceNames } = require("../../src/utils/answerProvenance.ts");

const labels = {
  searchedWeb: "Searched the web",
  viewedScreens: (n) => (n === 1 ? "Viewed your screen" : `Viewed ${n} screens`),
  from: "From",
  checkedNotes: "Checked your notes",
};

const note = (title) => ({ title });

test("a plain fast answer names nothing — every answer reads the meeting", () => {
  assert.equal(describeAnswerSources({ screens: 0, sources: [], mode: "fast" }, labels), "");
});

test("the screen is named only when a screenshot reached the model", () => {
  assert.equal(
    describeAnswerSources({ screens: 1, sources: [], mode: "fast" }, labels),
    "Viewed your screen"
  );
  assert.equal(
    describeAnswerSources({ screens: 2, sources: [], mode: "fast" }, labels),
    "Viewed 2 screens"
  );
});

test("notes drawn on are listed after the screen, capped with a +n", () => {
  assert.equal(
    describeAnswerSources(
      { screens: 1, sources: [note("Q3 planning"), note("Roadmap")], mode: "thinking" },
      labels
    ),
    "Viewed your screen · From Q3 planning, Roadmap"
  );
  assert.equal(
    describeAnswerSources(
      { screens: 0, sources: ["A", "B", "C", "D", "E"].map(note), mode: "fast" },
      labels
    ),
    "From A, B, C +2"
  );
  assert.equal(sourceNames([note("A"), note("B")], 1), "A +1");
});

test("a thinking answer that searched and found nothing still says the notes were checked", () => {
  assert.equal(
    describeAnswerSources({ screens: 0, sources: [], mode: "thinking" }, labels),
    "Checked your notes"
  );
  assert.equal(
    describeAnswerSources({ screens: 1, sources: [], mode: "thinking" }, labels),
    "Viewed your screen · Checked your notes"
  );
});

test("a web search is named first, before the screen and the notes", () => {
  assert.equal(
    describeAnswerSources({ searched: true, screens: 0, sources: [], mode: "fast" }, labels),
    "Searched the web"
  );
  assert.equal(
    describeAnswerSources(
      { searched: true, screens: 1, sources: [note("Q3 planning")], mode: "thinking" },
      labels
    ),
    "Searched the web · Viewed your screen · From Q3 planning"
  );
  // A request whose search tool was refused is not a search.
  assert.equal(
    describeAnswerSources({ searched: false, screens: 0, sources: [], mode: "fast" }, labels),
    ""
  );
});
