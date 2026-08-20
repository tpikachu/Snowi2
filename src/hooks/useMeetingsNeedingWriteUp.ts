import { useCallback, useEffect, useState } from "react";
import type { MeetingNeedingWriteUp } from "../types/electron";

/** A backlog, not a library: enough to act on, with the rest counted. */
export const WRITE_UP_BACKLOG_LIMIT = 5;

export interface WriteUpBacklogState {
  meetings: MeetingNeedingWriteUp[];
  total: number;
  isLoading: boolean;
  reload: () => void;
}

/**
 * Meetings that have a transcript but no write-up.
 *
 * Refetched on every note update, because that is exactly the event that
 * empties this list — a write-up landing sets `enhanced_content`, and the
 * card should clear the row as it happens rather than at the next launch.
 */
export function useMeetingsNeedingWriteUp(enabled: boolean): WriteUpBacklogState {
  const [meetings, setMeetings] = useState<MeetingNeedingWriteUp[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    setIsLoading(true);
    Promise.resolve(window.electronAPI?.getMeetingsNeedingWriteUp?.(WRITE_UP_BACKLOG_LIMIT))
      .then((result) => {
        if (cancelled) return;
        setMeetings(result?.meetings ?? []);
        setTotal(result?.total ?? 0);
      })
      .catch(() => {
        if (cancelled) return;
        // Silent: this card is a nicety, and an error banner for a backlog
        // count would be louder than the thing it is reporting.
        setMeetings([]);
        setTotal(0);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, reloadToken]);

  useEffect(() => {
    if (!enabled) return undefined;
    const disposers = [
      window.electronAPI?.onNoteUpdated?.(() => reload()),
      window.electronAPI?.onNoteAdded?.(() => reload()),
      window.electronAPI?.onNoteDeleted?.(() => reload()),
    ];
    return () => {
      disposers.forEach((dispose) => {
        if (typeof dispose === "function") dispose();
      });
    };
  }, [enabled, reload]);

  return { meetings, total, isLoading, reload };
}
