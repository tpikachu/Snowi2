import type { MemoryObjectRow } from "../types/electron";

/**
 * Renders open commitments for the always-on prompt slice (spec §19, §20).
 *
 * These are pinned rather than left to search_memory because the model has no
 * reason to go looking. Asked "anything I should know before this call?", an
 * agent that must decide to query for commitments simply does not, so on-demand
 * access means they surface almost never. The profile slice is pinned for the
 * same reason and this is the other half of it.
 *
 * Kept small and capped because every single message pays for it.
 */

/** Beyond this the slice stops being background and starts being the prompt. */
export const MAX_PINNED_COMMITMENTS = 12;

/** Sorted so the ones with a date lead, soonest first, undated last. */
function byUrgency(a: MemoryObjectRow, b: MemoryObjectRow): number {
  if (a.due_at && b.due_at) return a.due_at.localeCompare(b.due_at);
  if (a.due_at) return -1;
  if (b.due_at) return 1;
  return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
}

function dueLabel(dueAt: string | null, today: string): string {
  if (!dueAt) return "";
  const date = dueAt.slice(0, 10);
  if (date < today) return ` — due ${date}, OVERDUE`;
  if (date === today) return ` — due today`;
  return ` — due ${date}`;
}

/**
 * @param rows   Open action items, commitments and deadlines, already hydrated.
 * @param today  ISO date (YYYY-MM-DD) used to decide what reads as overdue.
 *               Passed in rather than read from the clock so this stays pure.
 */
export function formatOpenCommitments(
  rows: readonly MemoryObjectRow[],
  today: string,
  limit: number = MAX_PINNED_COMMITMENTS
): string {
  // A claim whose sealed content cannot be read has nothing to say here. It is
  // still reachable through search_memory, which reports it honestly.
  const usable = rows.filter((row) => row.content?.trim());
  if (usable.length === 0) return "";

  const sorted = [...usable].sort(byUrgency);
  const shown = sorted.slice(0, Math.max(1, limit));

  const lines = shown.map((row) => {
    const owner = row.owner?.trim() && row.subject !== "user" ? `${row.owner.trim()}: ` : "";
    return `- ${owner}${row.content!.trim()}${dueLabel(row.due_at, today)}`;
  });

  if (sorted.length > shown.length) {
    lines.push(
      `- (${sorted.length - shown.length} more open — call search_memory to see the rest)`
    );
  }

  return lines.join("\n");
}
