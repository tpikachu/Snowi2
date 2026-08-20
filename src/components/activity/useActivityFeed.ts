import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { NoteItem, TranscriptionItem } from "../../types/electron";
import { formatDateGroup, normalizeDbDate } from "../../utils/dateFormatting";
import { DICTATION_ENABLED } from "../../config/features";

/** How many notes/meetings the feed pulls. Dictations come pre-loaded by the
 *  transcription store, which caps itself at its own limit. */
const ACTIVITY_NOTE_LIMIT = 100;

export type ActivityFilter = "all" | "dictation" | "meeting" | "note";

/** The facet chips the feed offers. Dictation drops out with its feature. */
export const ACTIVITY_FILTERS: ActivityFilter[] = (
  ["all", "dictation", "meeting", "note"] as ActivityFilter[]
).filter((id) => DICTATION_ENABLED || id !== "dictation");

export type ActivityEntry =
  | { key: string; kind: "dictation"; at: number; dictation: TranscriptionItem }
  | { key: string; kind: "meeting"; at: number; note: NoteItem }
  | { key: string; kind: "note"; at: number; note: NoteItem };

export interface ActivityGroup {
  id: string;
  label: string;
  entries: ActivityEntry[];
}

export interface ActivityFeedState {
  groups: ActivityGroup[];
  counts: Record<ActivityFilter, number>;
  filter: ActivityFilter;
  setFilter: (filter: ActivityFilter) => void;
  /** Entries across every type, before the type filter is applied. */
  totalCount: number;
  visibleCount: number;
  isLoadingNotes: boolean;
  notesError: boolean;
  reloadNotes: () => void;
}

function toMs(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = normalizeDbDate(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** `updated_at` is what makes a note *activity*: an edited note resurfaces. */
function noteSortKey(note: NoteItem): number {
  return toMs(note.updated_at) || toMs(note.created_at);
}

function sortNotes(items: NoteItem[]): NoteItem[] {
  return [...items].sort((a, b) => noteSortKey(b) - noteSortKey(a));
}

function isVisibleNote(note: NoteItem): boolean {
  return !note.deleted_at && !note.folder_delete_pending;
}

/**
 * Notes and meetings for the feed, read through the existing
 * `getNotes(type, limit, folderId, spaceId)` bridge with every scope left
 * open — the same query the notes tree uses, unscoped. Kept fresh from the
 * note broadcasts rather than refetching, so editing a note doesn't re-run a
 * full query on every debounced save.
 */
function useActivityNotes(enabled: boolean) {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setIsLoading(true);
    Promise.resolve(window.electronAPI?.getNotes?.(null, ACTIVITY_NOTE_LIMIT, null, null))
      .then((items) => {
        if (cancelled) return;
        setNotes(sortNotes((items ?? []).filter(isVisibleNote)));
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
    if (!enabled) return;
    const upsert = (note: NoteItem | null | undefined) => {
      if (!note) return;
      setNotes((current) => {
        const without = current.filter((existing) => existing.id !== note.id);
        if (!isVisibleNote(note)) return without;
        return sortNotes([note, ...without]).slice(0, ACTIVITY_NOTE_LIMIT);
      });
    };
    const disposers = [
      window.electronAPI?.onNoteAdded?.(upsert),
      window.electronAPI?.onNoteUpdated?.(upsert),
      window.electronAPI?.onNoteDeleted?.(({ id }: { id: number }) =>
        setNotes((current) => current.filter((existing) => existing.id !== id))
      ),
    ];
    return () => {
      disposers.forEach((dispose) => {
        if (typeof dispose === "function") dispose();
      });
    };
  }, [enabled]);

  return { notes, isLoading, hasError, reload };
}

/**
 * The unified activity stream: dictations from the transcription store merged
 * with notes and meetings from the notes table, newest first, bucketed by day.
 */
export function useActivityFeed(
  enabled: boolean,
  transcriptions: TranscriptionItem[]
): ActivityFeedState {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const { notes, isLoading, hasError, reload } = useActivityNotes(enabled);

  const entries = useMemo<ActivityEntry[]>(() => {
    const merged: ActivityEntry[] = [
      // Dropped at the source rather than filtered downstream: with dictation
      // hidden, the rows are unreachable but their counts would still be
      // tallied, so "all" would report more entries than the feed shows.
      ...(DICTATION_ENABLED
        ? transcriptions.map((dictation): ActivityEntry => ({
            key: `d${dictation.id}`,
            kind: "dictation",
            at: toMs(dictation.timestamp) || toMs(dictation.created_at),
            dictation,
          }))
        : []),
      ...notes.map((note): ActivityEntry =>
        note.note_type === "meeting"
          ? { key: `n${note.id}`, kind: "meeting", at: noteSortKey(note), note }
          : { key: `n${note.id}`, kind: "note", at: noteSortKey(note), note }
      ),
    ];
    return merged.sort((a, b) => b.at - a.at);
  }, [transcriptions, notes]);

  const counts = useMemo<Record<ActivityFilter, number>>(() => {
    const tally: Record<ActivityFilter, number> = { all: 0, dictation: 0, meeting: 0, note: 0 };
    for (const entry of entries) {
      tally.all += 1;
      tally[entry.kind] += 1;
    }
    return tally;
  }, [entries]);

  const visible = useMemo(
    () => (filter === "all" ? entries : entries.filter((entry) => entry.kind === filter)),
    [entries, filter]
  );

  const groups = useMemo<ActivityGroup[]>(() => {
    const buckets: ActivityGroup[] = [];
    let currentLabel: string | null = null;
    for (const entry of visible) {
      const label = formatDateGroup(new Date(entry.at), t);
      if (label !== currentLabel) {
        buckets.push({ id: `activity-day-${buckets.length}`, label, entries: [entry] });
        currentLabel = label;
      } else {
        buckets[buckets.length - 1].entries.push(entry);
      }
    }
    return buckets;
  }, [visible, t]);

  return {
    groups,
    counts,
    filter,
    setFilter,
    totalCount: entries.length,
    visibleCount: visible.length,
    isLoadingNotes: isLoading,
    notesError: hasError,
    reloadNotes: reload,
  };
}
