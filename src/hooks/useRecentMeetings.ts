import { useCallback, useEffect, useState } from "react";
import type { NoteItem } from "../types/electron";
import { normalizeDbDate } from "../utils/dateFormatting";

/** How many meetings Home shows. Enough to recognise the week, not a library. */
export const RECENT_MEETINGS_LIMIT = 8;

function toMs(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = normalizeDbDate(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Meetings sort by when they happened, not when they were last edited. */
function meetingSortKey(note: NoteItem): number {
  return toMs(note.created_at) || toMs(note.updated_at);
}

function sortMeetings(items: NoteItem[]): NoteItem[] {
  return [...items].sort((a, b) => meetingSortKey(b) - meetingSortKey(a));
}

function isVisible(note: NoteItem): boolean {
  return !note.deleted_at && !note.folder_delete_pending && note.note_type === "meeting";
}

export interface RecentMeetingsState {
  meetings: NoteItem[];
  isLoading: boolean;
  hasError: boolean;
  reload: () => void;
}

/**
 * The meetings Home lists.
 *
 * Scoped to `note_type = "meeting"` at the query rather than filtered in the
 * renderer, so Home is genuinely a different question from the notes library
 * instead of the same list with rows hidden — which is what made the two
 * surfaces feel like duplicates.
 *
 * Kept current from the note broadcasts rather than refetching, so a meeting
 * being written to during a live recording does not re-run a query on every
 * debounced save.
 */
export function useRecentMeetings(enabled: boolean): RecentMeetingsState {
  const [meetings, setMeetings] = useState<NoteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    setIsLoading(true);
    Promise.resolve(window.electronAPI?.getNotes?.("meeting", RECENT_MEETINGS_LIMIT, null, null))
      .then((items) => {
        if (cancelled) return;
        setMeetings(sortMeetings((items ?? []).filter(isVisible)));
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
    const upsert = (note: NoteItem | null | undefined) => {
      if (!note) return;
      setMeetings((current) => {
        const without = current.filter((existing) => existing.id !== note.id);
        // A note that stopped being a meeting — or was deleted — leaves the
        // list, so an edit elsewhere cannot strand a row Home should not show.
        if (!isVisible(note)) return without;
        return sortMeetings([note, ...without]).slice(0, RECENT_MEETINGS_LIMIT);
      });
    };
    const disposers = [
      window.electronAPI?.onNoteAdded?.(upsert),
      window.electronAPI?.onNoteUpdated?.(upsert),
      // A delete can uncover a meeting that was pushed past the limit, and the
      // broadcast cannot say what that is — so this one case refetches.
      window.electronAPI?.onNoteDeleted?.(({ id }: { id: number }) => {
        setMeetings((current) => {
          if (!current.some((existing) => existing.id === id)) return current;
          reload();
          return current.filter((existing) => existing.id !== id);
        });
      }),
    ];
    return () => {
      disposers.forEach((dispose) => {
        if (typeof dispose === "function") dispose();
      });
    };
  }, [enabled, reload]);

  return { meetings, isLoading, hasError, reload };
}
