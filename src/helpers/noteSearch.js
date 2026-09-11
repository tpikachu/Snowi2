/**
 * Free text → FTS5 MATCH expressions.
 *
 * Every token is quoted, so FTS5 syntax typed by a person ("OR", "title:",
 * a stray quote) is searched for as text, and every token is a prefix, so
 * "hel wor" finds "hello world".
 */
function tokenize(input) {
  if (typeof input !== "string") return [];
  return (
    input
      .normalize("NFC")
      .match(/[\p{L}\p{N}_][\p{L}\p{M}\p{N}_]*/gu)
      ?.filter((token) => /[\p{L}\p{N}]/u.test(token)) ?? []
  );
}

const quotePrefix = (token) => `"${token.replace(/"/g, '""')}"*`;

/** The strict query: every token must match. What a search box expects. */
function buildNoteSearchQuery(input) {
  const tokens = tokenize(input);
  if (!tokens.length) return "";
  return tokens.map(quotePrefix).join(" ");
}

/**
 * The rescue query: any token may match, ranked by bm25 so the notes carrying
 * the rare, telling words come first. For a question asked the way people ask
 * them — "what did I promise to send Dana?" — the strict query demands that a
 * note contain "what", "did" and "promise" as well, and nothing does; this is
 * what still finds the note about Dana. Single-character tokens are dropped:
 * a prefix match on "i" is every word starting with i, which is every note.
 * Empty when it would be the same query as the strict one.
 */
function buildNoteSearchAnyQuery(input) {
  const tokens = tokenize(input).filter((token) => token.length > 1);
  if (tokens.length < 2) return "";
  return tokens.map(quotePrefix).join(" OR ");
}

module.exports = { buildNoteSearchQuery, buildNoteSearchAnyQuery };
