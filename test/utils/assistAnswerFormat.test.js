const test = require("node:test");
const assert = require("node:assert/strict");

const { parseAssistAnswer } = require("../../src/utils/assistAnswerFormat.ts");

test("the backticked last line is lifted out as the line to say", () => {
  const parsed = parseAssistAnswer(
    [
      "Delivery slips to **March 14**.",
      "- **Cause:** the vendor API is late.",
      "`We can commit to March 14.`",
    ].join("\n")
  );
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
  const parsed = parseAssistAnswer("`We can commit.`");
  assert.equal(parsed.sayLine, "We can commit.");
  assert.equal(parsed.body, "");
});

test("an answer without a say-line is returned whole", () => {
  const text = "The renewal is **March 3**.\n- **Owner:** Priya";
  assert.deepEqual(parseAssistAnswer(text), { body: text, sayLine: null });
});

test("inline code inside a bullet is not mistaken for the line to say", () => {
  const text = "Run the suite first.\n- **Command:** use `npm test` before merging";
  assert.deepEqual(parseAssistAnswer(text), { body: text, sayLine: null });
});

test("a say-line still streaming in — no closing backtick yet — stays in the body", () => {
  const text = "The answer is **yes**.\n`We can com";
  assert.deepEqual(parseAssistAnswer(text), { body: text, sayLine: null });
});

test("trailing blank lines and Windows newlines do not hide the say-line", () => {
  const parsed = parseAssistAnswer("Yes.\r\n`We can commit.`\r\n\r\n");
  assert.equal(parsed.sayLine, "We can commit.");
  assert.equal(parsed.body, "Yes.");
});

test("an answer that is only a say-line has an empty body", () => {
  const parsed = parseAssistAnswer("`We can commit.`");
  assert.equal(parsed.sayLine, "We can commit.");
  assert.equal(parsed.body, "");
});

test("empty input parses to nothing", () => {
  assert.deepEqual(parseAssistAnswer(""), { body: "", sayLine: null });
  assert.deepEqual(parseAssistAnswer("\n\n"), { body: "", sayLine: null });
});
