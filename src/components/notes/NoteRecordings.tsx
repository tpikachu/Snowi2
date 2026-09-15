import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, FolderOpen, Loader2, Pause, Play } from "lucide-react";
import { cn } from "../lib/utils";
import { formatDateTime } from "../../utils/dateFormatting";
import { formatMmSs } from "../../utils/formatDuration";
import { settleRecordingPending } from "../../stores/meetingRecordingStore";
import type { NoteRecordingItem } from "../../types/electron";
import logger from "../../utils/logger";

/**
 * The recordings kept with a meeting note — one row per recorded session,
 * under the note header (client direction, 2026-09-15). Each row plays in
 * place, scrubs, and offers Download (a save dialog) and Show in folder.
 *
 * Playback goes through one audio element fed from main over IPC as a Blob
 * URL — the pattern get-audio-buffer already uses. A meeting's MP3 is tens
 * of megabytes at most, so no streaming scheme is needed for it.
 *
 * `pending` is the session just stopped: main is still encoding it, and the
 * row appears when note-recording-added arrives.
 */
interface NoteRecordingsProps {
  noteId: number;
  pending?: boolean;
}

const iconButtonClass =
  "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export default function NoteRecordings({ noteId, pending = false }: NoteRecordingsProps) {
  const { t } = useTranslation();
  const [recordings, setRecordings] = useState<NoteRecordingItem[]>([]);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const loadedIdRef = useRef<number | null>(null);

  const reload = useCallback(async () => {
    try {
      const rows = await window.electronAPI?.noteRecordingsList?.(noteId);
      setRecordings(Array.isArray(rows) ? rows : []);
    } catch (err) {
      logger.warn(
        "Could not list the note's recordings",
        { noteId, error: (err as Error).message },
        "notes"
      );
    }
  }, [noteId]);

  useEffect(() => {
    void reload();
    const offAdded = window.electronAPI?.onNoteRecordingAdded?.((data) => {
      if (data?.noteId !== noteId) return;
      settleRecordingPending(noteId);
      void reload();
    });
    const offDeleted = window.electronAPI?.onNoteRecordingDeleted?.((data) => {
      if (data?.noteId === noteId) void reload();
    });
    return () => {
      offAdded?.();
      offDeleted?.();
    };
  }, [noteId, reload]);

  // One element for the strip; unmounting frees the blob.
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    const onTime = () => setPosition(audio.currentTime);
    const onMeta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onEnded = () => setPlayingId(null);
    const onPause = () => setPlayingId((current) => (audio.ended ? null : current));
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onMeta);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("durationchange", onMeta);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      audioRef.current = null;
    };
  }, []);

  const load = useCallback(
    async (recording: NoteRecordingItem) => {
      const audio = audioRef.current;
      if (!audio) return false;
      if (loadedIdRef.current === recording.id) return true;
      setLoadingId(recording.id);
      try {
        const buffer = await window.electronAPI?.noteRecordingBuffer?.(recording.id);
        if (!buffer) throw new Error("no audio");
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        const url = URL.createObjectURL(new Blob([buffer], { type: "audio/mpeg" }));
        objectUrlRef.current = url;
        audio.src = url;
        loadedIdRef.current = recording.id;
        setPosition(0);
        setDuration(recording.durationMs ? recording.durationMs / 1000 : 0);
        return true;
      } catch (err) {
        logger.warn(
          "Could not open the recording",
          { id: recording.id, error: (err as Error).message },
          "notes"
        );
        setError(t("notes.recordings.loadFailed"));
        return false;
      } finally {
        setLoadingId(null);
      }
    },
    [t]
  );

  const toggle = useCallback(
    async (recording: NoteRecordingItem) => {
      const audio = audioRef.current;
      if (!audio) return;
      setError(null);
      if (playingId === recording.id) {
        audio.pause();
        setPlayingId(null);
        return;
      }
      if (!(await load(recording))) return;
      try {
        await audio.play();
        setPlayingId(recording.id);
      } catch (err) {
        logger.warn(
          "Playback did not start",
          { id: recording.id, error: (err as Error).message },
          "notes"
        );
        setError(t("notes.recordings.loadFailed"));
      }
    },
    [load, playingId, t]
  );

  const seek = useCallback((recording: NoteRecordingItem, seconds: number) => {
    const audio = audioRef.current;
    if (!audio || loadedIdRef.current !== recording.id) return;
    audio.currentTime = seconds;
    setPosition(seconds);
  }, []);

  const download = useCallback(
    async (recording: NoteRecordingItem) => {
      setError(null);
      try {
        const result = await window.electronAPI?.noteRecordingSaveAs?.(recording.id);
        if (result && !result.success && !result.canceled)
          setError(t("notes.recordings.saveFailed"));
      } catch (err) {
        logger.warn(
          "Could not save the recording",
          { id: recording.id, error: (err as Error).message },
          "notes"
        );
        setError(t("notes.recordings.saveFailed"));
      }
    },
    [t]
  );

  if (recordings.length === 0 && !pending) return null;

  return (
    <div data-testid="note-recordings" className="px-5 pb-1 pt-2">
      <div className="text-[11px] font-medium text-muted-foreground">
        {t("notes.recordings.title")}
      </div>
      <ul className="mt-1 flex flex-col gap-1">
        {recordings.map((recording) => {
          const isCurrent = loadedIdRef.current === recording.id;
          const isPlaying = playingId === recording.id;
          const total = isCurrent && duration > 0 ? duration : (recording.durationMs ?? 0) / 1000;
          const at = isCurrent ? position : 0;
          return (
            <li
              key={recording.id}
              className="flex min-h-9 items-center gap-2 rounded-lg border border-border-subtle bg-surface-1 px-2 text-[12px]"
            >
              <button
                type="button"
                onClick={() => void toggle(recording)}
                disabled={loadingId === recording.id}
                aria-label={isPlaying ? t("notes.recordings.pause") : t("notes.recordings.play")}
                className={cn(iconButtonClass, "text-primary hover:text-primary")}
              >
                {loadingId === recording.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : isPlaying ? (
                  <Pause size={14} />
                ) : (
                  <Play size={14} />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(1, Math.round(total))}
                step={1}
                value={Math.min(Math.round(at), Math.max(1, Math.round(total)))}
                onChange={(event) => seek(recording, Number(event.target.value))}
                disabled={!isCurrent}
                aria-label={t("notes.recordings.seek")}
                className="h-1 min-w-0 flex-1 accent-primary disabled:opacity-40"
              />
              <span data-numeric className="shrink-0 tabular-nums text-muted-foreground">
                {formatMmSs(Math.floor(at))} / {formatMmSs(Math.floor(total))}
              </span>
              <span className="hidden shrink-0 text-muted-foreground sm:inline">
                {formatDateTime(new Date(recording.startedAt))}
              </span>
              <button
                type="button"
                onClick={() => void download(recording)}
                aria-label={t("notes.recordings.download")}
                title={t("notes.recordings.download")}
                className={iconButtonClass}
              >
                <Download size={14} />
              </button>
              <button
                type="button"
                onClick={() => void window.electronAPI?.noteRecordingShowInFolder?.(recording.id)}
                aria-label={t("notes.recordings.showInFolder")}
                title={t("notes.recordings.showInFolder")}
                className={iconButtonClass}
              >
                <FolderOpen size={14} />
              </button>
            </li>
          );
        })}
        {pending && (
          <li
            role="status"
            className="flex min-h-9 items-center gap-2 rounded-lg border border-dashed border-border-subtle px-2 text-[12px] text-muted-foreground"
          >
            <Loader2 size={14} className="shrink-0 animate-spin" />
            {t("notes.recordings.preparing")}
          </li>
        )}
      </ul>
      {error && <div className="mt-1 text-[11px] text-destructive">{error}</div>}
    </div>
  );
}
