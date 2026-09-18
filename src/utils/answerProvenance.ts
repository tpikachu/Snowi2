/**
 * The one muted line under a live answer: what it read beyond the meeting.
 *
 * Every answer reads the live transcript, so that is never named — "From
 * this meeting" carried no information, and the rc7 card printed it under
 * every answer anyway. What earns a mention is the extra: the screen(s) the
 * observe eye captured for this ask, the past notes it drew on, and — for a
 * thinking answer, which always searches — that the notes were checked even
 * when nothing matched — and, first of all, that the web was searched when
 * the cue card's search ran. Parts join with a middle dot; note titles with
 * commas, capped, with a "+n" for the rest.
 *
 * Pure; the labels arrive localized, so this stays free of i18n.
 */
export interface AnswerProvenanceInput {
  /** The provider's web search ran for this answer. */
  searched?: boolean;
  /** Screenshots that rode with the ask and reached the model. */
  screens: number;
  sources: readonly { title: string }[];
  mode: "fast" | "thinking";
}

export interface AnswerProvenanceLabels {
  /** "Searched the web" */
  searchedWeb: string;
  /** "Viewed your screen" for one, "Viewed 2 screens" for more. */
  viewedScreens: (count: number) => string;
  /** "From" — precedes the note titles. */
  from: string;
  /** "Checked your notes" */
  checkedNotes: string;
}

export const MAX_VISIBLE_SOURCES = 3;

/** Which past notes an answer drew on, truncated. */
export function sourceNames(
  sources: readonly { title: string }[],
  maxVisible = MAX_VISIBLE_SOURCES
): string {
  const shown = sources.slice(0, maxVisible);
  const extra = sources.length - shown.length;
  return shown.map((source) => source.title).join(", ") + (extra > 0 ? ` +${extra}` : "");
}

export function describeAnswerSources(
  input: AnswerProvenanceInput,
  labels: AnswerProvenanceLabels,
  maxVisible = MAX_VISIBLE_SOURCES
): string {
  const parts: string[] = [];
  if (input.searched) parts.push(labels.searchedWeb);
  if (input.screens > 0) parts.push(labels.viewedScreens(input.screens));
  if (input.sources.length > 0) {
    parts.push(`${labels.from} ${sourceNames(input.sources, maxVisible)}`);
  } else if (input.mode === "thinking") {
    parts.push(labels.checkedNotes);
  }
  return parts.join(" · ");
}
