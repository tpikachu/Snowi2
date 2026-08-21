/**
 * When to precompute the meeting assistant's next suggestion.
 *
 * The product requirement is that "What do I say next?" answers instantly. No
 * model is instant, so the answer cannot be computed when the question is
 * asked — it has to be already sitting there when the user looks. That turns a
 * latency problem into a scheduling one, which is what this file is.
 *
 * The scheduling has to be miserly on purpose. Regenerating on every finalized
 * segment of a busy meeting is several inference calls a minute for an hour,
 * which on the local tier competes with the ASR that the captions depend on,
 * and on the cloud tier is a bill. So the rules below all exist to spend a call
 * only when it is likely to change what the user would be told.
 *
 * Pure — no store, no timers, no Electron. The hook supplies the clock.
 */

export type AssistSource = "mic" | "system";

export interface AssistSegment {
  text: string;
  source: AssistSource;
  /** `Date.now()` when the segment landed. */
  timestamp: number;
}

export interface AssistSchedulerState {
  /** `Date.now()` of the last request that was actually sent. */
  lastRequestAt: number | null;
  /** Whether a request is currently outstanding. */
  inFlight: boolean;
  /** Word count of the assist window at the moment of the last request. */
  lastRequestWords: number;
  /** Timestamp of the newest segment included in the last request. */
  lastRequestSegmentAt: number | null;
}

export const IDLE_SCHEDULER: AssistSchedulerState = {
  lastRequestAt: null,
  inFlight: false,
  lastRequestWords: 0,
  lastRequestSegmentAt: null,
};

/**
 * How long the assistant looks back. Short on purpose: prefill is where the
 * latency lives, and advice about what to say next is about the last thing
 * said, not about minute four.
 */
export const ASSIST_WINDOW_MS = 90_000;

/** Hard ceiling on the window regardless of time, so a dense stretch cannot blow up the prompt. */
export const ASSIST_WINDOW_CHARS = 2_400;

/** Never spend two calls closer together than this. */
export const MIN_REQUEST_INTERVAL_MS = 4_000;

/**
 * New words needed before a fresh call can say anything the last one could not.
 * Roughly a sentence: below that the model is re-reading its own input.
 */
export const MIN_NEW_WORDS = 12;

/**
 * After this much silence a suggestion stops describing the present. The UI
 * dims rather than hides it — a slightly old prompt still beats a blank box
 * when someone is staring at you waiting for an answer.
 */
export const SUGGESTION_STALE_MS = 60_000;

const countWords = (text: string): number => (text.trim() ? text.trim().split(/\s+/).length : 0);

/**
 * The slice of conversation a suggestion is computed from.
 *
 * Trimmed from the end, so what survives the character cap is the most recent
 * talk rather than the start of the window.
 */
export function selectAssistWindow(
  segments: readonly AssistSegment[],
  now: number,
  options: { windowMs?: number; maxChars?: number } = {}
): AssistSegment[] {
  const windowMs = options.windowMs ?? ASSIST_WINDOW_MS;
  const maxChars = options.maxChars ?? ASSIST_WINDOW_CHARS;
  const cutoff = now - windowMs;

  const recent: AssistSegment[] = [];
  let chars = 0;
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i];
    if (segment.timestamp < cutoff) break;
    const length = segment.text.length + 1;
    if (chars + length > maxChars && recent.length > 0) break;
    recent.push(segment);
    chars += length;
  }
  return recent.reverse();
}

export type AssistDecision =
  | { request: true; reason: "theyStoppedTalking" }
  | {
      request: false;
      reason:
        "notRecording" | "paused" | "inFlight" | "throttled" | "tooLittleNew" | "youSpokeLast";
    };

/**
 * Should a suggestion be requested right now?
 *
 * The rule that matters most is `youSpokeLast`. A suggestion is only worth
 * computing when the *other* side has just finished a thought — that is the
 * moment the user is on the spot and has nothing to say. Right after the user
 * themselves speaks they need nothing, and precomputing there would burn half
 * the calls of the meeting on the half of it where the feature is useless.
 */
export function decideAssistRequest(input: {
  isRecording: boolean;
  isPaused: boolean;
  window: readonly AssistSegment[];
  scheduler: AssistSchedulerState;
  now: number;
}): AssistDecision {
  const { isRecording, isPaused, window, scheduler, now } = input;

  if (!isRecording) return { request: false, reason: "notRecording" };
  if (isPaused) return { request: false, reason: "paused" };

  // One at a time. A queued follow-up is pointless: by the time it ran, the
  // conversation it was queued for would be over, and this re-evaluates on the
  // next segment anyway with fresher input.
  if (scheduler.inFlight) return { request: false, reason: "inFlight" };

  const last = window[window.length - 1];
  if (!last) return { request: false, reason: "tooLittleNew" };
  if (last.source === "mic") return { request: false, reason: "youSpokeLast" };

  if (scheduler.lastRequestAt != null && now - scheduler.lastRequestAt < MIN_REQUEST_INTERVAL_MS) {
    return { request: false, reason: "throttled" };
  }

  const words = countWords(window.map((segment) => segment.text).join(" "));
  if (words - scheduler.lastRequestWords < MIN_NEW_WORDS) {
    // Compared against the last *request*, not the last segment: a run of short
    // back-and-forth segments should accumulate into one call rather than
    // failing this check individually and then never firing.
    return { request: false, reason: "tooLittleNew" };
  }

  return { request: true, reason: "theyStoppedTalking" };
}

/** Fold a sent request into the scheduler. */
export function markRequested(
  scheduler: AssistSchedulerState,
  window: readonly AssistSegment[],
  now: number
): AssistSchedulerState {
  const last = window[window.length - 1];
  return {
    lastRequestAt: now,
    inFlight: true,
    lastRequestWords: countWords(window.map((segment) => segment.text).join(" ")),
    lastRequestSegmentAt: last?.timestamp ?? scheduler.lastRequestSegmentAt,
  };
}

/**
 * Fold a settled request in, success or failure.
 *
 * A failure deliberately keeps `lastRequestWords` where it is rather than
 * resetting it: the words really were sent, and rewinding would let the next
 * segment immediately retry the same call that just failed.
 */
export function markSettled(scheduler: AssistSchedulerState): AssistSchedulerState {
  return { ...scheduler, inFlight: false };
}

/**
 * Has the conversation moved on from what this suggestion was built for?
 * Measured against the newest segment, not wall-clock: a quiet meeting does not
 * make good advice stale.
 */
export function isSuggestionStale(input: {
  suggestedAtSegmentTime: number | null;
  newestSegmentAt: number | null;
  staleMs?: number;
}): boolean {
  const { suggestedAtSegmentTime, newestSegmentAt } = input;
  if (suggestedAtSegmentTime == null || newestSegmentAt == null) return false;
  return newestSegmentAt - suggestedAtSegmentTime > (input.staleMs ?? SUGGESTION_STALE_MS);
}
