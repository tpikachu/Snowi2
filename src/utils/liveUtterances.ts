/**
 * The in-flight utterances a meeting is currently hearing.
 *
 * This replaces two plain strings — `micPartial` and `systemPartial` — that
 * were each replaced wholesale by whichever partial arrived last. That had two
 * failures the strings could not express:
 *
 *   - **No identity.** Every partial for a source overwrote the previous one,
 *     so two people talking at once on the system channel collapsed into a
 *     single caption line.
 *   - **No ordering.** Providers do not guarantee that a partial arrives after
 *     the one it supersedes. A late partial for an utterance that already
 *     finished would overwrite newer text, which reads as the transcript
 *     losing words at random.
 *
 * Keying by utterance and carrying a sequence number fixes both. Providers that
 * send neither still work: the key falls back to the source, which reproduces
 * the old one-slot-per-source behaviour exactly.
 *
 * One thing to be honest about: today's providers run a single stream per
 * source and emit utterances sequentially, so concurrent utterances on one
 * source are rare in practice. The ordering guard is what pays off now; the
 * per-utterance keying is what makes a genuinely concurrent provider possible
 * later. That asymmetry is why *retiring* is by source rather than by utterance
 * whenever the event carries no id — finals and withdrawals never do.
 *
 * Pure on purpose — the store holds the array, this decides what it becomes.
 */

export type TranscriptSource = "mic" | "system";

export interface LiveUtterance {
  /** Stable for the life of one utterance. Partials sharing it replace each other. */
  key: string;
  source: TranscriptSource;
  text: string;
  /**
   * Provider sequence, monotonic within a session. Absent when the provider
   * does not supply one, in which case arrival order is all we have.
   */
  seq?: number;
  speakerId: string | null;
  speakerName: string | null;
  confidence?: number;
  startMs?: number;
  updatedAt: number;
}

export interface PartialEvent {
  text: string;
  source: TranscriptSource;
  utteranceId?: string;
  seq?: number;
  speakerId?: string | null;
  speakerName?: string | null;
  confidence?: number;
  startMs?: number;
  at?: number;
}

/**
 * A provider that names its utterances gets one line per utterance; one that
 * does not gets a single line per source, which is what the two strings did.
 */
export function utteranceKey(event: { source: TranscriptSource; utteranceId?: string }): string {
  return event.utteranceId ? `${event.source}:${event.utteranceId}` : event.source;
}

/**
 * Filter that keeps the original array when it removes nothing.
 *
 * Identity is the store's re-render signal, and removals here are usually
 * no-ops: main emits a withdrawal for *every* mic interim while echo bleed is
 * suspected, and a final arrives for a source whose caption is already gone. A
 * plain `.filter()` returns a fresh array each time and would repaint the whole
 * transcript pane several times a second for no visible change.
 */
function removeWhere(
  current: readonly LiveUtterance[],
  shouldRemove: (utterance: LiveUtterance) => boolean
): LiveUtterance[] {
  const kept = current.filter((utterance) => !shouldRemove(utterance));
  return kept.length === current.length ? (current as LiveUtterance[]) : kept;
}

/**
 * Apply a partial. Empty text removes the utterance — main sends `text: ""` to
 * withdraw a partial it has decided to suppress (echo bleed, duplicate mic
 * segment), and an empty bubble is not a thing to render.
 */
export function applyPartial(
  current: readonly LiveUtterance[],
  event: PartialEvent
): LiveUtterance[] {
  const key = utteranceKey(event);
  const at = event.at ?? Date.now();

  if (!event.text) {
    // A withdrawal that names no utterance has to clear the whole source.
    // Main sends these from the *final* path — echo bleed, duplicate mic
    // segment — where no utterance id is in hand, so keying on the bare source
    // would match nothing and leave the caption on screen forever.
    return event.utteranceId
      ? removeWhere(current, (utterance) => utterance.key === key)
      : removeWhere(current, (utterance) => utterance.source === event.source);
  }

  const existing = current.find((utterance) => utterance.key === key);

  // Out-of-order guard. Equal sequence numbers are allowed through: a provider
  // that repeats a sequence is revising that same result, and the newer text
  // is the better one.
  if (
    existing &&
    existing.seq !== undefined &&
    event.seq !== undefined &&
    event.seq < existing.seq
  ) {
    return current as LiveUtterance[];
  }

  const next: LiveUtterance = {
    key,
    source: event.source,
    text: event.text,
    seq: event.seq ?? existing?.seq,
    // Speaker identity can arrive after the first partial of an utterance, so
    // an absent value must not erase one already established.
    speakerId: event.speakerId !== undefined ? event.speakerId : (existing?.speakerId ?? null),
    speakerName:
      event.speakerName !== undefined ? event.speakerName : (existing?.speakerName ?? null),
    confidence: event.confidence ?? existing?.confidence,
    startMs: event.startMs ?? existing?.startMs,
    updatedAt: at,
  };

  if (!existing) return [...current, next];
  return current.map((utterance) => (utterance.key === key ? next : utterance));
}

/**
 * Retire in-flight captions once final text has landed as a segment.
 *
 * Finals carry no utterance id today — the provider callbacks hand back
 * accumulated text and a timestamp, nothing more — so this clears everything
 * still in flight on that source, which is what clearing `micPartial` on a mic
 * final used to do. Leaving the id path in place means a provider that starts
 * naming its finals retires exactly the one that ended, without another change
 * here.
 */
export function settleUtterance(
  current: readonly LiveUtterance[],
  event: { source: TranscriptSource; utteranceId?: string }
): LiveUtterance[] {
  if (!event.utteranceId) {
    return removeWhere(current, (utterance) => utterance.source === event.source);
  }
  const key = utteranceKey(event);
  return removeWhere(current, (utterance) => utterance.key === key);
}

/**
 * Drop utterances that stopped updating. A provider that dies mid-utterance,
 * or a final that never arrives, would otherwise leave a caption on screen for
 * the rest of the meeting.
 */
export function pruneStaleUtterances(
  current: readonly LiveUtterance[],
  now: number,
  maxAgeMs: number
): LiveUtterance[] {
  return removeWhere(current, (utterance) => now - utterance.updatedAt > maxAgeMs);
}

/**
 * Relabel the system utterance currently being spoken.
 *
 * Identification usually lands after an utterance's first partial, so the
 * caption already on screen has to be corrected rather than wait for the next
 * one. Only the most recently updated system utterance is touched: stamping
 * every system caption would hand one speaker's name to another's line the
 * moment two are in flight, which is precisely what the per-utterance keying
 * exists to prevent.
 */
export function applySpeakerToLiveUtterances(
  current: readonly LiveUtterance[],
  speakerId: string | null,
  speakerName: string | null
): LiveUtterance[] {
  let targetIndex = -1;
  for (let i = 0; i < current.length; i += 1) {
    if (current[i].source !== "system") continue;
    if (targetIndex === -1 || current[i].updatedAt >= current[targetIndex].updatedAt) {
      targetIndex = i;
    }
  }
  if (targetIndex === -1) return current as LiveUtterance[];

  const target = current[targetIndex];
  if (target.speakerId === speakerId && target.speakerName === speakerName) {
    return current as LiveUtterance[];
  }
  const next = current.slice();
  next[targetIndex] = { ...target, speakerId, speakerName };
  return next;
}
