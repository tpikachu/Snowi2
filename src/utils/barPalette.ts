/**
 * The bar's command palette: what clicking the ask field reveals.
 *
 * Pure on purpose — the rows arrive already translated and already built (the
 * overlay owns what exists; this module owns how typing narrows it), so the
 * filter can be unit-tested without React or i18n.
 */

export type BarPaletteGroup = "actions" | "settings";

export interface BarPaletteRow {
  id: string;
  group: BarPaletteGroup;
  /** Already-translated label; filtering matches against it. */
  label: string;
}

/** Groups render in this order, matching the reference product's palette. */
export const BAR_PALETTE_GROUP_ORDER: readonly BarPaletteGroup[] = ["actions", "settings"];

/**
 * Case-insensitive substring match over the label. An empty or whitespace
 * query keeps every row — the palette's resting state is the full map, and
 * typing is how it narrows.
 */
export function filterBarPalette<T extends { label: string }>(
  rows: readonly T[],
  query: string
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter((row) => row.label.toLowerCase().includes(q));
}

/**
 * The filtered rows in render order, grouped under their headings. Groups
 * that filtered to nothing disappear — a heading over an empty list promises
 * rows that are not there.
 */
export function groupBarPalette<T extends { group: BarPaletteGroup }>(
  rows: readonly T[]
): Array<{ group: BarPaletteGroup; rows: T[] }> {
  return BAR_PALETTE_GROUP_ORDER.map((group) => ({
    group,
    rows: rows.filter((row) => row.group === group),
  })).filter((entry) => entry.rows.length > 0);
}
