// @ts-check
/* global window -- browser global used inside page.evaluate callbacks */
const { test, expect } = require("@playwright/test");
const { launchApp, controlPanelPage, skipOnboarding } = require("./launch");

/**
 * Note retrieval, the way the chat's search_notes tool uses it.
 *
 * A question asked in plain words has to find the note that answers it — the
 * failure this guards is the assistant saying "I couldn't find that" about a
 * note that plainly existed, because keyword search demanded every word of
 * the question. Runs against the app's own IPC, so both halves of the hybrid
 * (the vector index in this run's own Qdrant store, and the keyword rescue
 * pass) are the real ones.
 */

/** @type {import("playwright").ElectronApplication | null} */
let app = null;

test.afterEach(async () => {
  if (app) {
    await app.close().catch(() => {});
    app = null;
  }
});

const NOTE = {
  title: "Acme kickoff",
  transcript:
    "You: Thanks for making time — the goal today is to agree on the rollout scope.\n" +
    "Them: Pricing needs sign-off from Dana before we commit to the annual plan.\n" +
    "You: Understood — I'll send the proposal today so she has the numbers.",
  enhanced:
    "A kickoff with Acme to scope the pilot rollout.\n\n## Action Items\n" +
    "- [ ] You: send the pricing proposal to Dana today\n",
};

test("a plain-words question finds the note that answers it", async () => {
  ({ app } = await launchApp(test.info()));
  const page = await controlPanelPage(app);
  await skipOnboarding(page);

  const noteId = await page.evaluate(async (note) => {
    const api = /** @type {any} */ (window).electronAPI;
    const saved = await api.saveNote(note.title, "", "meeting");
    await api.updateNote(saved.note.id, {
      transcript: note.transcript,
      enhanced_content: note.enhanced,
    });
    return saved.note.id;
  }, NOTE);

  // The vector upsert is asynchronous and the embedding worker spawns on
  // first use; poll rather than sleep, and the keyword rescue makes the
  // question findable even before the index catches up.
  await expect
    .poll(
      async () =>
        page.evaluate(async (query) => {
          const api = /** @type {any} */ (window).electronAPI;
          const results = await api.semanticSearchNotes(query, 5, null, null);
          return (results ?? []).map((/** @type {any} */ r) => r.id);
        }, "What did I promise to send Dana?"),
      { timeout: 30_000 }
    )
    .toContain(noteId);

  // The strict keyword path itself, with the arguments the app passes.
  const keyword = await page.evaluate(async () => {
    const api = /** @type {any} */ (window).electronAPI;
    const results = await api.searchNotes("What did I promise to send Dana?", 5, null, null);
    return (results ?? []).map((/** @type {any} */ r) => r.title);
  });
  expect(keyword).toContain("Acme kickoff");
});
