const test = require("node:test");
const assert = require("node:assert/strict");

const loadRecord = () => import("../../src/utils/chatTurnRecord.ts");
const loadPrompts = () => import("../../src/config/prompts.ts");

const turn = (overrides = {}) => ({
  id: "t1",
  at: 1_760_000_000_000,
  surface: "chat-view",
  question: "what did we decide about pricing?",
  retrievalQuery: "what did we decide about pricing?",
  provider: "openai",
  model: "gpt-5.2",
  mode: "providers",
  sections: [],
  systemPromptChars: 0,
  messageWindow: [],
  retrieved: [],
  retrievedDropped: 0,
  availableTools: [],
  toolCalls: [],
  responseChars: 0,
  citedNoteIds: [],
  timings: {},
  ...overrides,
});

test("the recorded sections are the prompt, not a description of it", async () => {
  const { getAgentPromptSections, renderAgentPromptSections, getAgentSystemPrompt } =
    await loadPrompts();

  const context = {
    availableTools: ["search_notes", "search_memory"],
    noteContext: "## Note 1\nSome retrieved passage.",
    memoryProfile: "Works at Acme.",
    openCommitments: "- Send the deck — due 2026-08-21",
    focusNote: { id: 42, title: "Pricing call" },
  };

  const sections = getAgentPromptSections(context);
  // The whole point of the refactor: a record assembled separately from the
  // request drifts from it, and a drifted record makes a wrong prompt look
  // right. These must be the same bytes.
  assert.equal(renderAgentPromptSections(sections), getAgentSystemPrompt(context));
});

test("every part of the context reaches a named section", async () => {
  const { getAgentPromptSections } = await loadPrompts();

  const sections = getAgentPromptSections({
    availableTools: ["search_notes"],
    noteContext: "RETRIEVED_MARKER",
    memoryProfile: "PROFILE_MARKER",
    openCommitments: "COMMITMENT_MARKER",
    focusNote: { id: 7, title: "FOCUS_MARKER" },
  });
  const byName = Object.fromEntries(sections.map((s) => [s.name, s.text]));

  assert.ok(byName.assistantRole?.length > 0);
  assert.match(byName.userProfile, /PROFILE_MARKER/);
  assert.match(byName.openCommitments, /COMMITMENT_MARKER/);
  assert.match(byName.focusNote, /FOCUS_MARKER/);
  assert.match(byName.toolInstructions, /search_notes/);
  assert.match(byName.retrievedNotes, /RETRIEVED_MARKER/);
});

test("an empty context still sends the role, and nothing else", async () => {
  const { getAgentPromptSections } = await loadPrompts();

  const sections = getAgentPromptSections({});
  assert.deepEqual(
    sections.map((s) => s.name),
    ["assistantRole"]
  );
});

test("blank context values do not become empty sections", async () => {
  const { getAgentPromptSections } = await loadPrompts();

  // A section of pure whitespace is billed for on every message and says
  // nothing; it would also show up in the inspector as a real component.
  const sections = getAgentPromptSections({
    memoryProfile: "   ",
    openCommitments: "\n\n",
    availableTools: [],
  });
  assert.deepEqual(
    sections.map((s) => s.name),
    ["assistantRole"]
  );
});

test("an unknown tool contributes no instruction line", async () => {
  const { getAgentPromptSections } = await loadPrompts();

  const sections = getAgentPromptSections({ availableTools: ["not_a_real_tool"] });
  assert.equal(
    sections.some((s) => s.name === "toolInstructions"),
    false,
    "'You have access to tools.' with no tools named is worse than silence"
  );
});

test("keeps only the most recent turns", async () => {
  const { recordChatTurn, getChatTurns, clearChatTurns, MAX_CHAT_TURNS } = await loadRecord();
  clearChatTurns();

  for (let i = 0; i < MAX_CHAT_TURNS + 5; i += 1) {
    recordChatTurn(turn({ id: `t${i}` }));
  }

  const turns = getChatTurns();
  assert.equal(turns.length, MAX_CHAT_TURNS);
  // Newest first, which is the order anyone debugging reads them in.
  assert.equal(turns[0].id, `t${MAX_CHAT_TURNS + 4}`);
  clearChatTurns();
});

test("a turn is updated in place as the answer arrives", async () => {
  const { recordChatTurn, updateChatTurn, getChatTurns, clearChatTurns } = await loadRecord();
  clearChatTurns();

  recordChatTurn(turn({ id: "t1", timings: { retrievalMs: 40 } }));
  updateChatTurn("t1", { timings: { firstTokenMs: 900 } });
  updateChatTurn("t1", { responseChars: 120, timings: { totalMs: 2400 } });

  const [only] = getChatTurns();
  // Timings merge rather than replace: retrievalMs is known before the request
  // and firstTokenMs during it, and a plain overwrite would lose the earlier one.
  assert.deepEqual(only.timings, { retrievalMs: 40, firstTokenMs: 900, totalMs: 2400 });
  assert.equal(only.responseChars, 120);
  assert.equal(only.question, "what did we decide about pricing?");
  clearChatTurns();
});

test("updating a turn that has aged out of the buffer is a no-op", async () => {
  const { recordChatTurn, updateChatTurn, getChatTurns, clearChatTurns } = await loadRecord();
  clearChatTurns();

  recordChatTurn(turn({ id: "t1" }));
  updateChatTurn("gone", { responseChars: 5 });

  assert.equal(getChatTurns().length, 1);
  assert.equal(getChatTurns()[0].responseChars, 0);
  clearChatTurns();
});

test("subscribers see every change", async () => {
  const { recordChatTurn, updateChatTurn, subscribeChatTurns, clearChatTurns } = await loadRecord();
  clearChatTurns();

  const seen = [];
  const unsubscribe = subscribeChatTurns((turns) => seen.push(turns.length));
  recordChatTurn(turn({ id: "t1" }));
  updateChatTurn("t1", { responseChars: 10 });
  unsubscribe();
  recordChatTurn(turn({ id: "t2" }));

  assert.deepEqual(seen, [1, 1], "no further notifications after unsubscribing");
  clearChatTurns();
});

test("names a local destination as local and a cloud one by provider", async () => {
  const { isLocalDestination } = await loadRecord();

  // This is what the privacy badge reads: whether this question and the
  // meeting passages attached to it left the machine.
  assert.equal(isLocalDestination("local", "local"), true);
  assert.equal(isLocalDestination("llamacpp", "providers"), true);
  assert.equal(isLocalDestination("openai", "providers"), false);
  assert.equal(isLocalDestination("anthropic", "providers"), false);
  // Self-hosted is someone else's machine on the network — not this device.
  assert.equal(isLocalDestination("lan", "self-hosted"), false);
});

test("counts the whole request, system prompt and history together", async () => {
  const { totalRequestChars } = await loadRecord();

  const record = turn({
    systemPromptChars: 1000,
    messageWindow: [
      { role: "user", chars: 50 },
      { role: "assistant", chars: 200 },
    ],
  });
  assert.equal(totalRequestChars(record), 1250);
});

test("section breakdown is largest first and shares sum to one", async () => {
  const { sectionBreakdown } = await loadRecord();

  const record = turn({
    sections: [
      { name: "assistantRole", chars: 200, text: "" },
      { name: "retrievedNotes", chars: 700, text: "" },
      { name: "userProfile", chars: 100, text: "" },
    ],
  });
  const breakdown = sectionBreakdown(record);

  assert.deepEqual(
    breakdown.map((s) => s.name),
    ["retrievedNotes", "assistantRole", "userProfile"]
  );
  assert.equal(breakdown.reduce((sum, s) => sum + s.share, 0).toFixed(4), "1.0000");
  assert.equal(breakdown[0].share, 0.7);
});

test("a turn with no sections does not divide by zero", async () => {
  const { sectionBreakdown } = await loadRecord();

  assert.deepEqual(sectionBreakdown(turn()), []);
});
