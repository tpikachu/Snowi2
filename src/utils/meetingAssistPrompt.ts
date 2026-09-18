/**
 * What the meeting assistant is actually asked.
 *
 * Two jobs, two prompts, and they are not the same job. A *suggestion* is
 * unsolicited and has to be worth glancing at mid-sentence: one line, in the
 * user's own voice, ready to be said aloud. An *answer* was asked for, so it
 * may be a couple of sentences — but it is still being read by someone in a
 * live call, and anything that needs scrolling has failed.
 *
 * Both are grounded on two things: the meeting happening right now, which is
 * the primary context, and passages from the user's own past notes, which are
 * supporting material. The order matters — a question asked during a meeting is
 * almost always about the meeting, and prompts that lead with retrieved notes
 * get answers about last month.
 *
 * Pure — no store, no Electron, no network. English throughout: these are
 * system prompts, which the project does not translate, and the speaker labels
 * are structural markers rather than user-facing text.
 */

import type { AssistSegment } from "./meetingAssistPolicy";
import type { AssistMode } from "./meetingAssistState";

/** A retrieved passage, in the shape the hook hands over. */
export interface AssistNote {
  noteId: number;
  title: string;
  snippet: string;
  /**
   * The claims extracted from this note, pre-formatted with current statuses.
   * Attached so a passage saying "$40k" arrives beside the row that knows the
   * price was renegotiated — the correction the passage itself cannot carry.
   */
  claims?: string;
}

/** The durable-memory slice a thinking-grade request pins beside the notes. */
export interface AssistMemoryContext {
  profile?: string;
  openCommitments?: string;
  /**
   * What happened last time this meeting met, when the meeting is an
   * occurrence of a series. Known at meeting start and pinned rather than
   * retrieved: "as discussed last week" is the single most likely reference
   * in a recurring meeting, and retrieval only finds it when someone phrases
   * a question the way the note happens to read.
   */
  previousMeeting?: {
    /** ISO date of the last occurrence, shown in the heading. */
    date: string;
    /** Pre-formatted claim lines with current statuses (formatNoteClaims). */
    claims?: string;
    /**
     * An excerpt of the occurrence's own notes, for meetings whose notes were
     * typed by hand and never went through extraction. Rendered under a
     * heading that says it may be out of date — unlike claims, raw note text
     * carries no statuses to correct itself with.
     */
    notes?: string;
  };
}

export interface AssistSpeakerLabels {
  you: string;
  others: string;
}

export const ASSIST_SPEAKER_LABELS: AssistSpeakerLabels = { you: "You", others: "Others" };

/**
 * The sentinel a suggestion model returns when it has nothing worth saying.
 *
 * Without an explicit way out, a model asked for advice always produces some —
 * and a stream of "you could ask them to elaborate" is worse than an empty
 * pane, because it teaches the user to stop looking at the pane.
 */
export const NO_SUGGESTION = "NONE";

/** How much of a retrieved passage is worth carrying. Prefill is the latency. */
export const ASSIST_NOTE_SNIPPET_CHARS = 600;

const SUGGESTION_SYSTEM_PROMPT = [
  "You are sitting beside the user in a live meeting, feeding them lines.",
  "The other side has just stopped talking and the user has to respond.",
  "",
  "Reply with ONE thing the user could say next, at most two sentences, phrased",
  "exactly as they would say it out loud: open by responding to what was just",
  "said — agree, acknowledge, or bridge — then make the point. No preamble, no",
  'quotation marks, no "You could say" — just the line itself.',
  "",
  "Prefer a line that does work: answers what was asked, surfaces a number or a",
  "commitment from the user's past notes, or asks the question that moves this",
  "forward. Never invent a fact. Anything you state as settled must come from",
  "the transcript or the notes below.",
  "",
  `If nothing useful can be said right now, reply with exactly ${NO_SUGGESTION}.`,
].join("\n");

/**
 * The two shapes an answer takes, shared by both answer prompts.
 *
 * Read mid-call, at a glance, by someone whose turn to talk is coming.
 * Asked what to say, the words come first — two or three spoken sentences
 * in a fenced block, opening by responding to what was just said — then the
 * reasons as grounded bullets, then an optional firmer or softer second
 * block under a lead-in (the words alone read as thin; client, 2026-09-14).
 * Asked
 * what happened, it is a direct line, facts one per line, and — last and
 * alone — the words to say in backticks. The cue card renders each shape
 * (assistAnswerFormat.ts; the first line tells it which), which is why the
 * skeleton is a hard rule with an example rather than a preference: a model
 * that drifts into prose or tucks the line into a bullet defeats the
 * renderer as well as the reader. Side by side against the reference
 * product (client, 2026-09-14) the old one-line quote under bullets read
 * as a memo; the spoken block is what read as advice. The examples are
 * short on purpose — they teach the shape, not the length.
 */
export const ANSWER_FORMAT_BLOCK = [
  "Format for a glance, never as a paragraph — the user reads this mid-call.",
  "Two kinds of questions arrive, and each has its own shape. Decide which",
  "from the question, follow that shape exactly, and add nothing else.",
  "",
  "WORDS TO SAY — asked what to say, how to respond, whether to push back, how",
  'to phrase something, or "What should I say?": first the words, ready to',
  "speak, inside one fenced block (``` alone on the line before and after).",
  "Two or three short sentences in the user's own voice, the way people talk",
  "on a call: open by responding to the last thing the other side said —",
  "agree, acknowledge, or bridge — then take a position, then give the one",
  "reason or the next step. The next step is one the user can take now; never",
  "promise a deadline, a number, or a deliverable the meeting has not put on",
  "the table. No bold, no bullets, no label, nothing before the block.",
  "Then the reasons, so the user can trust the line and adapt it: two or three",
  "dash bullets, each ONE line opening with a bolded key phrase of two to four",
  "words and a colon — what the other side said or wants (quote their words",
  "when it matters), why the line lands and what it commits the user to, and",
  "anything to watch for. Every reason points at something said in the meeting",
  "or in the material below; never a generic tip.",
  "Last, only when a meaningfully firmer, softer, or more probing version",
  "exists — a different stance, not the same words again — ONE lead-in line of",
  "at most six words ending in a colon, and a second fenced block of at most",
  "two sentences. Never a third block.",
  "",
  "FACTS — asked what was said, agreed, or decided, for a number, a name, a",
  "recap, or what is still open: first line, the direct answer, ONE line, its",
  "decisive words — the number, the name, the yes or no — bolded with **…**,",
  "no label, no numbering. Then, only if there is more: dash bullets, at most",
  "four, each ONE line opening with a bolded key phrase of two to four words",
  "and a colon, then the fact, quoting the exact words when the point rests on",
  "them. Last, only when the user also needs words to say: the exact line,",
  "alone, LAST, wrapped in backticks (`…`), in the user's",
  'voice, never inside a bullet, no "Say:" label. A one-fact answer is just',
  "its first line.",
  "",
  "In both shapes: no headings, no tables, no numbered lists, no preamble, no",
  "closing remark, and never a label that names a part of the answer. Never",
  "invent a date, a number, or a name: anything stated as fact comes from the",
  "meeting or the material below.",
  "",
  "Example — words to say:",
  "```",
  "That's fair, the price does look high next to the pilot. I'd rather hold it",
  "and widen what's included than discount it. Let me walk you through what a",
  "bundled version would look like.",
  "```",
  '- **Their point:** "the pilot was half this" — they are anchoring on the pilot rate.',
  "- **Why this lands:** it concedes the comparison, not the price, and offers scope instead of a discount.",
  "- **Watch for:** if they ask for the bundle in writing, that is a yes — offer nothing more.",
  "If you want to push further:",
  "```",
  "I hear you on the price, but the pilot was priced to prove the fit, not to",
  "set the rate. If budget is the constraint, let's talk scope first.",
  "```",
  "",
  "Example — facts:",
  "Delivery slips to **March 14**, two weeks past the original date.",
  "- **Cause:** the vendor's API is not certified until March 10.",
  "- **Their ask:** Priya wants a written revised timeline by Friday.",
  "`We can commit to March 14, and I'll send the revised timeline by Friday.`",
].join("\n");

/**
 * The fast answer works from the live transcript alone. It is told so
 * explicitly: a model that suspects there is a note library will hedge with
 * "I don't have access to…" preambles, and the one thing a fast answer must
 * never spend tokens on is an apology for being fast.
 */
const FAST_ANSWER_SYSTEM_PROMPT = [
  "You are the user's assistant during a live meeting. They are on a call and",
  "reading your answer while someone waits, so stay under about 140 words in",
  "all — the words to say come first, everything else follows them.",
  "Lead with the answer; no preamble, no caveats.",
  "",
  ANSWER_FORMAT_BLOCK,
  "",
  "Two kinds of questions arrive, and they are answered differently:",
  "",
  "- Asked what happened — what was said, agreed, or quoted: answer only from",
  "  the live transcript below. If it is not there, say so in one short line;",
  "  do not guess and do not apologize.",
  "- Asked for advice — what to say, how to respond, whether to push back, how",
  '  to phrase something: this is NEVER answered with "that is not in the',
  '  transcript". The transcript is your input, not where the answer lives.',
  "  Read the situation and commit to your best recommendation immediately,",
  "  phrased as the words the user can say out loud.",
].join("\n");

const THINKING_ANSWER_SYSTEM_PROMPT = [
  "You are the user's assistant during a live meeting. They are on a call and",
  "reading your answer while someone waits, so stay under about 180 words in",
  "all — the words to say come first, everything else follows them.",
  "Lead with the answer; leave out the preamble and the caveats.",
  "",
  ANSWER_FORMAT_BLOCK,
  "",
  "The live transcript below is the primary context — a question asked during a",
  "meeting is almost always about that meeting. The user's past notes are",
  "supporting material: reach for them when the question goes beyond what has",
  "been said today, and prefer a concrete number, date, or commitment from a",
  "note over a vague summary of one. Where a note's passage carries claims with",
  "a current status, the status is newer than the passage — never quote a claim",
  "marked superseded as if it still holds.",
  "",
  "Two kinds of questions arrive, and they are answered differently:",
  "",
  "- Asked what happened — what was said, agreed, or quoted: answer only from",
  "  the transcript and notes. If it is in neither, say so in one line rather",
  "  than guessing.",
  "- Asked for advice — what to say, how to respond, whether to push back, how",
  '  to phrase something: this is NEVER answered with "that is not in the',
  '  context". The context is your input, not where the answer lives. Weigh the',
  "  situation against what the notes and commitments say, and commit to your",
  "  best recommendation immediately, phrased as the words the user can say out",
  "  loud.",
].join("\n");

/**
 * The transcript, as the model sees it.
 *
 * Speaker attribution is deliberately just the two sides. Which of several
 * remote participants said a thing is a diarization problem the meeting path
 * does not solve live, and a confident wrong name in a suggestion is worse than
 * no name at all.
 */
export function formatAssistTranscript(
  segments: readonly AssistSegment[],
  labels: AssistSpeakerLabels = ASSIST_SPEAKER_LABELS
): string {
  return segments
    .map((segment) => ({ text: segment.text.trim(), source: segment.source }))
    .filter((line) => line.text)
    .map((line) => `${line.source === "mic" ? labels.you : labels.others}: ${line.text}`)
    .join("\n");
}

/**
 * What to search the note library for.
 *
 * For a question, the question itself plus the tail of the meeting: "did we
 * agree that?" retrieves nothing on its own. For a suggestion there is no
 * question, so the other side's most recent words are the query — what the user
 * needs help with is whatever was just said to them.
 */
export function buildAssistRetrievalQuery(
  segments: readonly AssistSegment[],
  question?: string,
  maxChars = 500
): string {
  const asked = question?.trim();
  const relevant = asked ? segments : segments.filter((segment) => segment.source === "system");

  const tail: string[] = [];
  let chars = asked ? asked.length : 0;
  for (let i = relevant.length - 1; i >= 0; i -= 1) {
    const text = relevant[i].text.trim();
    if (!text) continue;
    if (chars + text.length > maxChars && tail.length > 0) break;
    tail.push(text);
    chars += text.length;
  }

  return [asked, ...tail.reverse()].filter(Boolean).join("\n");
}

/** Renders retrieved passages. The id is what a citation would refer to. */
export function formatAssistNotes(
  notes: readonly AssistNote[],
  maxSnippetChars = ASSIST_NOTE_SNIPPET_CHARS
): string {
  return notes
    .map((note) => {
      const snippet = note.snippet.trim().slice(0, maxSnippetChars);
      const claims = note.claims?.trim()
        ? `\nClaims from this note, with current status:\n${note.claims.trim()}`
        : "";
      return `<note id="${note.noteId}" title="${note.title}">\n${snippet}${claims}\n</note>`;
    })
    .join("\n\n");
}

export interface AssistMessagesInput {
  meetingTitle: string | null;
  segments: readonly AssistSegment[];
  notes: readonly AssistNote[];
  /** Durable memory. Absent on the fast path, which is transcript-only. */
  memory?: AssistMemoryContext;
  /** Absent for a suggestion, present for an answer. */
  question?: string;
  labels?: AssistSpeakerLabels;
}

export interface AssistMessages {
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
  /**
   * The prompt without the screen-source block — what a text-only pass
   * (image dropped on a local/LAN route, or a rejected-image retry) must
   * swap in, so the prompt never promises a screenshot the request lacks.
   * Equals `systemPrompt` when no screenshot was attached.
   */
  textOnlySystemPrompt: string;
}

/**
 * Appended while "observe my screen" is on and a capture succeeded. It has to
 * out-argue the base prompt's "answer only from the transcript" — the screen
 * is a co-equal live source, not an attachment to mention. With several
 * displays every screen is attached, each introduced by its label, because
 * on a multi-monitor desk the meeting is on whichever screen the cue card is
 * not — and the model, not the card, is what can tell which. English like
 * the rest of the system prompt (AI prompts are not localized).
 */
export function screenSourceBlock(count: number): string {
  const attached =
    count > 1
      ? [
          `${count} screenshots are attached, one per display, in left-to-right`,
          "order, each introduced by its label (Screen 1 of N, …). Together they",
          "are the user's whole desktop; the meeting, a shared screen, or a",
          "document may be on any of them, so read every one. When a screen",
          "matters to the answer, name it the way its label does.",
        ]
      : ["A screenshot of the user's current screen is attached."];
  return [
    ...attached,
    "The screen is a live source with the same standing as the transcript —",
    "read it before answering, every time. Whatever is visible — a document, a",
    "slide, code, a dashboard, an error, a message thread — is context you",
    'HAVE, and "answer only from the transcript" extends to it: what is on',
    "screen counts as what happened. Questions about what is on the screen are",
    "answered from the screenshot directly; when both sources speak to the",
    "question, combine them.",
  ].join("\n");
}

/**
 * Appended while the cue card's web search is on. Search is for facts the
 * meeting cannot settle, never for what was said — the transcript is the
 * record — and it is capped, because every search is seconds the user waits
 * through mid-call. The card lists the sources itself, so the answer names
 * them in words and never pastes a URL. Phrased for the tool's absence too:
 * a provider can refuse the tool and the request is retried without it, and
 * a claimed search that never happened is the one thing worse than none.
 */
export const WEB_SEARCH_BLOCK = [
  "A web search tool may be offered with this request. Use it — at most twice",
  "— only for what the meeting and the material below cannot settle: a claim",
  "to check, a company, product, person or event, a price, a figure, a date,",
  "a rule. Never search for what was said in the meeting; the transcript is",
  "the record. When you searched, ground the answer in what you found and",
  "name where it came from in a few words (the site or publication), never a",
  "URL. If nothing useful came back, say so in a few words and answer from",
  "the meeting. If no search tool is offered, answer from the meeting and",
  "never claim a search.",
].join("\n");

function buildContext(input: AssistMessagesInput): string {
  const transcript = formatAssistTranscript(input.segments, input.labels);
  const notes = formatAssistNotes(input.notes);
  const previous = input.memory?.previousMeeting;
  const previousClaims = previous?.claims?.trim() ?? "";
  // Claims win when both exist: they carry current statuses, the raw text
  // cannot, and rendering both would put the stale wording beside its
  // correction as if they were peers.
  const previousNotes = previousClaims ? "" : (previous?.notes?.trim() ?? "");
  const profile = input.memory?.profile?.trim() ?? "";
  const commitments = input.memory?.openCommitments?.trim() ?? "";

  // Transcript first (the meeting is the primary context), then the previous
  // occurrence (specific to exactly this meeting, so it outranks the general
  // memory), then durable memory (small, exact, current), then retrieved
  // passages (recall, may be stale — which is why each carries its claims).
  return [
    input.meetingTitle ? `Meeting: ${input.meetingTitle}` : "",
    "",
    "Live transcript (most recent last):",
    transcript || "(nothing said yet)",
    previousClaims
      ? `\nLast time this meeting met (${previous!.date}), with current statuses:`
      : "",
    previousClaims,
    previousNotes
      ? `\nFrom the user's own notes last time this meeting met (${previous!.date}) — may be out of date:`
      : "",
    previousNotes,
    profile ? "\nAbout the user, from their past meetings:" : "",
    profile,
    commitments ? "\nOpen commitments (current, exact — trust these over recollection):" : "",
    commitments,
    notes ? "\nFrom the user's past notes:" : "",
    notes,
  ]
    .filter((part) => part !== "")
    .join("\n")
    .trim();
}

export function buildSuggestionMessages(input: AssistMessagesInput): AssistMessages {
  const systemPrompt = SUGGESTION_SYSTEM_PROMPT;
  return {
    systemPrompt,
    textOnlySystemPrompt: systemPrompt,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `${buildContext(input)}\n\nWhat should I say next?`,
      },
    ],
  };
}

export function buildAnswerMessages(
  input: AssistMessagesInput & {
    question: string;
    mode: AssistMode;
    draft?: string;
    /**
     * How many screenshots ride with this ask — one per display when observe
     * is on. Zero (or absent) means none, and the prompt must not mention one.
     */
    screenCount?: number;
    /** The cue card's web search is on: the prompt says when to search and how to cite. */
    webSearch?: boolean;
  }
): AssistMessages {
  const basePrompt =
    input.mode === "fast" ? FAST_ANSWER_SYSTEM_PROMPT : THINKING_ANSWER_SYSTEM_PROMPT;
  // The search block belongs to both prompts: a text-only retry drops the
  // screenshots, not the search tool.
  const textOnlySystemPrompt = input.webSearch
    ? `${basePrompt}\n\n${WEB_SEARCH_BLOCK}`
    : basePrompt;
  const screenCount = Math.max(0, Math.floor(input.screenCount ?? 0));
  const systemPrompt =
    screenCount > 0
      ? `${textOnlySystemPrompt}\n\n${screenSourceBlock(screenCount)}`
      : textOnlySystemPrompt;
  // Draft-then-refine: when a fast answer is escalated, its text rides along
  // so the thinking model verifies and extends an answer the user has already
  // read, instead of starting blind and possibly contradicting it for no
  // reason. Thinking-only — a fast request has no earlier draft to refine,
  // and its prompt promises the transcript is the whole context.
  const draft = input.mode === "thinking" ? (input.draft?.trim() ?? "") : "";
  const draftBlock = draft
    ? [
        "",
        "",
        "A first answer was already drafted from the live transcript alone:",
        `"${draft}"`,
        "Check it against the notes and memory above: keep what holds, silently",
        "correct anything they contradict, and add the concrete details they",
        "contribute. Reply with the improved answer only, in the same skeleton —",
        "never mention the draft, a correction, or what changed.",
      ].join("\n")
    : "";
  return {
    systemPrompt,
    textOnlySystemPrompt,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `${buildContext(input)}\n\nMy question: ${input.question.trim()}${draftBlock}`,
      },
    ],
  };
}

/**
 * Store segments as the policy wants them.
 *
 * A segment's timestamp can be missing — some transcription paths do not carry
 * one — and the store appends those at the end, so a missing timestamp means
 * "later than everything before it". Carrying the previous one forward keeps
 * such a segment inside the window instead of silently falling out of it,
 * which would make the assistant deaf to exactly the newest thing said.
 */
export function toAssistSegments(
  segments: ReadonlyArray<{ text: string; source: string; timestamp?: number }>,
  now: number
): AssistSegment[] {
  const result: AssistSegment[] = [];
  let previous = now;
  for (const segment of segments) {
    const text = segment.text?.trim();
    if (!text) continue;
    const timestamp = segment.timestamp ?? previous;
    previous = timestamp;
    result.push({ text, source: segment.source === "mic" ? "mic" : "system", timestamp });
  }
  return result;
}

/**
 * The model's reply, or null when it declined.
 *
 * Models return the sentinel with punctuation, quotes, or a sentence of
 * explanation around it often enough that an exact-match check lets the word
 * "NONE" through to the user as advice.
 */
export function parseSuggestion(raw: string): string | null {
  const text = raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
  if (!text) return null;
  if (new RegExp(`^${NO_SUGGESTION}[.!\\s]*$`, "i").test(text)) return null;
  return text;
}
