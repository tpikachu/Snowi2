/**
 * Groups a message's tool calls by tool name, in first-appearance order.
 *
 * The chat transcript renders one activity row per GROUP, not per call: an
 * agent that reads four notes used to stack four "get_note" rows, which read
 * as stutter rather than work. Grouping is by name across the whole message
 * (not merely consecutive runs) so an interleaved search→read→search→read
 * sequence still collapses to two rows.
 */

export interface ToolCallGroup<T> {
  name: string;
  calls: T[];
}

export function groupToolCalls<T extends { name: string }>(
  calls: readonly T[]
): Array<ToolCallGroup<T>> {
  const order: string[] = [];
  const byName = new Map<string, T[]>();
  for (const call of calls) {
    let bucket = byName.get(call.name);
    if (!bucket) {
      bucket = [];
      byName.set(call.name, bucket);
      order.push(call.name);
    }
    bucket.push(call);
  }
  return order.map((name) => ({ name, calls: byName.get(name)! }));
}
