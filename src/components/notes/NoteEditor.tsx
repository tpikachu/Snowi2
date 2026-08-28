import { useState, useRef, useEffect, useMemo, useCallback, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import {
  ClipboardCopy,
  Download,
  Loader2,
  FileText,
  Mail,
  Sparkles,
  AlignLeft,
  MessageSquareText,
  Calendar,
  LayoutTemplate,
  LinkIcon,
  FolderOpen,
  Search,
  Plus,
  Check,
  Users,
} from "lucide-react";
import { MEETING_TEMPLATES, meetingTemplateById } from "../../config/meetingTemplates";
import { buildMeetingRecap } from "../../utils/meetingRecap";
import FollowUpEmailDialog from "./FollowUpEmailDialog";
import { useToast } from "../ui/useToast";
import { useSpaces, navigateToContainer } from "../../stores/noteStore";
import { RichTextEditor } from "../ui/RichTextEditor";
import type { Editor } from "@tiptap/react";
import { MeetingTranscriptChat, SelectionBar } from "./MeetingTranscriptChat";
import {
  useMeetingRecordingStore,
  type TranscriptSegment,
} from "../../stores/meetingRecordingStore";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";
import { cn } from "../lib/utils";
import type { NoteItem, FolderItem } from "../../types/electron";
import type { ActionProcessingState } from "../../hooks/useActionProcessing";
import ActionProcessingOverlay from "./ActionProcessingOverlay";
import NoteBottomBar from "./NoteBottomBar";
import EmbeddedChat, { type EmbeddedChatMode } from "./EmbeddedChat";
import { useEmbeddedChat } from "../../hooks/useEmbeddedChat";
import { normalizeDbDate, formatShortDate } from "../../utils/dateFormatting";
import { parseTranscriptSegments } from "../../utils/parseTranscriptSegments";
import {
  applyTranscriptSpeakerPatch,
  lockTranscriptSpeaker,
  serializeTranscriptSegments,
} from "../../utils/transcriptSpeakerState";
import NoteParticipants from "./NoteParticipants";
import type { CalendarAttendee } from "../../types/calendar";

// Metadata chips read as quiet, factual labels: one hairline, one muted type
// colour, and a surface step only on hover. Same geometry in both themes.
const CHIP_BUTTON_CLASS =
  "inline-flex items-center gap-1.5 text-[11px] h-5 px-1.5 rounded-md border border-border-subtle bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted hover:border-border transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

// Inactive/active states for one segment of the view-mode switcher.
const SEGMENT_BUTTON_CLASS =
  "relative z-1 flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring";

function formatNoteDate(dateStr: string): string {
  const date = normalizeDbDate(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  const datePart = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${datePart} \u00b7 ${timePart}`;
}

export interface Enhancement {
  content: string;
  isStale: boolean;
  onChange: (sourceNoteId: number, content: string) => void;
}

type MeetingViewMode = "raw" | "transcript" | "enhanced";

type SpeakerProfileOption = { id?: number; display_name: string; email: string | null };

function buildKnownSpeakers(
  profiles: SpeakerProfileOption[],
  segments: TranscriptSegment[],
  mappings: Record<string, string>
): SpeakerProfileOption[] {
  const seen = new Set<string>();
  const list: SpeakerProfileOption[] = [];
  for (const p of profiles) {
    const key = p.display_name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(p);
  }
  for (const segment of segments) {
    if (!segment.speaker) continue;
    const name = mappings[segment.speaker] || segment.speakerName;
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({ display_name: name, email: null });
  }
  return list;
}

type LiveMeetingTranscriptChatProps = Omit<
  ComponentProps<typeof MeetingTranscriptChat>,
  "segments" | "liveUtterances" | "isRecording"
>;

// Subscribes to live transcript state at this leaf so per-update re-renders
// don't reach the editor/chat (which would drop text selection).
function LiveMeetingTranscriptChat({
  speakerProfiles,
  speakerMappings,
  ...props
}: LiveMeetingTranscriptChatProps) {
  const segments = useMeetingRecordingStore((s) => s.segments);
  const liveUtterances = useMeetingRecordingStore((s) => s.liveUtterances);

  const knownSpeakers = useMemo(
    () => buildKnownSpeakers(speakerProfiles ?? [], segments, speakerMappings ?? {}),
    [segments, speakerMappings, speakerProfiles]
  );

  return (
    <MeetingTranscriptChat
      {...props}
      isRecording
      segments={segments}
      liveUtterances={liveUtterances}
      speakerMappings={speakerMappings}
      speakerProfiles={knownSpeakers}
    />
  );
}

interface NoteEditorProps {
  note: NoteItem;
  onTitleChange: (sourceNoteId: number, title: string) => void;
  onContentChange: (sourceNoteId: number, content: string) => void;
  isSaving: boolean;
  isRecording: boolean;
  isProcessing: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onExportNote?: (format: "md" | "txt") => void;
  onExportTranscript?: (format: "txt" | "srt" | "json" | "md") => void;
  enhancement?: Enhancement;
  actionPicker?: React.ReactNode;
  actionProcessingState?: ActionProcessingState;
  actionName?: string | null;
  diarizationSessionId?: string | null;
  onLiveSpeakerLock?: (speakerId: string, displayName: string) => void;
  sessionDiarizationEnabled?: boolean;
  sessionExpectedCount?: number;
  userTouchedStepper?: boolean;
  onSetSessionDiarizationEnabled?: (enabled: boolean) => void;
  onSetSessionExpectedCount?: (count: number) => void;
  folderName?: string | null;
  calendarEventName?: string | null;
  folders?: FolderItem[];
  onMoveToFolder?: (noteId: number, folderId: number) => void;
  onCreateFolderAndMove?: (noteId: number, folderName: string) => void;
  /** Sets the meeting's write-up template; future series occurrences inherit it. */
  onMeetingTemplateChange?: (noteId: number, templateId: string) => void;
}

export default function NoteEditor({
  note,
  onTitleChange,
  onContentChange,
  isSaving,
  isRecording,
  isProcessing,
  onStartRecording,
  onStopRecording,
  onExportNote,
  onExportTranscript,
  enhancement,
  actionPicker,
  actionProcessingState,
  actionName,
  diarizationSessionId,
  onLiveSpeakerLock,
  sessionDiarizationEnabled,
  sessionExpectedCount,
  userTouchedStepper,
  onSetSessionDiarizationEnabled,
  onSetSessionExpectedCount,
  folderName,
  calendarEventName,
  folders,
  onMoveToFolder,
  onCreateFolderAndMove,
  onMeetingTemplateChange,
}: NoteEditorProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<MeetingViewMode>("raw");
  const [chatMode, setChatMode] = useState<EmbeddedChatMode>("hidden");
  const [showFollowUpEmail, setShowFollowUpEmail] = useState(false);
  const [folderSearch, setFolderSearch] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isDiarizing, setIsDiarizing] = useState(false);
  const spaces = useSpaces();
  const space = useMemo(
    () => spaces.find((s) => s.id === note.space_id) ?? null,
    [spaces, note.space_id]
  );
  const isTeamNote = space?.kind === "team";
  const [diarizedSegments, setDiarizedSegments] = useState<TranscriptSegment[] | null>(null);
  const [speakerMappings, setSpeakerMappings] = useState<Record<string, string>>({});
  const [speakerProfiles, setSpeakerProfiles] = useState<
    Array<{ id: number; display_name: string; email: string | null }>
  >([]);
  const editorRef = useRef<Editor | null>(null);

  const embeddedChat = useEmbeddedChat({
    noteId: note.id,
    folderId: note.folder_id,
    noteTitle: note.title,
    noteContent: note.content,
    noteTranscript: note.transcript ?? undefined,
  });
  const titleRef = useRef<HTMLDivElement>(null);
  const prevNoteIdRef = useRef<number>(note.id);
  const autoShowDoneRef = useRef(false);

  const segmentContainerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({ opacity: 0 });
  const scheduleUiUpdate = useCallback((callback: () => void) => {
    const frameId = window.requestAnimationFrame(callback);
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  const hasMeetingTranscript = !!note.transcript;

  const filteredFolders = useMemo(
    () =>
      folderSearch && folders
        ? folders.filter((f) => f.name.toLowerCase().includes(folderSearch.toLowerCase()))
        : (folders ?? []),
    [folders, folderSearch]
  );

  const displaySegments = useMemo<TranscriptSegment[]>(() => {
    if (diarizedSegments && diarizedSegments.length > 0) return diarizedSegments;
    return parseTranscriptSegments(note.transcript || "");
  }, [diarizedSegments, note.transcript]);

  const hasChatSegments = displaySegments.length > 0;

  const knownSpeakers = useMemo(
    () => buildKnownSpeakers(speakerProfiles, displaySegments, speakerMappings),
    [displaySegments, speakerMappings, speakerProfiles]
  );

  const parsedParticipants = useMemo<CalendarAttendee[]>(() => {
    try {
      return note.participants ? JSON.parse(note.participants) : [];
    } catch {
      return [];
    }
  }, [note.participants]);

  const refreshSpeakerProfiles = useCallback(() => {
    window.electronAPI?.getSpeakerProfiles?.().then((profiles) => {
      setSpeakerProfiles(
        (profiles || []).map((profile) => ({
          id: profile.id,
          display_name: profile.display_name,
          email: profile.email,
        }))
      );
    });
  }, []);

  const updateSegmentIndicator = useCallback(() => {
    const container = segmentContainerRef.current;
    if (!container) return;

    const buttons = container.querySelectorAll<HTMLButtonElement>("[data-segment-button]");
    const activeBtn = Array.from(buttons).find((btn) => btn.dataset.segmentValue === viewMode);
    if (!activeBtn) return;

    const cr = container.getBoundingClientRect();
    const br = activeBtn.getBoundingClientRect();
    setIndicatorStyle({
      width: br.width,
      height: br.height,
      transform: `translateX(${br.left - cr.left}px)`,
      opacity: 1,
    });
  }, [viewMode]);

  useEffect(() => {
    updateSegmentIndicator();
  }, [updateSegmentIndicator]);

  useEffect(() => {
    const observer = new ResizeObserver(() => updateSegmentIndicator());
    if (segmentContainerRef.current) observer.observe(segmentContainerRef.current);
    return () => observer.disconnect();
  }, [updateSegmentIndicator]);

  const prevProcessingStateRef = useRef(actionProcessingState);
  useEffect(() => {
    let cancelScheduledUpdate: (() => void) | undefined;

    if (prevProcessingStateRef.current === "processing" && actionProcessingState === "success") {
      cancelScheduledUpdate = scheduleUiUpdate(() => setViewMode("enhanced"));
    }
    prevProcessingStateRef.current = actionProcessingState;

    return cancelScheduledUpdate;
  }, [actionProcessingState, scheduleUiUpdate]);

  useEffect(() => {
    if (note.id !== prevNoteIdRef.current) {
      prevNoteIdRef.current = note.id;
      autoShowDoneRef.current = false;
      return scheduleUiUpdate(() => {
        setChatMode("hidden");
        setDiarizedSegments(null);
        setIsDiarizing(false);
        setSpeakerMappings({});
        setShowFollowUpEmail(false);
        if (!isRecording) {
          // A meeting with a write-up opens on the summary — that is the page
          // the note exists to produce. Everything else opens on the user's
          // own notes, as before. The id guard above keeps typing into the
          // summary from re-running this.
          setViewMode(enhancement?.content?.trim() ? "enhanced" : "raw");
        }
        if (titleRef.current && titleRef.current.textContent !== note.title) {
          titleRef.current.textContent = note.title || "";
        }
        editorRef.current?.commands.focus();
      });
    }
  }, [isRecording, note.id, note.title, enhancement, scheduleUiUpdate]);

  useEffect(() => {
    window.electronAPI?.getSpeakerMappings?.(note.id).then((mappings) => {
      const map: Record<string, string> = {};
      for (const m of mappings || []) map[m.speaker_id] = m.display_name;
      setSpeakerMappings(map);
    });
    refreshSpeakerProfiles();
  }, [note.id, refreshSpeakerProfiles]);

  useEffect(() => {
    if (
      !autoShowDoneRef.current &&
      embeddedChat.activeConversationId &&
      embeddedChat.messages.length > 0
    ) {
      autoShowDoneRef.current = true;
      return scheduleUiUpdate(() => setChatMode("floating"));
    }
  }, [embeddedChat.activeConversationId, embeddedChat.messages.length, scheduleUiUpdate]);

  useEffect(() => {
    if (titleRef.current && titleRef.current.textContent !== note.title) {
      titleRef.current.textContent = note.title || "";
    }
  }, [note.title]);

  const prevRecordingForDiarizationRef = useRef(false);
  useEffect(() => {
    if (prevRecordingForDiarizationRef.current && !isRecording && diarizationSessionId) {
      const cancelScheduledUpdate = scheduleUiUpdate(() => setIsDiarizing(true));
      prevRecordingForDiarizationRef.current = isRecording;
      return cancelScheduledUpdate;
    }
    prevRecordingForDiarizationRef.current = isRecording;
  }, [diarizationSessionId, isRecording, scheduleUiUpdate]);

  // Persistence happens in meetingRecordingStore's module-level listener
  // (#1495); this only mirrors a published result into the rendered note's UI.
  const completedDiarization = useMeetingRecordingStore((s) => s.completedDiarization);
  useEffect(() => {
    if (!completedDiarization || completedDiarization.noteId !== note.id) return;
    // Consume so a remount can't repaint this overlay over newer edits; the
    // transcript itself is already persisted.
    useMeetingRecordingStore.setState({ completedDiarization: null });
    setIsDiarizing(false);

    const enriched = completedDiarization.segments;
    if (enriched.length === 0) return;
    setDiarizedSegments(enriched);

    const autoMappings: Record<string, string> = {};
    for (const s of enriched) {
      if (s.speakerName && s.speaker) autoMappings[s.speaker] = s.speakerName;
    }
    if (Object.keys(autoMappings).length > 0) {
      setSpeakerMappings((prev) => ({ ...autoMappings, ...prev }));
    }
  }, [completedDiarization, note.id]);

  const persistDisplaySegments = useCallback(
    async (nextSegments: TranscriptSegment[], updateOverlay = true) => {
      if (updateOverlay) {
        setDiarizedSegments(nextSegments);
      }
      await window.electronAPI?.updateNote(note.id, {
        transcript: serializeTranscriptSegments(nextSegments),
      });
    },
    [note.id]
  );

  const handleMapSpeaker = useCallback(
    async (
      speakerId: string,
      displayName: string,
      email?: string | null,
      profileId?: number | null
    ) => {
      setSpeakerMappings((prev) => ({ ...prev, [speakerId]: displayName }));
      await window.electronAPI?.setSpeakerMapping?.(
        note.id,
        speakerId,
        displayName,
        email,
        profileId
      );

      if (isRecording) {
        onLiveSpeakerLock?.(speakerId, displayName);
        refreshSpeakerProfiles();
        return;
      }

      const currentSegments = displaySegments.map((s) =>
        s.speaker === speakerId
          ? lockTranscriptSpeaker(s, {
              speakerName: displayName,
              speaker: speakerId,
              speakerIsPlaceholder: false,
              suggestedName: undefined,
              suggestedProfileId: undefined,
            })
          : s
      );
      await persistDisplaySegments(currentSegments, !!diarizedSegments || !isRecording);

      refreshSpeakerProfiles();
    },
    [
      diarizedSegments,
      displaySegments,
      isRecording,
      note.id,
      onLiveSpeakerLock,
      persistDisplaySegments,
      refreshSpeakerProfiles,
    ]
  );

  const handleConfirmSuggestion = useCallback(
    async (speakerId: string, suggestedName: string, profileId: number) => {
      await handleMapSpeaker(speakerId, suggestedName, null, profileId);
    },
    [handleMapSpeaker]
  );

  const handleAttachSpeakerEmail = useCallback(
    async (profileId: number, email: string | null) => {
      const result = await window.electronAPI?.attachSpeakerEmail?.(profileId, email);
      if (result?.success) {
        refreshSpeakerProfiles();
      }
    },
    [refreshSpeakerProfiles]
  );

  const handleDismissSuggestion = useCallback(
    async (speakerId: string) => {
      const currentSegments = displaySegments.map((s) =>
        s.speaker === speakerId
          ? applyTranscriptSpeakerPatch(s, {
              suggestedName: undefined,
              suggestedProfileId: undefined,
            })
          : s
      );
      await persistDisplaySegments(currentSegments, !!diarizedSegments || !isRecording);
    },
    [displaySegments, diarizedSegments, isRecording, persistDisplaySegments]
  );

  const [selectedSegmentIds, setSelectedSegmentIds] = useState<Set<string>>(new Set());
  const [selectionNoteId, setSelectionNoteId] = useState(note.id);
  if (selectionNoteId !== note.id) {
    setSelectionNoteId(note.id);
    setSelectedSegmentIds(new Set());
  }

  const handleToggleSelect = useCallback((segmentId: string) => {
    setSelectedSegmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(segmentId)) next.delete(segmentId);
      else next.add(segmentId);
      return next;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedSegmentIds(new Set());
  }, []);

  useEffect(() => {
    if (selectedSegmentIds.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedSegmentIds.size, handleClearSelection]);

  const handleBulkAssignName = useCallback(
    async (displayName: string, _email?: string | null, profileId?: number) => {
      if (!selectedSegmentIds.size) return;
      const nextSegments = displaySegments.map((segment) =>
        selectedSegmentIds.has(segment.id)
          ? lockTranscriptSpeaker(segment, {
              speakerName: displayName,
              speakerIsPlaceholder: false,
              suggestedName: undefined,
              suggestedProfileId: profileId ?? undefined,
            })
          : segment
      );
      await persistDisplaySegments(nextSegments);
      handleClearSelection();
    },
    [displaySegments, selectedSegmentIds, persistDisplaySegments, handleClearSelection]
  );

  const handleTitleInput = useCallback(() => {
    if (titleRef.current) {
      const text = titleRef.current.textContent || "";
      onTitleChange(note.id, text);
    }
  }, [note.id, onTitleChange]);

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      editorRef.current?.commands.focus();
    }
  }, []);

  const handleTitlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain").replace(/\n/g, " ");
    document.execCommand("insertText", false, text);
  }, []);

  const prevRecordingRef = useRef(false);
  useEffect(() => {
    if (isRecording && !prevRecordingRef.current) {
      scheduleUiUpdate(() => setViewMode("transcript"));
    }
    prevRecordingRef.current = isRecording;
  }, [isRecording, scheduleUiUpdate]);

  const handleContentChange = useCallback(
    (newValue: string) => {
      onContentChange(note.id, newValue);
    },
    [note.id, onContentChange]
  );

  const handleEnhancedChange = useCallback(
    (value: string) => {
      enhancement?.onChange(note.id, value);
    },
    [enhancement, note.id]
  );

  const handleAskSubmit = useCallback(
    (text: string) => {
      if (chatMode === "hidden") {
        setChatMode("floating");
      }
      embeddedChat.sendMessage(text);
    },
    [chatMode, embeddedChat]
  );

  const handleChatInputFocus = useCallback(() => {
    if (chatMode === "hidden") {
      setChatMode("floating");
    }
  }, [chatMode]);

  const noteDate = formatNoteDate(note.created_at);
  const shortDate = formatShortDate(note.created_at);

  // The recap someone else reads: title, date, attendees, then the write-up —
  // ready to paste into Slack or an email without hand-trimming the app out.
  const canCopyRecap = note.note_type === "meeting" && !!enhancement?.content?.trim();
  const handleCopyRecap = useCallback(async () => {
    const recap = buildMeetingRecap({
      title: note.title,
      formattedDate: shortDate,
      participants: note.participants,
      enhancedContent: enhancement?.content ?? "",
      labels: { attendees: t("notes.recap.attendees") },
    });
    if (!recap) return;
    try {
      await navigator.clipboard.writeText(recap);
      toast({ description: t("notes.recap.copied") });
    } catch {
      toast({ description: t("notes.recap.copyFailed"), variant: "destructive" });
    }
  }, [note.title, note.participants, shortDate, enhancement?.content, t, toast]);

  return (
    <div className="flex h-full min-h-0">
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="px-5 pt-4 pb-0">
          <div
            ref={titleRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleTitleInput}
            onKeyDown={handleTitleKeyDown}
            onPaste={handleTitlePaste}
            data-placeholder={t("notes.editor.untitled")}
            className="text-[17px] font-semibold text-foreground bg-transparent outline-none tracking-[-0.018em] rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50 empty:before:pointer-events-none"
            role="textbox"
            aria-label={t("notes.editor.noteTitle")}
          />
          <div className="flex items-center gap-1.5 mt-2">
            {shortDate && (
              <span
                className="inline-flex h-5 items-center gap-1.5 text-[11px] text-muted-foreground"
                title={noteDate}
              >
                <Calendar size={11} className="shrink-0 opacity-70" />
                <span data-numeric>{shortDate}</span>
              </span>
            )}
            {calendarEventName && (
              <span
                className="inline-flex h-5 items-center gap-1.5 text-[11px] text-muted-foreground"
                title={calendarEventName}
              >
                <LinkIcon size={11} className="shrink-0 opacity-70" />
                <span className="truncate max-w-40">{calendarEventName}</span>
              </span>
            )}
            <NoteParticipants noteId={note.id} participants={parsedParticipants} />
            {isTeamNote && space && (
              <>
                <button
                  type="button"
                  onClick={() => navigateToContainer(space.id, null)}
                  className={CHIP_BUTTON_CLASS}
                >
                  {space.emoji ? (
                    <span className="text-[11px] leading-none shrink-0" aria-hidden="true">
                      {space.emoji}
                    </span>
                  ) : (
                    <Users size={11} className="shrink-0" />
                  )}
                  <span className="truncate max-w-32">{space.name}</span>
                </button>
                {folders && onMoveToFolder && (
                  <span aria-hidden="true" className="text-[11px] text-foreground/25">
                    /
                  </span>
                )}
              </>
            )}
            {folders && onMoveToFolder && (
              <DropdownMenu
                onOpenChange={(open) => {
                  if (!open) {
                    setFolderSearch("");
                    setIsCreatingFolder(false);
                    setNewFolderName("");
                  }
                }}
              >
                <DropdownMenuTrigger asChild>
                  <button className={CHIP_BUTTON_CLASS}>
                    <FolderOpen size={11} className="shrink-0" />
                    {folderName || t("notes.editor.noFolder")}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" sideOffset={6} className="min-w-44 p-1">
                  {folders.length > 5 && (
                    <>
                      <div className="relative px-1.5 py-0.5">
                        <Search
                          size={9}
                          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/15 pointer-events-none"
                        />
                        <input
                          value={folderSearch}
                          onChange={(e) => setFolderSearch(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                          placeholder={t("notes.context.searchFolders")}
                          className="input-inline w-full pl-4.5 pr-1 py-0.5 text-xs text-foreground placeholder:text-foreground/15 outline-none border-none appearance-none"
                        />
                      </div>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <div className="overflow-y-auto max-h-48">
                    {filteredFolders.map((folder) => {
                      const isCurrent = folder.id === note.folder_id;
                      return (
                        <DropdownMenuItem
                          key={folder.id}
                          disabled={isCurrent}
                          onClick={() => onMoveToFolder(note.id, folder.id)}
                          className="text-xs gap-2 rounded-md px-2 py-1.5"
                        >
                          <FolderOpen size={11} className="text-foreground/30 shrink-0" />
                          <span className="truncate flex-1">{folder.name}</span>
                          {isCurrent && <Check size={9} className="text-primary shrink-0" />}
                        </DropdownMenuItem>
                      );
                    })}
                    {folderSearch && filteredFolders.length === 0 && (
                      <p className="text-xs text-foreground/20 text-center py-1.5">
                        {t("notes.context.noResults")}
                      </p>
                    )}
                  </div>
                  {onCreateFolderAndMove && (
                    <>
                      <DropdownMenuSeparator />
                      {isCreatingFolder ? (
                        <div className="px-1">
                          <input
                            autoFocus
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === "Enter" && newFolderName.trim()) {
                                onCreateFolderAndMove(note.id, newFolderName.trim());
                                setNewFolderName("");
                                setIsCreatingFolder(false);
                              }
                              if (e.key === "Escape") {
                                setIsCreatingFolder(false);
                                setNewFolderName("");
                              }
                            }}
                            placeholder={t("notes.folders.folderName")}
                            className="input-inline w-full px-2 py-1.5 rounded-md bg-transparent text-xs text-foreground placeholder:text-foreground/20 outline-none border-none appearance-none"
                          />
                        </div>
                      ) : (
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            setIsCreatingFolder(true);
                          }}
                          className="text-xs gap-2 rounded-md px-2 py-1.5 text-foreground/40"
                        >
                          <Plus size={10} />
                          {t("notes.context.newFolder")}
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {/* The write-up template. A chip like the folder: a quiet fact
                about the note that opens into a choice. Only meetings have a
                write-up shape, so only meetings get the chip — and a series
                remembers the choice, so for a recurring meeting this is
                usually already right before it is ever touched. */}
            {note.note_type === "meeting" && onMeetingTemplateChange && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={CHIP_BUTTON_CLASS} title={t("notes.templates.hint")}>
                    <LayoutTemplate size={11} className="shrink-0" />
                    {t(meetingTemplateById(note.meeting_template).labelKey)}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" sideOffset={6} className="min-w-44 p-1">
                  {MEETING_TEMPLATES.map((template) => {
                    const isCurrent = template.id === meetingTemplateById(note.meeting_template).id;
                    return (
                      <DropdownMenuItem
                        key={template.id}
                        onClick={() => onMeetingTemplateChange(note.id, template.id)}
                        className="text-xs gap-2 rounded-md px-2 py-1.5"
                      >
                        <LayoutTemplate size={11} className="text-foreground/30 shrink-0" />
                        <span className="truncate flex-1">{t(template.labelKey)}</span>
                        {isCurrent && <Check size={9} className="text-primary shrink-0" />}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {isSaving && (
              <span className="inline-flex h-5 items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2 size={9} className="animate-spin" />
                {t("notes.editor.saving")}
              </span>
            )}
            <div className="flex-1" />
            <div className="flex items-center gap-1.5">
              {(enhancement || hasMeetingTranscript || hasChatSegments || isRecording) && (
                <div
                  role="group"
                  aria-label={t("notes.editor.viewMode")}
                  className="shrink-0 rounded-lg border border-border-subtle bg-input p-0.5"
                >
                  {/* The measured track carries no border or padding of its own:
                      the sliding thumb is positioned from this box's origin. */}
                  {/* Summary leads: it is the page a meeting note exists to
                      produce, so it takes the first slot the eye lands on —
                      then the transcript, then the user's own notes. */}
                  <div ref={segmentContainerRef} className="relative flex items-center">
                    <div
                      className="absolute top-0 left-0 rounded-md bg-surface-raised shadow-raised transition-[width,height,transform,opacity] duration-200 ease-out pointer-events-none"
                      style={indicatorStyle}
                    />
                    {enhancement && (
                      <button
                        data-segment-button
                        data-segment-value="enhanced"
                        aria-pressed={viewMode === "enhanced"}
                        onClick={() => setViewMode("enhanced")}
                        className={cn(
                          SEGMENT_BUTTON_CLASS,
                          viewMode === "enhanced"
                            ? "text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Sparkles size={11} />
                        {t("notes.editor.enhanced")}
                        {enhancement.isStale && (
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-warning"
                            title={t("notes.editor.staleIndicator")}
                          />
                        )}
                      </button>
                    )}
                    {(hasMeetingTranscript || hasChatSegments || isRecording) && (
                      <button
                        data-segment-button
                        data-segment-value="transcript"
                        aria-pressed={viewMode === "transcript"}
                        onClick={() => setViewMode("transcript")}
                        className={cn(
                          SEGMENT_BUTTON_CLASS,
                          viewMode === "transcript"
                            ? "text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <MessageSquareText size={11} />
                        {t("notes.editor.transcript")}
                        {isRecording && (
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-pulse"
                            title={t("notes.editor.live")}
                          />
                        )}
                      </button>
                    )}
                    <button
                      data-segment-button
                      data-segment-value="raw"
                      aria-pressed={viewMode === "raw"}
                      onClick={() => setViewMode("raw")}
                      className={cn(
                        SEGMENT_BUTTON_CLASS,
                        viewMode === "raw"
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <AlignLeft size={11} />
                      {t("notes.editor.notes")}
                    </button>
                  </div>
                </div>
              )}
              {/* The two things people actually do with a finished write-up,
                  as visible verbs rather than dropdown archaeology. */}
              {canCopyRecap && (
                <>
                  <button
                    type="button"
                    onClick={() => void handleCopyRecap()}
                    className="shrink-0 h-7 flex items-center gap-1.5 rounded-lg border border-border-subtle bg-input px-2.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted hover:border-border transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ClipboardCopy size={11} />
                    {t("notes.recap.copy")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFollowUpEmail(true)}
                    className="shrink-0 h-7 flex items-center gap-1.5 rounded-lg border border-border-subtle bg-input px-2.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted hover:border-border transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Mail size={11} />
                    {t("notes.followUpEmail.button")}
                  </button>
                </>
              )}
              {(onExportNote || onExportTranscript) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="shrink-0 h-7 w-7 flex items-center justify-center rounded-lg border border-border-subtle bg-input text-muted-foreground hover:text-foreground hover:bg-muted hover:border-border transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={t("notes.editor.export")}
                    >
                      <Download size={12} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={4}>
                    {viewMode === "transcript" && onExportTranscript ? (
                      <>
                        <DropdownMenuItem
                          onClick={() => onExportTranscript("txt")}
                          className="text-xs gap-2"
                        >
                          <FileText size={13} className="text-foreground/40" />
                          {t("notes.editor.asTranscriptText")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onExportTranscript("srt")}
                          className="text-xs gap-2"
                        >
                          <FileText size={13} className="text-foreground/40" />
                          {t("notes.editor.asSubtitles")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onExportTranscript("md")}
                          className="text-xs gap-2"
                        >
                          <FileText size={13} className="text-foreground/40" />
                          {t("notes.editor.asTranscriptMarkdown")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onExportTranscript("json")}
                          className="text-xs gap-2"
                        >
                          <FileText size={13} className="text-foreground/40" />
                          {t("notes.editor.asJson")}
                        </DropdownMenuItem>
                      </>
                    ) : (
                      <>
                        <DropdownMenuItem
                          onClick={() => onExportNote?.("md")}
                          className="text-xs gap-2"
                        >
                          <FileText size={13} className="text-foreground/40" />
                          {t("notes.editor.asMarkdown")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onExportNote?.("txt")}
                          className="text-xs gap-2"
                        >
                          <FileText size={13} className="text-foreground/40" />
                          {t("notes.editor.asPlainText")}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>

        {canCopyRecap && (
          <FollowUpEmailDialog
            open={showFollowUpEmail}
            onOpenChange={setShowFollowUpEmail}
            source={{
              title: note.title,
              formattedDate: shortDate,
              participants: note.participants,
              enhancedContent: enhancement?.content ?? "",
              attendeesLabel: t("notes.recap.attendees"),
            }}
          />
        )}

        <div className="flex-1 relative min-h-0">
          <div className="h-full overflow-y-auto">
            {viewMode === "transcript" && (hasChatSegments || isRecording) ? (
              isRecording ? (
                <LiveMeetingTranscriptChat
                  speakerMappings={speakerMappings}
                  speakerProfiles={speakerProfiles}
                  participants={parsedParticipants}
                  isDiarizing={isDiarizing}
                  sessionDiarizationEnabled={sessionDiarizationEnabled}
                  sessionExpectedCount={sessionExpectedCount}
                  userTouchedStepper={userTouchedStepper}
                  onSetSessionDiarizationEnabled={onSetSessionDiarizationEnabled}
                  onSetSessionExpectedCount={onSetSessionExpectedCount}
                  onMapSpeaker={handleMapSpeaker}
                  onConfirmSuggestion={handleConfirmSuggestion}
                  onDismissSuggestion={handleDismissSuggestion}
                  onAttachSpeakerEmail={handleAttachSpeakerEmail}
                />
              ) : (
                <MeetingTranscriptChat
                  segments={displaySegments}
                  speakerMappings={speakerMappings}
                  speakerProfiles={knownSpeakers}
                  participants={parsedParticipants}
                  isDiarizing={isDiarizing}
                  sessionDiarizationEnabled={sessionDiarizationEnabled}
                  sessionExpectedCount={sessionExpectedCount}
                  userTouchedStepper={userTouchedStepper}
                  onSetSessionDiarizationEnabled={onSetSessionDiarizationEnabled}
                  onSetSessionExpectedCount={onSetSessionExpectedCount}
                  onMapSpeaker={handleMapSpeaker}
                  onConfirmSuggestion={handleConfirmSuggestion}
                  onDismissSuggestion={handleDismissSuggestion}
                  onAttachSpeakerEmail={handleAttachSpeakerEmail}
                  selectedSegmentIds={selectedSegmentIds}
                  onToggleSelect={handleToggleSelect}
                />
              )
            ) : viewMode === "transcript" && hasMeetingTranscript ? (
              <RichTextEditor value={note.transcript || ""} disabled />
            ) : viewMode === "enhanced" && enhancement ? (
              <RichTextEditor value={enhancement.content} onChange={handleEnhancedChange} />
            ) : (
              <RichTextEditor
                value={note.content}
                onChange={handleContentChange}
                editorRef={editorRef}
                placeholder={t("notes.editor.startWriting")}
                disabled={actionProcessingState === "processing"}
              />
            )}
          </div>
          <ActionProcessingOverlay
            state={actionProcessingState ?? "idle"}
            actionName={actionName ?? null}
          />
          <div
            className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none"
            style={{
              background: "linear-gradient(to bottom, transparent, var(--color-background))",
            }}
          />
          {!isRecording && selectedSegmentIds.size > 0 && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
              <SelectionBar
                count={selectedSegmentIds.size}
                onClear={handleClearSelection}
                speakerProfiles={knownSpeakers}
                participants={parsedParticipants}
                onAssignName={handleBulkAssignName}
                t={t}
              />
            </div>
          )}
          <NoteBottomBar
            isRecording={isRecording}
            isProcessing={isProcessing}
            onStartRecording={onStartRecording}
            onStopRecording={onStopRecording}
            onAskSubmit={handleAskSubmit}
            onInputFocus={handleChatInputFocus}
            canRecord
            actionPicker={isRecording ? undefined : actionPicker}
            hideInput={chatMode !== "hidden"}
          />
          {chatMode === "floating" && (
            <EmbeddedChat
              mode="floating"
              onModeChange={setChatMode}
              messages={embeddedChat.messages}
              agentState={embeddedChat.agentState}
              onTextSubmit={embeddedChat.sendMessage}
              onCancel={embeddedChat.cancelStream}
              noteConversations={embeddedChat.noteConversations}
              activeConversationId={embeddedChat.activeConversationId}
              onSwitchConversation={embeddedChat.switchConversation}
              onNewChat={embeddedChat.startNewChat}
            />
          )}
        </div>
      </div>
      {chatMode === "sidebar" && (
        <EmbeddedChat
          mode="sidebar"
          onModeChange={setChatMode}
          messages={embeddedChat.messages}
          agentState={embeddedChat.agentState}
          onTextSubmit={embeddedChat.sendMessage}
          onCancel={embeddedChat.cancelStream}
          noteConversations={embeddedChat.noteConversations}
          activeConversationId={embeddedChat.activeConversationId}
          onSwitchConversation={embeddedChat.switchConversation}
          onNewChat={embeddedChat.startNewChat}
        />
      )}
    </div>
  );
}
