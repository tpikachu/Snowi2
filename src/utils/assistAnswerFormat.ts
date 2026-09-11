/**
 * The shape of a meeting answer, recovered from the model's markdown.
 *
 * The answer prompts ask for a fixed skeleton — one direct line, a few
 * bullets, and last, alone, the exact words to say wrapped in backticks. The
 * cue card renders that last line as its own "say this" block with a copy
 * button, which only works if the line is found reliably regardless of the
 * small liberties models take with it: a `Say:` label in front, quotes
 * inside the backticks, a fenced block instead of inline code, or a bullet
 * marker the prompt asked them not to use.
 *
 * Pure — no store, no React.
 */

export interface ParsedAssistAnswer {
  /** The answer with the say-line removed, trailing blank lines trimmed. */
  body: string;
  /** The exact line to say out loud, or null when the answer has none. */
  sayLine: string | null;
}

/** The label models put in front of the line: `Say:`, `**Say this:**`, `You could say:`. */
const SAY_WORDS = String.raw`(?:say(?: this)?|you could say|try(?: saying)?|line to say)`;
/**
 * Optional bullet, optional bold, optional label, and a colon that may sit
 * inside or outside the bold — every way "Say:" has been seen written.
 */
const SAY_PREFIX = String.raw`(?:[-*]\s+)?(?:\*\*)?${SAY_WORDS}?\s*:?\s*(?:\*\*)?\s*:?\s*`;
/** Same, with the label required. */
const SAY_LABEL = String.raw`(?:[-*]\s+)?(?:\*\*)?${SAY_WORDS}\s*:?\s*(?:\*\*)?\s*:?\s*`;

const INLINE_SAY_LINE = new RegExp(`^\\s*${SAY_PREFIX}\`([^\`]+)\`\\s*$`, "i");
/** The label is required here: a bare quoted line could be a quoted fact. */
const QUOTED_SAY_LINE = new RegExp(`^\\s*${SAY_LABEL}["“](.+)["”]\\s*$`, "i");
/** A label-only line left behind once its say-line is lifted out ("Say:"). */
const BARE_SAY_LABEL = new RegExp(`^\\s*${SAY_LABEL}$`, "i");

const stripQuotes = (line: string): string =>
  line
    .trim()
    .replace(/^["“'‘]+/, "")
    .replace(/["”'’]+$/, "")
    .trim();

function trimTrailingBlank(lines: string[]): string[] {
  const out = [...lines];
  while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
  return out;
}

export function parseAssistAnswer(text: string): ParsedAssistAnswer {
  const lines = trimTrailingBlank(text.replace(/\r\n?/g, "\n").split("\n"));
  if (lines.length === 0) return { body: "", sayLine: null };

  let sayLine: string | null = null;
  let bodyLines = lines;

  // A fenced block at the end: the say-line is whatever it wraps.
  const last = lines[lines.length - 1].trim();
  if (/^```\s*$/.test(last)) {
    const start = lines
      .slice(0, -1)
      .map((line) => /^```\w*\s*$/.test(line.trim()))
      .lastIndexOf(true);
    if (start >= 0) {
      const inner = lines
        .slice(start + 1, -1)
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" ");
      if (inner) {
        sayLine = stripQuotes(inner);
        bodyLines = lines.slice(0, start);
      }
    }
  }

  if (sayLine === null) {
    const lastLine = lines[lines.length - 1];
    const match = INLINE_SAY_LINE.exec(lastLine) ?? QUOTED_SAY_LINE.exec(lastLine);
    if (match) {
      sayLine = stripQuotes(match[1]);
      bodyLines = lines.slice(0, -1);
    }
  }

  // A model that leads with the line instead of ending with it — the whole
  // first line backticked, facts below. Still the line to say; lifting it
  // keeps the card's one shape instead of rendering a sentence as code.
  if (sayLine === null && lines.length > 1) {
    const match = INLINE_SAY_LINE.exec(lines[0]);
    if (match) {
      sayLine = stripQuotes(match[1]);
      bodyLines = lines.slice(1);
      while (bodyLines.length > 0 && bodyLines[0].trim() === "") bodyLines = bodyLines.slice(1);
    }
  } else if (sayLine !== null && bodyLines.length > 0) {
    // Both ends backticked: the last line is the say-line, so the first is
    // the direct answer wrongly set as code. Unwrap it into the bold lead
    // the skeleton asks for, rather than rendering a sentence in monospace.
    const match = INLINE_SAY_LINE.exec(bodyLines[0]);
    if (match) {
      bodyLines = [`**${stripQuotes(match[1])}**`, ...bodyLines.slice(1)];
    }
  }

  if (sayLine !== null) {
    bodyLines = trimTrailingBlank(bodyLines);
    // "Say:" on its own line above the backticked line is the label the
    // say-line block already is — drop it rather than render an orphan.
    if (bodyLines.length > 0 && BARE_SAY_LABEL.test(bodyLines[bodyLines.length - 1])) {
      bodyLines = trimTrailingBlank(bodyLines.slice(0, -1));
    }
  }

  return { body: bodyLines.join("\n"), sayLine: sayLine || null };
}
