import type { MemoryObjectRow } from "../types/electron";

/**
 * Open commitments, arranged for the home page.
 *
 * Dates are compared as `YYYY-MM-DD` strings rather than parsed into `Date`.
 * `due_at` is whatever the extraction model wrote — sometimes a bare date,
 * sometimes a full timestamp — and `new Date("2026-08-20")` is UTC midnight,
 * which reads as *yesterday* anywhere west of Greenwich. Comparing the first
 * ten characters has neither problem and is what the prompt slice already
 * does (`memoryPrompt.dueLabel`).
 */

export type CommitmentBucket = "overdue" | "today" | "upcoming" | "undated";

/** Order the buckets are shown in: the ones with a deadline first. */
export const BUCKET_ORDER: readonly CommitmentBucket[] = [
  "overdue",
  "today",
  "upcoming",
  "undated",
] as const;

// Ranges, not just the shape: "2026-13-99" has the shape of a date and sorts
// after every real one, so a shape-only check turns a garbled due date into a
// commitment that is permanently "upcoming" and never comes due. Day 31 in a
// 30-day month is left alone — it sorts correctly and reads as the user's
// intent, unlike month 13.
const ISO_DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

const isoDate = (value: string | null | undefined): string | null => {
  const date = value?.trim().slice(0, 10);
  return date && ISO_DATE.test(date) ? date : null;
};

export function commitmentBucket(
  dueAt: string | null | undefined,
  today: string
): CommitmentBucket {
  const date = isoDate(dueAt);
  // A due date that is not a date at all is treated as no date, not as
  // overdue: guessing wrong in that direction invents an alarm.
  if (!date) return "undated";
  if (date < today) return "overdue";
  if (date === today) return "today";
  return "upcoming";
}

/**
 * Whole days between two ISO dates. Both are read as UTC midnight, so the
 * difference is exact whole days regardless of the viewer's timezone — the
 * one place constructing a Date from these strings is safe, because the bias
 * is identical on both sides and cancels.
 */
export function daysBetween(from: string, to: string): number {
  const parse = (value: string) => {
    const [y, m, d] = value.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

export interface CommitmentGroup {
  bucket: CommitmentBucket;
  items: MemoryObjectRow[];
}

export interface BucketedCommitments {
  groups: CommitmentGroup[];
  /** Every open commitment with readable content, before the limit. */
  total: number;
  /** Trimmed by the limit — reported rather than silently dropped. */
  hidden: number;
  overdueCount: number;
}

/** Dated first and soonest-first; undated fall back to most recently touched. */
function byUrgency(a: MemoryObjectRow, b: MemoryObjectRow): number {
  const aDue = isoDate(a.due_at);
  const bDue = isoDate(b.due_at);
  if (aDue && bDue) return aDue.localeCompare(bDue);
  if (aDue) return -1;
  if (bDue) return 1;
  return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
}

/**
 * @param rows   Open action items, commitments and deadlines, already hydrated.
 * @param today  ISO date deciding what reads as overdue. Passed in, not read
 *               from the clock, so this stays pure and testable.
 * @param limit  How many to show. The rest are counted, not discarded.
 */
export function bucketCommitments(
  rows: readonly MemoryObjectRow[],
  today: string,
  limit = 6
): BucketedCommitments {
  // A claim whose sealed content will not decrypt has nothing to render. It
  // stays reachable through the agent's search_memory, which reports it
  // honestly rather than showing an empty row here.
  const usable = rows.filter((row) => row.content?.trim());
  const sorted = [...usable].sort(byUrgency);
  const shown = sorted.slice(0, Math.max(0, limit));

  const groups = BUCKET_ORDER.map((bucket) => ({
    bucket,
    items: shown.filter((row) => commitmentBucket(row.due_at, today) === bucket),
  })).filter((group) => group.items.length > 0);

  return {
    groups,
    total: sorted.length,
    hidden: Math.max(0, sorted.length - shown.length),
    // Counted across everything, not just the page: "3 overdue" must not
    // change because the card only had room for two of them.
    overdueCount: sorted.filter((row) => commitmentBucket(row.due_at, today) === "overdue").length,
  };
}

/** Today as `YYYY-MM-DD` in the viewer's timezone, matching the comparisons above. */
export function localToday(now: Date = new Date()): string {
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
