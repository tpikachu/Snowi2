/**
 * Waiters for the post-Stop pass — the archive re-transcription and, when it
 * is on, speaker identification — keyed by the session id main hands back
 * from meeting-transcription-stop.
 *
 * Keep waits for the pass before writing the notes: a summary built from the
 * live captions, followed a minute later by a transcript that says something
 * better, is the worst of both. The wait is bounded — a pass that outlasts
 * the timeout resolves null and the notes are written from the live lines,
 * which the refined transcript later marks stale — and every waiter settles
 * exactly once, so a completion that arrives after its timeout is dropped
 * rather than resolved into a promise nobody holds.
 */
export interface PassWaiters<T> {
  /** Resolves with the pass result, or null once `timeoutMs` has elapsed. */
  wait(sessionId: string, timeoutMs: number): Promise<T | null>;
  /** Settle every waiter on `sessionId`; returns how many there were. */
  settle(sessionId: string, value: T | null): number;
  readonly pending: number;
}

export function createPassWaiters<T>(): PassWaiters<T> {
  const waiters = new Map<string, Array<(value: T | null) => void>>();

  const remove = (sessionId: string, finish: (value: T | null) => void) => {
    const list = waiters.get(sessionId);
    if (!list) return;
    const index = list.indexOf(finish);
    if (index >= 0) list.splice(index, 1);
    if (list.length === 0) waiters.delete(sessionId);
  };

  return {
    wait(sessionId, timeoutMs) {
      return new Promise<T | null>((resolve) => {
        let settled = false;
        const finish = (value: T | null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          remove(sessionId, finish);
          resolve(value);
        };
        const timer = setTimeout(() => finish(null), timeoutMs);
        const list = waiters.get(sessionId) ?? [];
        list.push(finish);
        waiters.set(sessionId, list);
      });
    },
    settle(sessionId, value) {
      const list = waiters.get(sessionId);
      if (!list) return 0;
      const count = list.length;
      for (const finish of [...list]) finish(value);
      waiters.delete(sessionId);
      return count;
    },
    get pending() {
      return waiters.size;
    },
  };
}
