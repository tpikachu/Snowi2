const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/config/agentDetection.ts");

test("matches the name when it starts the dictation", async () => {
  const { detectAgentName } = await load();

  assert.equal(detectAgentName("Snowi, summarize this note", "Snowi"), true);
  assert.equal(detectAgentName("Max take a note", "Max"), true);
});

test("matches the name after a greeting cue", async () => {
  const { detectAgentName } = await load();

  assert.equal(detectAgentName("hey Snowi make this formal", "Snowi"), true);
  assert.equal(detectAgentName("okay Max stop recording", "Max"), true);
});

test("matches the name opening a new sentence", async () => {
  const { detectAgentName } = await load();

  assert.equal(
    detectAgentName("That's everything. Snowi, format this as bullets", "Snowi"),
    true
  );
});

test("ignores mentions that are dictated content, not commands", async () => {
  const { detectAgentName } = await load();

  assert.equal(detectAgentName("I showed Snowi to a friend yesterday", "Snowi"), false);
  assert.equal(detectAgentName("we shipped the Snowi update today", "Snowi"), false);
  assert.equal(detectAgentName("the max value is ten", "Max"), false);
});

test("handles STT splitting or misspelling the name, with the same gating", async () => {
  const { detectAgentName } = await load();

  // Split across tokens ("Sno wi") and one-edit mishearings ("snowy") still
  // match when addressed ("Snowi" is 5 letters, so one edit is allowed)...
  assert.equal(detectAgentName("hey snowy translate this", "Snowi"), true);
  assert.equal(detectAgentName("Sno wi, take a note", "Snowi"), true);
  // ...but not as a mid-sentence mention...
  assert.equal(
    detectAgentName("people keep calling snowy a dictation app", "Snowi"),
    false
  );
  // ...and a two-edit mishearing is beyond the budget even when addressed.
  assert.equal(detectAgentName("hey snowed translate this", "Snowi"), false);
});

test("short names never fuzzy-match other words", async () => {
  const { detectAgentName } = await load();

  assert.equal(detectAgentName("Sam, what time is it", "Max"), false);
  assert.equal(detectAgentName("the maximum value is ten", "Max"), false);
});

test("rejects empty or single-character names", async () => {
  const { detectAgentName } = await load();

  assert.equal(detectAgentName("hey there", ""), false);
  assert.equal(detectAgentName("a quick note", "a"), false);
});
