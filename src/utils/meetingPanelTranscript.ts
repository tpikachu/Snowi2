/**
 * The transcript tail that crosses into the meeting panel.
 *
 * A separate payload from `MeetingPanelSnapshot`, and on a separate channel,
 * for the same reason the microphone level is: the snapshot changes when the
 * *status* of a meeting changes — a handful of times an hour — while the
 * transcript changes several times a second once captions stream. Folding them
 * together would either publish the whole status object on every word or make
 * the status comparison meaningless.
 *
 * Bounded hard. The panel shows a few lines in a small area, so sending an
 * hour of meeting to it would be paying IPC and React for text nobody can see.
 *
 * Pure — the bridge supplies the state, this decides what is worth sending.
 */

export type PanelTranscriptSource = "mic" | "system";

export interface PanelTranscriptLine {
  /** Stable across publishes so React keeps the DOM row. */
  key: string;
  source: PanelTranscriptSource;
  text: string;
  /** True while this line is still being spoken. */
  live: boolean;
}

export interface PanelTranscript {
  lines: PanelTranscriptLine[];
  /** Settled lines that exist but were trimmed, so the panel can say so. */
  hiddenCount: number;
}

/**
 * How many lines reach the panel. The panel's transcript area is deliberately
 * small — the user is meant to be looking at the meeting, not at us — so this
 * only has to cover what fits plus a little scrollback.
 */
export const PANEL_TRANSCRIPT_LINES = 40;

interface TranscriptSource {
  segments: ReadonlyArray<{ text: string; source: string; timestamp?: number; id?: string }>;
  liveUtterances: ReadonlyArray<{ key: string; source: string; text: string }>;
}

const asSource = (source: string): PanelTranscriptSource => (source === "mic" ? "mic" : "system");

export function buildPanelTranscript(
  state: TranscriptSource,
  limit: number = PANEL_TRANSCRIPT_LINES
): PanelTranscript {
  const settled = state.segments.filter((segment) => segment.text?.trim());
  const live = state.liveUtterances.filter((utterance) => utterance.text?.trim());

  // The live captions always survive the trim — they are the reason to look at
  // this pane at all. Only settled lines are dropped to make room.
  const settledBudget = Math.max(0, limit - live.length);
  const keptSettled = settledBudget > 0 ? settled.slice(-settledBudget) : [];

  const lines: PanelTranscriptLine[] = [
    ...keptSettled.map((segment, index) => ({
      // Segment ids are absent until the note is written, so position within
      // the kept window plus the timestamp is what identifies a row.
      key: segment.id ?? `s:${segment.timestamp ?? ""}:${index}`,
      source: asSource(segment.source),
      text: segment.text.trim(),
      live: false,
    })),
    ...live.map((utterance) => ({
      key: `l:${utterance.key}`,
      source: asSource(utterance.source),
      text: utterance.text.trim(),
      live: true,
    })),
  ];

  return { lines, hiddenCount: Math.max(0, settled.length - keptSettled.length) };
}

/**
 * Whether a rebuilt transcript is worth another IPC hop.
 *
 * Compared by content rather than identity: the bridge rebuilds this on a
 * timer, so every publish would otherwise be "new" even when a meeting has
 * been silent for a minute.
 */
export function panelTranscriptsEqual(
  a: PanelTranscript | null,
  b: PanelTranscript | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.hiddenCount !== b.hiddenCount) return false;
  if (a.lines.length !== b.lines.length) return false;

  return a.lines.every((line, index) => {
    const other = b.lines[index];
    return (
      line.key === other.key &&
      line.text === other.text &&
      line.source === other.source &&
      line.live === other.live
    );
  });
}
