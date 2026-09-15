const test = require("node:test");
const assert = require("node:assert/strict");

const { parseAssistAnswer, sayAnswerText } = require("../../src/utils/assistAnswerFormat.ts");

const fact = (body, sayLine = null) => ({ form: "fact", body, sayLine, blocks: [] });
const block = (text, lead = null, open = false) => ({ lead, text, open });
const say = (blocks, body = "") => ({ form: "say", body, sayLine: null, blocks });

// ---- The fact shape: a direct line, bullets, the say-line last ------------

test("the backticked last line is lifted out as the line to say", () => {
  const parsed = parseAssistAnswer(
    [
      "Delivery slips to **March 14**.",
      "- **Cause:** the vendor API is late.",
      "`We can commit to March 14.`",
    ].join("\n")
  );
  assert.equal(parsed.form, "fact");
  assert.equal(parsed.sayLine, "We can commit to March 14.");
  assert.equal(
    parsed.body,
    "Delivery slips to **March 14**.\n- **Cause:** the vendor API is late."
  );
});

test("a Say: label, bold or bulleted, and quotes inside the backticks are all shed", () => {
  for (const line of [
    'Say: `"We can commit."`',
    "**Say this:** `We can commit.`",
    "- `We can commit.`",
    'You could say: "We can commit."',
    "Say: “We can commit.”",
  ]) {
    const parsed = parseAssistAnswer(`The answer is **yes**.\n${line}`);
    assert.equal(parsed.sayLine, "We can commit.", line);
    assert.equal(parsed.body, "The answer is **yes**.", line);
  }
});

test("a label on its own line above the say-line is dropped with it", () => {
  const parsed = parseAssistAnswer("The answer is **yes**.\n\nSay:\n`We can commit.`");
  assert.equal(parsed.sayLine, "We can commit.");
  assert.equal(parsed.body, "The answer is **yes**.");
});

test("a fenced block at the end is the say-line, joined onto one line", () => {
  const parsed = parseAssistAnswer(
    "The answer is **yes**.\n```\nWe can commit,\nand I'll confirm Friday.\n```"
  );
  assert.equal(parsed.form, "fact");
  assert.equal(parsed.sayLine, "We can commit, and I'll confirm Friday.");
  assert.equal(parsed.body, "The answer is **yes**.");
});

test("a say-line the model put first is lifted too, leaving the facts as the body", () => {
  const parsed = parseAssistAnswer(
    "`Let's confirm twenty-five seats for the pilot.`\n\n- **Pilot scope:** twenty-five seats."
  );
  assert.equal(parsed.sayLine, "Let's confirm twenty-five seats for the pilot.");
  assert.equal(parsed.body, "- **Pilot scope:** twenty-five seats.");
});

test("with a say-line at the end, a backticked first line becomes the bold lead", () => {
  const parsed = parseAssistAnswer(
    "`Slack is on screen.`\n- **Active pane:** the meetings channel.\n`My screen shows Slack.`"
  );
  assert.equal(parsed.sayLine, "My screen shows Slack.");
  assert.equal(parsed.body, "**Slack is on screen.**\n- **Active pane:** the meetings channel.");
});

test("a lone backticked line is a say-line, not a first line with nothing after it", () => {
  assert.deepEqual(parseAssistAnswer("`We can commit.`"), fact("", "We can commit."));
});

test("an answer without a say-line is returned whole", () => {
  const text = "The renewal is **March 3**.\n- **Owner:** Priya";
  assert.deepEqual(parseAssistAnswer(text), fact(text));
});

test("inline code inside a bullet is not mistaken for the line to say", () => {
  const text = "Run the suite first.\n- **Command:** use `npm test` before merging";
  assert.deepEqual(parseAssistAnswer(text), fact(text));
});

test("a say-line still streaming in — no closing backtick yet — stays in the body", () => {
  const text = "The answer is **yes**.\n`We can com";
  assert.deepEqual(parseAssistAnswer(text), fact(text));
});

test("trailing blank lines and Windows newlines do not hide the say-line", () => {
  const parsed = parseAssistAnswer("Yes.\r\n`We can commit.`\r\n\r\n");
  assert.equal(parsed.sayLine, "We can commit.");
  assert.equal(parsed.body, "Yes.");
});

test("empty input parses to nothing", () => {
  assert.deepEqual(parseAssistAnswer(""), fact(""));
  assert.deepEqual(parseAssistAnswer("\n\n"), fact(""));
});

// ---- The spoken shape: the words, the reasons, the alternative ------------

const WORDS = "That's fair. I'd rather hold the price and widen what's included.";
const ALT = "The pilot was priced to prove the fit, not to set the rate.";
const REASONS = [
  '- **Their point:** "the pilot was half this" — anchoring on the pilot rate.',
  "- **Why this lands:** concedes the comparison, not the price.",
].join("\n");

test("an answer that opens with a fence is words to say — one block, quotes and language tag shed", () => {
  assert.deepEqual(
    parseAssistAnswer(
      "```text\n“That's fair. I'd rather hold the price\nand widen what's included.”\n```"
    ),
    say([block(WORDS)])
  );
});

test("the reasons between the words and the alternative are the body, and the lead-in stays with its block", () => {
  const text = [
    "```",
    WORDS,
    "```",
    "",
    REASONS,
    "",
    "**If you want to push further:**",
    "```",
    ALT,
    "```",
  ].join("\n");
  const parsed = parseAssistAnswer(text);
  assert.deepEqual(
    parsed,
    say([block(WORDS), block(ALT, "If you want to push further:")], REASONS)
  );
  // Copies in the order the card shows it, fences gone.
  assert.equal(
    sayAnswerText(parsed),
    [WORDS, "", REASONS, "", "If you want to push further:", ALT].join("\n")
  );
});

test("reasons written after the alternative are still the body", () => {
  const text = ["```", WORDS, "```", "Firmer:", "```", ALT, "```", REASONS].join("\n");
  assert.deepEqual(parseAssistAnswer(text), say([block(WORDS), block(ALT, "Firmer:")], REASONS));
});

test("words with no reasons and no alternative are just the one block", () => {
  assert.deepEqual(parseAssistAnswer("```\nWe can commit.\n```"), say([block("We can commit.")]));
  assert.equal(sayAnswerText({ blocks: [block("We can commit.")], body: "" }), "We can commit.");
});

test("a Say: label above the first fence is the label the block already is", () => {
  assert.deepEqual(
    parseAssistAnswer("**Say:**\n\n```\nWe can commit.\n```"),
    say([block("We can commit.")])
  );
});

test("a second version the model quoted instead of fencing is still a block; other prose is the body", () => {
  assert.deepEqual(
    parseAssistAnswer('```\nWe can commit.\n```\nFirmer:\n"We committed to this last week."'),
    say([block("We can commit."), block("We committed to this last week.", "Firmer:")])
  );
  assert.deepEqual(
    parseAssistAnswer("```\nWe can commit.\n```\nThey asked twice, so a yes now closes it."),
    say([block("We can commit.")], "They asked twice, so a yes now closes it.")
  );
});

test("while streaming, the shape is known from the first backtick and the open block is marked", () => {
  assert.deepEqual(parseAssistAnswer("``"), say([block("", null, true)]));
  assert.deepEqual(
    parseAssistAnswer("```\nThat's fair. I'd rath"),
    say([block("That's fair. I'd rath", null, true)])
  );
  // The words closed and the reasons are arriving: the body grows, no block open.
  assert.deepEqual(
    parseAssistAnswer("```\nWe can commit.\n```\n- **Their point:** they asked tw"),
    say([block("We can commit.")], "- **Their point:** they asked tw")
  );
  // The lead-in arrived, the second fence has not: an empty open block, for
  // the renderer to hold the caret in.
  assert.deepEqual(
    parseAssistAnswer("```\nWe can commit.\n```\n" + REASONS + "\nIf you want to push further:"),
    say([block("We can commit."), block("", "If you want to push further:", true)], REASONS)
  );
  // Streaming text copies as far as it got.
  assert.equal(sayAnswerText({ blocks: [block("We can", null, true)], body: "" }), "We can");
});
