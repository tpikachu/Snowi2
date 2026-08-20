import { useCallback, useEffect, useState } from "react";
import type { MemoryObjectRow } from "../types/electron";

/**
 * Read past the number the card shows, so "4 more" is a real count and the
 * overdue badge does not change when the card runs out of room.
 */
export const OPEN_COMMITMENTS_LIMIT = 50;

export interface OpenCommitmentsState {
  commitments: MemoryObjectRow[];
  isLoading: boolean;
  hasError: boolean;
  reload: () => void;
  /** Closes one locally and persists it; restores the row if the write fails. */
  setStatus: (id: string, status: "done" | "dismissed") => Promise<void>;
}

/**
 * The user's open commitments.
 *
 * Refetched on note changes rather than kept in sync from the broadcast: a
 * memory object is produced by a write-up finishing, and there is no
 * per-object event to listen to. Write-ups are rare enough that a query on
 * each is cheaper than an events channel that does not exist yet.
 */
export function useOpenCommitments(enabled: boolean): OpenCommitmentsState {
  const [commitments, setCommitments] = useState<MemoryObjectRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    setIsLoading(true);
    Promise.resolve(window.electronAPI?.listOpenMemoryActions?.("user", OPEN_COMMITMENTS_LIMIT))
      .then((rows) => {
        if (cancelled) return;
        setCommitments(rows ?? []);
        setHasError(false);
      })
      .catch(() => {
        if (!cancelled) setHasError(true);
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
    // A finished write-up updates the note and ingests its memory in the same
    // pass, so a note update is the closest signal to "new commitments".
    const disposers = [
      window.electronAPI?.onNoteUpdated?.(() => reload()),
      window.electronAPI?.onNoteDeleted?.(() => reload()),
    ];
    return () => {
      disposers.forEach((dispose) => {
        if (typeof dispose === "function") dispose();
      });
    };
  }, [enabled, reload]);

  const setStatus = useCallback(async (id: string, status: "done" | "dismissed") => {
    // Removed first: ticking something off should not wait on a disk write.
    let removed: MemoryObjectRow | undefined;
    setCommitments((current) => {
      removed = current.find((row) => row.id === id);
      return current.filter((row) => row.id !== id);
    });

    try {
      const result = await window.electronAPI?.setMemoryStatus?.(id, status);
      if (result && result.success === false) throw new Error(result.error);
    } catch {
      // Put it back rather than leaving the card claiming something is done
      // that the database still has open.
      if (removed) setCommitments((current) => [removed!, ...current]);
    }
  }, []);

  return { commitments, isLoading, hasError, reload, setStatus };
}
