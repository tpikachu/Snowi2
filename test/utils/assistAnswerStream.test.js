const test = require("node:test");
const assert = require("node:assert/strict");

const {
  collectAnswerStream,
  stripInlineCitations,
  sourceLabel,
  hostnameOf,
} = require("../../src/utils/assistAnswerStream.ts");

async function* chunks(list) {
  for (const chunk of list) yield chunk;
}

const NOTION = "https://www.notion.com/pricing?ps_partner_key=abc&utm_source=openai";

test("inline citation parentheticals leave the text; the sentence stays whole", () => {
  assert.equal(
    stripInlineCitations(`The plan is $20 per user per month. ([notion.com](${NOTION}))`),
    "The plan is $20 per user per month."
  );
  assert.equal(
    stripInlineCitations(
      `Two sources agree ([a.com](https://a.com/x), [b.org](https://b.org/y)) on the date.`
    ),
    "Two sources agree on the date."
  );
  assert.equal(stripInlineCitations("See (https://example.com/page) for more."), "See for more.");
  // A markdown link that is not a citation parenthetical is left alone.
  assert.equal(
    stripInlineCitations("- **Their point:** [the pilot](https://x.com/p) was half this."),
    "- **Their point:** [the pilot](https://x.com/p) was half this."
  );
  assert.equal(stripInlineCitations("no links here"), "no links here");
});

test("a searched answer collects its text, its sources once each, and says it searched", async () => {
  const texts = [];
  const searches = [];
  const collected = await collectAnswerStream(
    chunks([
      { type: "tool_calls", calls: [{ id: "c1", name: "web_search", arguments: "{}" }] },
      { type: "tool_result", callId: "c1", toolName: "web_search", displayText: "web_search" },
      { type: "source", url: NOTION, title: "Notion Pricing Plans" },
      { type: "source", url: NOTION, title: "Notion Pricing Plans" },
      { type: "source", url: "https://b.org/y", title: "" },
      { type: "content", text: "Business is $20 per user per month" },
      { type: "content", text: `. ([notion.com](${NOTION}))` },
      { type: "done", finishReason: "stop" },
    ]),
    { onText: (text) => texts.push(text), onSearch: (sources) => searches.push(sources.length) }
  );
  assert.equal(collected.text, "Business is $20 per user per month.");
  assert.equal(collected.searched, true);
  assert.deepEqual(collected.sources, [
    { url: NOTION, title: "Notion Pricing Plans" },
    { url: "https://b.org/y", title: "" },
  ]);
  // The tool call alone announced the search, then each new source again.
  assert.deepEqual(searches, [0, 1, 2]);
  assert.equal(texts[texts.length - 1], "Business is $20 per user per month.");
});

test("an answer without a search is plain text and says so", async () => {
  const collected = await collectAnswerStream(
    chunks([
      { type: "content", text: "We agreed on " },
      { type: "content", text: "March 14." },
      { type: "done" },
    ])
  );
  assert.deepEqual(collected, { text: "We agreed on March 14.", sources: [], searched: false });
});

test("a function tool by another name is not a search", async () => {
  const collected = await collectAnswerStream(
    chunks([
      { type: "tool_calls", calls: [{ id: "c1", name: "search_notes", arguments: "{}" }] },
      { type: "content", text: "From your notes: yes." },
    ])
  );
  assert.equal(collected.searched, false);
});

test("a source is labeled by its title, else its host", () => {
  assert.equal(sourceLabel({ url: NOTION, title: "Notion Pricing Plans" }), "Notion Pricing Plans");
  assert.equal(sourceLabel({ url: NOTION, title: "  " }), "notion.com");
  assert.equal(hostnameOf("not a url"), "not a url");
});
