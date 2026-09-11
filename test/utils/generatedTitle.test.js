const test = require("node:test");
const assert = require("node:assert/strict");

const { cleanGeneratedTitle } = require("../../src/utils/generatedTitle.ts");

test("a bare title comes back as it is", () => {
  assert.equal(cleanGeneratedTitle("Acme pilot scope and pricing"), "Acme pilot scope and pricing");
});

test("quotes, bold, backticks and a markdown heading around the title are shed", () => {
  for (const raw of [
    '"Acme pilot scope"',
    "'Acme pilot scope'",
    "“Acme pilot scope”",
    "**Acme pilot scope**",
    "`Acme pilot scope`",
    "# Acme pilot scope",
    "## Acme pilot scope",
  ]) {
    assert.equal(cleanGeneratedTitle(raw), "Acme pilot scope", raw);
  }
});

test("a Title: label is dropped, even inside the wrapper", () => {
  assert.equal(cleanGeneratedTitle("Title: Acme pilot scope"), "Acme pilot scope");
  assert.equal(cleanGeneratedTitle("**Title: Acme pilot scope**"), "Acme pilot scope");
  assert.equal(cleanGeneratedTitle('Meeting title: "Acme pilot scope"'), "Acme pilot scope");
});

test("only the first line is the title; an explanation below it is ignored", () => {
  assert.equal(
    cleanGeneratedTitle("Acme pilot scope\n\nThis title captures the pricing discussion."),
    "Acme pilot scope"
  );
  assert.equal(cleanGeneratedTitle("\n\n  Acme pilot scope  \n"), "Acme pilot scope");
});

test("nothing usable yields an empty title so the placeholder stays", () => {
  assert.equal(cleanGeneratedTitle(""), "");
  assert.equal(cleanGeneratedTitle('""'), "");
  assert.equal(cleanGeneratedTitle("x".repeat(120)), "");
});
