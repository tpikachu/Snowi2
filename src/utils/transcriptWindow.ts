/**
 * Which slice of a meeting transcript to render.
 *
 * A ninety-minute meeting runs to thousands of segments, and each one is a DOM
 * node carrying a hover-reveal speaker label and an absolutely positioned
 * selection checkbox. Rendering only the tail keeps that bounded.
 *
 * Deliberately a window rather than `@tanstack/react-virtual`, which this
 * codebase uses for other long lists: the same-speaker label reveal animates
 * `grid-rows-[0fr]` to `[1fr]` on hover, so a row's height changes when the
 * pointer enters it. A dynamic-measure virtualizer would re-measure and shift
 * every row below on every hover. Uniform-height lists get the virtualizer;
 * this one does not qualify.
 */

export interface TranscriptWindow<T> {
  /** Index into the full list of the first rendered item. */
  firstVisibleIndex: number;
  visible: T[];
  hiddenCount: number;
}

export function windowTranscript<T>(
  items: readonly T[],
  visibleCount: number
): TranscriptWindow<T> {
  const limit = Math.max(1, Math.floor(visibleCount));
  const firstVisibleIndex = Math.max(0, items.length - limit);
  return {
    firstVisibleIndex,
    // Identity is preserved when nothing is hidden, so a short meeting — the
    // common case — never pays for a copy on every render.
    visible: firstVisibleIndex > 0 ? items.slice(firstVisibleIndex) : (items as T[]),
    hiddenCount: firstVisibleIndex,
  };
}
