/**
 * The shape of a meeting answer, recovered from the model's markdown.
 *
 * The answer prompts (meetingAssistPrompt.ts) ask for one of two shapes:
 *
 * - WORDS TO SAY — the words to say out loud, in a fenced block; then the
 *   reasons, as bullets; then, optionally, a short lead-in and a second
 *   fenced block with a firmer or softer version. Told apart by its first
 *   line, an opening fence, so the card knows the shape before the second
 *   token arrives and streams straight into its say block instead of showing
 *   a code block that later snaps into place.
 * - FACTS — one direct line, a few bullets, and last, alone, the exact words
 *   to say wrapped in backticks. The cue card renders that last line as its
 *   own "say this" block with a copy button.
 *
 * Either only works if the parts are found reliably regardless of the small
 * liberties models take: a `Say:` label in front, quotes inside the
 * backticks, a fenced block instead of inline code, a bullet marker the
 * prompt asked them not to use, a language tag on the fence, the reasons
 * after the alternative instead of before it.
 *
 * Pure — no store, no React.
 */

export interface SayBlock {
  /** The lead-in above a later block ("If you want to push further:"), or null. */
  lead: string | null;
  text: string;
  /** The fence has not closed yet — the block is still streaming in. */
  open: boolean;
}

export interface ParsedAssistAnswer {
  /** Which shape the answer took. */
  form: "say" | "fact";
  /**
   * Fact-form: the answer with the say-line removed. Say-form: the reasons —
   * whatever markdown sits between or after the blocks, rendered between the
   * words and the alternative. Trailing blank lines trimmed; empty when none.
   */
  body: string;
  /** Fact-form: the exact line to say out loud, or null when the answer has none. Null for say-form. */
  sayLine: string | null;
  /** Say-form: the words to say, one or more blocks in order. Empty for fact-form. */
  blocks: SayBlock[];
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

/** An opening fence, with or without a language tag (```text). */
const OPEN_FENCE = /^```\w*\s*$/;
const CLOSE_FENCE = /^```\s*$/;
/** A fence still being typed while streaming: only backticks so far. */
const PARTIAL_FENCE = /^`{1,3}\w*\s*$/;
/**
 * A short line ending in a colon, optionally bold: the lead-in above a second
 * block. Never a bullet — a reason bullet streaming in stops at its bolded
 * key ("- **Watch for:**") for a moment, and that is not a lead-in.
 */
const LEAD_IN = /^(?![-*]\s)(?:\*\*)?(?:\S+\s+){0,7}\S+:(?:\*\*)?$/;
/** A line that is a quoted sentence and nothing else. */
const QUOTED_LINE = /^["“'‘].+["”'’]$/;

const stripQuotes = (line: string): string =>
  line
    .trim()
    .replace(/^["“'‘]+/, "")
    .replace(/["”'’]+$/, "")
    .trim();

function trimBlank(lines: readonly string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start += 1;
  while (end > start && lines[end - 1].trim() === "") end -= 1;
  return lines.slice(start, end);
}

const trimTrailingBlank = (lines: readonly string[]): string[] => {
  const out = [...lines];
  while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
  return out;
};

const leadText = (line: string): string | null => line.replace(/\*\*/g, "").trim() || null;

/**
 * Say-form, or null when the answer does not open with a fence.
 *
 * Blocks are read in order. Of the lines between two fences, the last one —
 * when it is a short line ending in a colon — is the next block's lead-in;
 * everything else is the reasons, kept as markdown. Text after the last
 * closed fence is the reasons too, unless it is a lead-in with a single
 * quoted line under it (a second version the model quoted instead of
 * fencing) or a lead-in alone (a block still on its way: kept empty and
 * open; the renderer drops it once the answer has settled).
 */
function parseSayForm(lines: readonly string[]): { blocks: SayBlock[]; body: string } | null {
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i += 1;
  // A "Say:" label above the first fence is the label the block already is.
  if (i < lines.length && BARE_SAY_LABEL.test(lines[i])) i += 1;
  while (i < lines.length && lines[i].trim() === "") i += 1;
  if (i >= lines.length) return null;

  const first = lines[i].trim();
  if (!OPEN_FENCE.test(first)) {
    // The opening fence, still being typed: nothing to show yet, but the
    // shape is known and the card can wait in the say block.
    return i === lines.length - 1 && PARTIAL_FENCE.test(first)
      ? { blocks: [{ lead: null, text: "", open: true }], body: "" }
      : null;
  }

  const blocks: SayBlock[] = [];
  const reasons: string[] = [];
  let between: string[] = [];
  while (i < lines.length) {
    const line = lines[i].trim();
    if (OPEN_FENCE.test(line)) {
      const inner: string[] = [];
      let j = i + 1;
      while (j < lines.length && !CLOSE_FENCE.test(lines[j].trim())) {
        inner.push(lines[j].trim());
        j += 1;
      }
      const open = j >= lines.length;
      const kept = trimBlank(between);
      const last = kept[kept.length - 1]?.trim() ?? "";
      const lead = blocks.length > 0 && LEAD_IN.test(last) ? leadText(last) : null;
      reasons.push(...(lead ? kept.slice(0, -1) : kept));
      blocks.push({ lead, text: stripQuotes(inner.filter(Boolean).join(" ")), open });
      between = [];
      i = open ? j : j + 1;
    } else {
      between.push(lines[i]);
      i += 1;
    }
  }

  const trailing = trimBlank(between);
  if (trailing.length > 0) {
    const head = trailing[0].trim();
    const last = trailing[trailing.length - 1].trim();
    const rest = trailing.slice(1).filter((line) => line.trim() !== "");
    if (LEAD_IN.test(head) && rest.length === 1 && QUOTED_LINE.test(rest[0].trim())) {
      // A second version the model quoted instead of fencing.
      blocks.push({ lead: leadText(head), text: stripQuotes(rest[0]), open: false });
    } else if (LEAD_IN.test(last)) {
      // A lead-in with nothing under it yet: the block is still on its way.
      reasons.push(...trailing.slice(0, -1));
      blocks.push({ lead: leadText(last), text: "", open: true });
    } else {
      reasons.push(...trailing);
    }
  }

  return { blocks, body: trimBlank(reasons).join("\n") };
}

export function parseAssistAnswer(text: string): ParsedAssistAnswer {
  const lines = trimTrailingBlank(text.replace(/\r\n?/g, "\n").split("\n"));
  if (lines.length === 0) return { form: "fact", body: "", sayLine: null, blocks: [] };

  const say = parseSayForm(lines);
  if (say) return { form: "say", body: say.body, sayLine: null, blocks: say.blocks };

  let sayLine: string | null = null;
  let bodyLines = lines;

  // A fenced block at the end: the say-line is whatever it wraps.
  const last = lines[lines.length - 1].trim();
  if (CLOSE_FENCE.test(last)) {
    const start = lines
      .slice(0, -1)
      .map((line) => OPEN_FENCE.test(line.trim()))
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

  return { form: "fact", body: bodyLines.join("\n"), sayLine: sayLine || null, blocks: [] };
}

/**
 * A say-form answer as plain text, for the clipboard, in the order the card
 * shows it: the words, the reasons, then the alternative under its lead-in.
 * Fences gone.
 */
export function sayAnswerText({
  blocks,
  body,
}: Pick<ParsedAssistAnswer, "blocks" | "body">): string {
  const [words, ...rest] = blocks.filter((block) => block.text);
  const asText = (block: SayBlock) => (block.lead ? `${block.lead}\n${block.text}` : block.text);
  return [words ? asText(words) : "", body, ...rest.map(asText)].filter(Boolean).join("\n\n");
}
