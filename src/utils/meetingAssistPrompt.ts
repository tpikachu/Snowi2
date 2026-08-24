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
  "exactly as they would say it out loud. No preamble, no quotation marks, no",
  '"You could say" — just the line itself.',
  "",
  "Prefer a line that does work: answers what was asked, surfaces a number or a",
  "commitment from the user's past notes, or asks the question that moves this",
  "forward. Never invent a fact. Anything you state as settled must come from",
  "the transcript or the notes below.",
  "",
  `If nothing useful can be said right now, reply with exactly ${NO_SUGGESTION}.`,
].join("\n");

/**
 * The fast answer works from the live transcript alone. It is told so
 * explicitly: a model that suspects there is a note library will hedge with
 * "I don't have access to…" preambles, and the one thing a fast answer must
 * never spend tokens on is an apology for being fast.
 */
const FAST_ANSWER_SYSTEM_PROMPT = [
  "You are the user's assistant during a live meeting. They are on a call and",
  "reading your answer while someone waits, so answer in at most two short",
  "sentences. Lead with the answer; no preamble, no caveats.",
  "",
  "The live transcript below is everything you have, and it is enough — a",
  "question asked during a meeting is almost always about that meeting. Answer",
  "from what was said. If the transcript does not contain the answer, say so in",
  "one short line; do not guess and do not apologize.",
  "",
  "If the user asks what to say, reply with the line itself, ready to speak.",
].join("\n");

const THINKING_ANSWER_SYSTEM_PROMPT = [
  "You are the user's assistant during a live meeting. They are on a call and",
  "reading your answer while someone waits, so answer in at most three short",
  "sentences. Lead with the answer; leave out the preamble and the caveats.",
  "",
  "The live transcript below is the primary context — a question asked during a",
  "meeting is almost always about that meeting. The user's past notes are",
  "supporting material: reach for them when the question goes beyond what has",
  "been said today, and prefer a concrete number, date, or commitment from a",
  "note over a vague summary of one.",
  "",
  "If the answer is not in either, say so in one line rather than guessing. If",
  "the user asks what to say, reply with the line itself, ready to speak.",
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
    .map(
      (note) =>
        `<note id="${note.noteId}" title="${note.title}">\n${note.snippet
          .trim()
          .slice(0, maxSnippetChars)}\n</note>`
    )
    .join("\n\n");
}

export interface AssistMessagesInput {
  meetingTitle: string | null;
  segments: readonly AssistSegment[];
  notes: readonly AssistNote[];
  /** Absent for a suggestion, present for an answer. */
  question?: string;
  labels?: AssistSpeakerLabels;
}

export interface AssistMessages {
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
}

function buildContext(input: AssistMessagesInput): string {
  const transcript = formatAssistTranscript(input.segments, input.labels);
  const notes = formatAssistNotes(input.notes);

  return [
    input.meetingTitle ? `Meeting: ${input.meetingTitle}` : "",
    "",
    "Live transcript (most recent last):",
    transcript || "(nothing said yet)",
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
  input: AssistMessagesInput & { question: string; mode: AssistMode }
): AssistMessages {
  const systemPrompt =
    input.mode === "fast" ? FAST_ANSWER_SYSTEM_PROMPT : THINKING_ANSWER_SYSTEM_PROMPT;
  return {
    systemPrompt,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `${buildContext(input)}\n\nMy question: ${input.question.trim()}`,
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
