/**
 * The title text a model returned, made fit for a note's title field.
 *
 * The prompt asks for the bare title and most models comply; the rest wrap
 * it in quotes or bold, put a "Title:" label or a markdown heading in front,
 * or follow it with a line of explanation. Pure — no service, no store.
 */

/** Wrappers a model may put around the title, opener → closer. */
const WRAPPERS: Array<[string, string]> = [
  ["**", "**"],
  ["__", "__"],
  ["*", "*"],
  ["_", "_"],
  ["`", "`"],
  ['"', '"'],
  ["'", "'"],
  ["“", "”"],
  ["‘", "’"],
  ["«", "»"],
];

const HEADING = /^#{1,6}\s+/;
const LABEL = /^(?:title|meeting title|note title)\s*:\s*/i;

function unwrapOnce(text: string): string {
  for (const [open, close] of WRAPPERS) {
    if (
      text.length >= open.length + close.length &&
      text.startsWith(open) &&
      text.endsWith(close)
    ) {
      return text.slice(open.length, text.length - close.length).trim();
    }
  }
  return text;
}

export function cleanGeneratedTitle(raw: string): string {
  // The title is the first line with anything on it; what follows is the
  // explanation the prompt asked the model to leave out.
  let title =
    String(raw ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? "";

  // Label, heading and wrappers can nest ("**Title: Q3 plan**"), so peel
  // until nothing changes.
  for (;;) {
    const next = unwrapOnce(title.replace(HEADING, "").replace(LABEL, "").trim());
    if (next === title) break;
    title = next;
  }

  title = title.replace(/\s+/g, " ").trim();
  // A stray quote or dash is not a title; neither is an essay.
  if (!/[\p{L}\p{N}]/u.test(title)) return "";
  return title.length < 100 ? title : "";
}
