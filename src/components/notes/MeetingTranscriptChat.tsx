import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  Check,
  Loader2,
  Lock,
  MessageSquareText,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";
import { Toggle } from "../ui/toggle";
import { cn } from "../lib/utils";
import { MAX_SPEAKER_COUNT } from "../../constants/speakerDetection.json";
import type { TranscriptSegment } from "../../stores/meetingRecordingStore";
import type { LiveUtterance } from "../../utils/liveUtterances";
import { windowTranscript } from "../../utils/transcriptWindow";
import { SPEAKER_IDENTIFICATION_ENABLED } from "../../helpers/speakerIdentificationPolicy";
import {
  isTranscriptSpeakerLocked,
  resolveSegmentSpeakerName,
  type TranscriptSpeakerStatus,
} from "../../utils/transcriptSpeakerState";

/* Two tracks, told apart three ways at once so none of them has to shout:
 * alignment (you left / room right), a rail on each track's outer edge, and a
 * tint (accent for you, neutral surface for the room). Interim text keeps the
 * same geometry but drops the fill for a dashed outline and muted type, so a
 * provisional line can never be mistaken for a committed one. */
const BUBBLE_STYLES = {
  mic: {
    align: "justify-start",
    radius: "rounded-bl-sm",
    bg: "border border-dashed border-primary/40 text-muted-foreground",
    cursor: "bg-primary/70",
  },
  system: {
    align: "justify-end",
    radius: "rounded-br-sm",
    bg: "border border-dashed border-border-hover/70 text-muted-foreground",
    cursor: "bg-muted-foreground/70",
  },
} as const;

/* Diarization is categorical data, so this ramp stays multi-hue — it is the one
 * place the single-accent rule is suspended. The tokens hold constant lightness
 * and chroma per theme and step evenly across the 300 degrees left once a 60
 * degree exclusion zone around the brand teal is removed, so no speaker reads
 * as the accent and no speaker reads as another. See --color-speaker-* in
 * index.css. */
const SPEAKER_COLORS = [
  "text-speaker-1",
  "text-speaker-2",
  "text-speaker-3",
  "text-speaker-4",
  "text-speaker-5",
  "text-speaker-6",
  "text-speaker-7",
  "text-speaker-8",
];

const SPEAKER_CHIP_COLORS = [
  "border-speaker-1/40 bg-speaker-1/10",
  "border-speaker-2/40 bg-speaker-2/10",
  "border-speaker-3/40 bg-speaker-3/10",
  "border-speaker-4/40 bg-speaker-4/10",
  "border-speaker-5/40 bg-speaker-5/10",
  "border-speaker-6/40 bg-speaker-6/10",
  "border-speaker-7/40 bg-speaker-7/10",
  "border-speaker-8/40 bg-speaker-8/10",
];

const SPEAKER_BORDER_COLORS = [
  "border-r-speaker-1/70",
  "border-r-speaker-2/70",
  "border-r-speaker-3/70",
  "border-r-speaker-4/70",
  "border-r-speaker-5/70",
  "border-r-speaker-6/70",
  "border-r-speaker-7/70",
  "border-r-speaker-8/70",
];

const STICKY_SCROLL_THRESHOLD_PX = 80;

/**
 * How many segments are rendered at once, and how many more each "show earlier"
 * reveals. Roughly an hour of two-person conversation, so most meetings never
 * hit it and the ones that do stay responsive.
 */
const SEGMENT_WINDOW = 300;

const getEffectiveSpeakerKey = (
  segment: TranscriptSegment,
  speakerMappings?: Record<string, string>
): string => {
  const name = resolveSegmentSpeakerName(segment, speakerMappings);
  if (name) return `name:${name.toLowerCase()}`;
  if (segment.speaker) return `id:${segment.speaker}`;
  return `src:${segment.source}`;
};

const getSpeakerNumber = (speakerId: string) => {
  const match = speakerId.match(/speaker_(\d+)/);
  return match ? Number(match[1]) + 1 : 1;
};

const getSpeakerStateLabel = (state: TranscriptSpeakerStatus, t: (key: string) => string) => {
  switch (state) {
    case "locked":
      return t("notes.speaker.state.locked");
    case "provisional":
      return t("notes.speaker.state.provisional");
    case "suggested":
      return t("notes.speaker.state.suggested");
    case "confirmed":
    default:
      return t("notes.speaker.state.confirmed");
  }
};

function PartialBubble({
  text,
  source,
  speakerLabel,
  speakerState,
  t,
}: {
  text: string;
  source: "mic" | "system";
  speakerLabel?: string;
  speakerState?: TranscriptSpeakerStatus;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const s = BUBBLE_STYLES[source];
  return (
    <div
      className={cn("flex", s.align)}
      style={{ animation: "agent-message-in 150ms ease-out both" }}
    >
      <div
        className={cn("max-w-[80%] flex flex-col", source === "mic" ? "items-start" : "items-end")}
      >
        <div className="mb-0.5 flex items-center gap-1 px-1">
          {speakerLabel && (
            <span className="text-[11px] font-medium text-muted-foreground/70">{speakerLabel}</span>
          )}
          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground/50">
            {speakerState === "provisional" ? (
              <>
                <Sparkles size={9} />
                {getSpeakerStateLabel("provisional", t)}
              </>
            ) : (
              t("notes.speaker.state.interim")
            )}
          </span>
        </div>
        <div
          className={cn("px-3 py-1.5 rounded-lg", s.radius, s.bg, "text-[13px] leading-relaxed")}
        >
          {text}
          <span
            className={cn("inline-block w-[2px] h-[13px] align-middle ml-0.5", s.cursor)}
            style={{ animation: "agent-cursor-blink 800ms steps(1) infinite" }}
          />
        </div>
      </div>
    </div>
  );
}

const isLikelyEmail = (value: string) => /.+@.+\..+/.test(value.trim());

const nameFromEmail = (email: string) => email.split("@")[0] || email;

interface SpeakerProfileLite {
  id?: number;
  display_name: string;
  email: string | null;
}

interface SpeakerPickerProps {
  speakerProfiles?: SpeakerProfileLite[];
  participants?: Array<{ email: string; displayName: string | null }>;
  onSelectName: (name: string, email?: string | null, profileId?: number) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function AddContactButton({
  profile,
  onAttachEmail,
  t,
}: {
  profile: { id: number; display_name: string };
  onAttachEmail: (profileId: number, email: string | null) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const canSave = isLikelyEmail(draft);

  const submit = () => {
    if (!canSave) return;
    onAttachEmail(profile.id, draft.trim().toLowerCase());
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setDraft("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center mb-0.5 px-1.5 py-0.5 rounded-md text-[11px] outline-none cursor-pointer",
            "border border-dashed border-border/60 dark:border-white/15",
            "text-foreground/50 hover:text-foreground hover:border-border/90 dark:hover:border-white/30",
            "transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          {t("notes.speaker.addContact")}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3">
        <div className="text-xs font-medium text-foreground truncate mb-2">
          {profile.display_name}
        </div>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={t("notes.speaker.emailPlaceholder")}
          className={cn(
            "w-full px-2 py-1.5 rounded-md bg-transparent text-xs text-foreground",
            "placeholder:text-foreground/25 outline-none",
            "border border-border/50 focus:border-border/90 transition-colors"
          )}
          autoFocus
          type="email"
        />
        <div className="flex justify-end gap-1 mt-2">
          <button
            onClick={() => setOpen(false)}
            className="px-2 py-1 rounded text-[11px] text-foreground/50 hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
          >
            {t("notes.speaker.cancel")}
          </button>
          <button
            onClick={submit}
            disabled={!canSave}
            className={cn(
              "px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:bg-primary/20 disabled:text-primary-foreground/40 disabled:pointer-events-none"
            )}
          >
            {t("notes.speaker.save")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SpeakerPicker({ speakerProfiles, participants, onSelectName, t }: SpeakerPickerProps) {
  const [search, setSearch] = useState("");
  const lower = search.toLowerCase();
  const trimmed = search.trim();
  const trimmedLower = trimmed.toLowerCase();

  const filteredParticipants = (participants || []).filter(
    (p) =>
      !search ||
      (p.displayName || "").toLowerCase().includes(lower) ||
      p.email.toLowerCase().includes(lower)
  );
  const filteredProfiles = (speakerProfiles || []).filter(
    (p) =>
      !search ||
      p.display_name.toLowerCase().includes(lower) ||
      (p.email && p.email.toLowerCase().includes(lower))
  );

  const hasExactMatch =
    filteredParticipants.some(
      (p) =>
        (p.displayName || "").toLowerCase() === trimmedLower ||
        p.email.toLowerCase() === trimmedLower
    ) ||
    filteredProfiles.some(
      (p) =>
        p.display_name.toLowerCase() === trimmedLower ||
        (p.email && p.email.toLowerCase() === trimmedLower)
    );
  const canCreate = !!trimmed && !hasExactMatch;
  const inputIsEmail = isLikelyEmail(trimmed);

  const submitCreate = () => {
    if (!canCreate) return;
    if (inputIsEmail) {
      const email = trimmed.toLowerCase();
      onSelectName(nameFromEmail(email), email);
    } else {
      onSelectName(trimmed, null);
    }
    setSearch("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canCreate) {
      e.preventDefault();
      submitCreate();
    }
  };

  const isEmpty = !filteredParticipants.length && !filteredProfiles.length && !canCreate;

  return (
    <>
      <div className="p-2 border-b border-border/50">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("notes.speaker.nameOrEmailPlaceholder")}
          className="w-full px-2 py-1.5 rounded-md bg-transparent text-xs text-foreground placeholder:text-foreground/20 outline-none border-none appearance-none"
          autoFocus
        />
      </div>
      <div className="max-h-52 overflow-y-auto">
        {filteredParticipants.length > 0 && (
          <div className="p-1 border-b border-border/30">
            <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
              {t("notes.speaker.meetingAttendees")}
            </div>
            {filteredParticipants.slice(0, 5).map((p) => (
              <button
                key={p.email}
                onClick={() => onSelectName(p.displayName || p.email.split("@")[0], p.email)}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-foreground/70 hover:bg-foreground/5 transition-colors cursor-pointer"
              >
                <span className="truncate flex-1 text-left">{p.displayName || p.email}</span>
                {p.displayName && (
                  <span className="text-foreground/30 truncate text-[11px]">{p.email}</span>
                )}
              </button>
            ))}
          </div>
        )}
        {filteredProfiles.length > 0 && (
          <div className="p-1 border-b border-border/30">
            <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
              {t("notes.speaker.knownSpeakers")}
            </div>
            {filteredProfiles.slice(0, 5).map((p) => (
              <button
                key={p.id ?? `name-${p.display_name}`}
                onClick={() => onSelectName(p.display_name, p.email, p.id)}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-foreground/70 hover:bg-foreground/5 transition-colors cursor-pointer"
              >
                <span className="truncate flex-1 text-left">{p.display_name}</span>
                {p.email && (
                  <span className="text-foreground/30 truncate text-[11px]">{p.email}</span>
                )}
              </button>
            ))}
          </div>
        )}
        {canCreate && (
          <div className="p-1">
            <button
              onClick={submitCreate}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-foreground/70 hover:bg-foreground/5 transition-colors cursor-pointer"
            >
              <span className="text-foreground/50 shrink-0">
                {t("notes.speaker.createNewPrefix")}
              </span>
              {inputIsEmail ? (
                <>
                  <span className="text-foreground truncate">{nameFromEmail(trimmed)}</span>
                  <span className="text-foreground/30 truncate text-[11px]">
                    {trimmed.toLowerCase()}
                  </span>
                </>
              ) : (
                <span className="text-foreground truncate">{trimmed}</span>
              )}
            </button>
          </div>
        )}
        {isEmpty && (
          <div className="px-3 py-4 text-center text-[11px] text-foreground/30">
            {t("notes.speaker.nameOrEmailPlaceholder")}
          </div>
        )}
      </div>
    </>
  );
}

function SpeakerLabel({
  speakerId,
  segment,
  resolvedName,
  speakerProfiles,
  participants,
  colorIdx,
  isOriginallyYou,
  onMap,
  onConfirm,
  onDismiss,
  t,
}: {
  speakerId: string;
  segment: TranscriptSegment;
  resolvedName?: string;
  speakerProfiles?: SpeakerProfileLite[];
  participants?: Array<{ email: string; displayName: string | null }>;
  colorIdx: number;
  isOriginallyYou: boolean;
  onMap?: (speakerId: string, name: string, email?: string | null, profileId?: number) => void;
  onConfirm?: (speakerId: string, name: string, profileId: number) => void;
  onDismiss?: (speakerId: string) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const [open, setOpen] = useState(false);
  const speakerState =
    segment.speakerLocked || isTranscriptSpeakerLocked(segment)
      ? "locked"
      : segment.speakerStatus ||
        (segment.suggestedName && !resolvedName
          ? "suggested"
          : segment.speakerName || resolvedName
            ? "confirmed"
            : segment.speakerIsPlaceholder
              ? "provisional"
              : undefined);

  const hasSuggestion = !!segment.suggestedName && !resolvedName;

  if (hasSuggestion) {
    return (
      <span className="group inline-flex items-center gap-1 mb-0.5 px-1">
        <span className="text-[11px] font-medium italic text-muted-foreground/60">
          {segment.suggestedName}
        </span>
        <button
          onClick={() =>
            onConfirm?.(speakerId, segment.suggestedName!, segment.suggestedProfileId!)
          }
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity cursor-pointer text-muted-foreground hover:text-success"
        >
          <Check size={12} />
        </button>
        <button
          onClick={() => onDismiss?.(speakerId)}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity cursor-pointer text-muted-foreground hover:text-destructive"
        >
          <X size={12} />
        </button>
      </span>
    );
  }

  const displayLabel =
    resolvedName ||
    segment.speakerName ||
    (isOriginallyYou
      ? t("notes.speaker.you")
      : t("notes.speaker.label", { n: getSpeakerNumber(speakerId) }));
  const isUnmapped = !resolvedName && !segment.speakerName;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1 text-[11px] font-medium mb-0.5 px-1.5 py-0.5 rounded-md outline-none cursor-pointer",
            "border transition-colors duration-150",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            SPEAKER_COLORS[colorIdx],
            SPEAKER_CHIP_COLORS[colorIdx],
            "hover:brightness-110",
            isUnmapped && "border-dashed",
            speakerState === "provisional" && "italic"
          )}
        >
          {displayLabel}
          {speakerState === "locked" && <Lock size={8} className="opacity-60" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0">
        <SpeakerPicker
          speakerProfiles={speakerProfiles}
          participants={participants}
          onSelectName={(name, email, profileId) => {
            onMap?.(speakerId, name, email, profileId);
            setOpen(false);
          }}
          t={t}
        />
      </PopoverContent>
    </Popover>
  );
}

function SelectCheckbox({
  isSelected,
  onToggle,
  className,
}: {
  isSelected: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={isSelected}
      className={cn(
        "w-4 h-4 rounded-full border flex items-center justify-center transition-all cursor-pointer",
        isSelected
          ? "border-primary bg-primary text-primary-foreground opacity-100"
          : "border-border/60 bg-background/80 opacity-0 group-hover:opacity-100 hover:border-foreground/50",
        className
      )}
    >
      {isSelected && <Check size={10} strokeWidth={3} />}
    </button>
  );
}

export function SelectionBar({
  count,
  onClear,
  speakerProfiles,
  participants,
  onAssignName,
  t,
}: {
  count: number;
  onClear: () => void;
  speakerProfiles?: SpeakerProfileLite[];
  participants?: Array<{ email: string; displayName: string | null }>;
  onAssignName: (name: string, email?: string | null, profileId?: number) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-border-subtle bg-popover/95 backdrop-blur-xl px-2 py-1.5 text-xs shadow-elevated"
      style={{ animation: "agent-message-in 150ms ease-out both" }}
    >
      <span data-numeric className="px-1 text-muted-foreground">
        {t("notes.speaker.selected", { n: count })}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md font-medium text-foreground bg-surface-3 hover:bg-surface-raised transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Users size={12} />
            {t("notes.speaker.assignTo")}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0">
          <SpeakerPicker
            speakerProfiles={speakerProfiles}
            participants={participants}
            onSelectName={(name, email, profileId) => {
              onAssignName(name, email, profileId);
              setOpen(false);
            }}
            t={t}
          />
        </PopoverContent>
      </Popover>
      <button
        onClick={onClear}
        className="px-2 py-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("notes.speaker.deselectAll")}
      </button>
    </div>
  );
}

interface MeetingTranscriptChatProps {
  segments: TranscriptSegment[];
  /** Utterances still in flight, one bubble each (utils/liveUtterances.ts). */
  liveUtterances?: LiveUtterance[];
  speakerMappings?: Record<string, string>;
  speakerProfiles?: SpeakerProfileLite[];
  participants?: Array<{ email: string; displayName: string | null }>;
  selectedSegmentIds?: Set<string>;
  isRecording?: boolean;
  isDiarizing?: boolean;
  sessionDiarizationEnabled?: boolean;
  sessionExpectedCount?: number;
  userTouchedStepper?: boolean;
  onSetSessionDiarizationEnabled?: (enabled: boolean) => void;
  onSetSessionExpectedCount?: (count: number) => void;
  onMapSpeaker?: (
    speakerId: string,
    displayName: string,
    email?: string | null,
    profileId?: number
  ) => void;
  onConfirmSuggestion?: (speakerId: string, suggestedName: string, profileId: number) => void;
  onDismissSuggestion?: (speakerId: string) => void;
  onAttachSpeakerEmail?: (profileId: number, email: string | null) => void;
  onToggleSelect?: (segmentId: string) => void;
}

export function MeetingTranscriptChat({
  segments,
  liveUtterances,
  speakerMappings,
  speakerProfiles,
  participants,
  selectedSegmentIds,
  isRecording,
  isDiarizing,
  sessionDiarizationEnabled = true,
  sessionExpectedCount = 2,
  userTouchedStepper = false,
  onSetSessionDiarizationEnabled,
  onSetSessionExpectedCount,
  onMapSpeaker,
  onConfirmSuggestion,
  onDismissSuggestion,
  onAttachSpeakerEmail,
  onToggleSelect,
}: MeetingTranscriptChatProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const [hintDismissed, setHintDismissed] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [visibleCount, setVisibleCount] = useState(SEGMENT_WINDOW);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const updateStickyScroll = () => {
      const stuck = el.scrollHeight - el.scrollTop - el.clientHeight < STICKY_SCROLL_THRESHOLD_PX;
      shouldStickToBottomRef.current = stuck;
      // Mirrored into state only for the Jump to live affordance; the ref is
      // what the scroll effect reads, so this cannot make scrolling depend on
      // a render having happened first.
      setAtBottom((previous) => (previous === stuck ? previous : stuck));
    };

    updateStickyScroll();
    el.addEventListener("scroll", updateStickyScroll, { passive: true });
    return () => el.removeEventListener("scroll", updateStickyScroll);
  }, []);

  // Set just before revealing earlier messages: the distance from the bottom of
  // the content, which prepending rows does not change (whereas scrollTop does).
  const restoreFromBottomRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const anchor = restoreFromBottomRef.current;
    if (anchor !== null) {
      // Rows were prepended. Keeping scrollTop would drop the reader wherever
      // the newly revealed block happens to end; holding the distance from the
      // bottom keeps the line they were reading exactly where it was.
      restoreFromBottomRef.current = null;
      el.scrollTop = el.scrollHeight - anchor;
      return;
    }

    if (!shouldStickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [segments, liveUtterances, visibleCount]);

  const live = liveUtterances ?? [];
  const hasContent = segments.length > 0 || live.length > 0;

  // Only the tail is rendered; see utils/transcriptWindow.ts for why this is a
  // window rather than the virtualizer used elsewhere in the app.
  const {
    firstVisibleIndex,
    visible: visibleSegments,
    hiddenCount,
  } = windowTranscript(segments, visibleCount);

  const showEarlier = () => {
    const el = scrollRef.current;
    restoreFromBottomRef.current = el ? el.scrollHeight - el.scrollTop : null;
    setVisibleCount((count) => count + SEGMENT_WINDOW);
  };

  const jumpToLive = () => {
    const el = scrollRef.current;
    if (!el) return;
    shouldStickToBottomRef.current = true;
    el.scrollTop = el.scrollHeight;
  };

  const colorByKey = useMemo(() => {
    const map = new Map<string, number>();
    let nextIdx = 0;
    for (const segment of segments) {
      if (segment.source === "mic" && !segment.speaker) continue;
      if (segment.speaker === "you") continue;
      const key = getEffectiveSpeakerKey(segment, speakerMappings);
      if (!map.has(key)) {
        map.set(key, nextIdx % SPEAKER_COLORS.length);
        nextIdx += 1;
      }
    }
    return map;
  }, [segments, speakerMappings]);

  if (!hasContent) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-subtle bg-surface-2 text-muted-foreground/60">
          <MessageSquareText size={14} />
        </span>
        <p className="text-xs text-muted-foreground/70 select-none text-center text-balance">
          {t("notes.editor.conversationWillAppear")}
        </p>
      </div>
    );
  }

  const isSelfSide = (segment: TranscriptSegment): boolean => {
    const mapped = segment.speaker ? speakerMappings?.[segment.speaker] : undefined;
    if (mapped) return mapped.trim().toLowerCase() === t("notes.speaker.you").toLowerCase();
    if (segment.speaker === "you") return true;
    if (segment.speakerName) return false;
    return segment.source === "mic";
  };

  const others = Math.max(0, sessionExpectedCount - 1);

  return (
    <div className="h-full relative">
      {/* The speaker pill — expected-count stepper, per-session toggle,
          "identifying…" status — is entirely about identification. With it off
          none of those controls change anything, so the pill would just hover
          over every meeting offering switches that do nothing. */}
      {SPEAKER_IDENTIFICATION_ENABLED && (isRecording || isDiarizing) && !hintDismissed && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-2 py-1 rounded-lg border border-border-subtle bg-popover/95 backdrop-blur-xl shadow-elevated text-[11px] text-foreground">
          {isDiarizing ? (
            <Loader2 size={12} className="animate-spin text-muted-foreground" />
          ) : (
            <Sparkles
              size={12}
              className={cn(sessionDiarizationEnabled ? "text-primary" : "text-muted-foreground")}
            />
          )}
          <span>
            {isDiarizing
              ? t("notes.speaker.pill.finalizing")
              : sessionDiarizationEnabled
                ? others === 1 && !(participants && participants.length > 0) && !userTouchedStepper
                  ? t("notes.speaker.pill.defaultingHint")
                  : t("notes.speaker.pill.identifying")
                : t("notes.speaker.pill.notLabeled")}
          </span>
          {!isDiarizing && sessionDiarizationEnabled && (
            <>
              <span className="text-muted-foreground">
                {others === 0
                  ? t("notes.speaker.pill.justYou")
                  : t("notes.speaker.pill.othersInCall", { count: others })}
              </span>
              <div className="flex items-center overflow-hidden rounded-md border border-border-subtle bg-input">
                <button
                  onClick={() => onSetSessionExpectedCount?.(sessionExpectedCount - 1)}
                  disabled={others <= 0}
                  className="px-1.5 py-0.5 leading-none hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  aria-label={t("notes.speaker.pill.decAria")}
                >
                  −
                </button>
                <span
                  data-numeric
                  className="px-1.5 font-medium border-x border-border-subtle"
                  aria-live="polite"
                >
                  {others}
                </span>
                <button
                  onClick={() => onSetSessionExpectedCount?.(sessionExpectedCount + 1)}
                  disabled={others >= MAX_SPEAKER_COUNT - 1}
                  className="px-1.5 py-0.5 leading-none hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  aria-label={t("notes.speaker.pill.incAria")}
                >
                  +
                </button>
              </div>
            </>
          )}
          {!isDiarizing && (
            <div className="scale-75">
              <Toggle
                checked={sessionDiarizationEnabled}
                onChange={(next) => onSetSessionDiarizationEnabled?.(next)}
              />
            </div>
          )}
          <button
            onClick={() => setHintDismissed(true)}
            aria-label={t("notes.speaker.pill.dismissAria")}
            className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X size={11} />
          </button>
        </div>
      )}
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto px-4 pt-3 pb-24 flex flex-col gap-1.5 agent-chat-scroll"
      >
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={showEarlier}
            className="mx-auto mb-1 rounded-md border border-border-subtle bg-surface-2 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("notes.transcript.showEarlier", { count: hiddenCount })}
          </button>
        )}

        {visibleSegments.map((segment, windowIndex) => {
          // Indexed against the full list, so the first rendered row still knows
          // whether the segment above it — hidden or not — was the same speaker.
          const i = firstVisibleIndex + windowIndex;
          const selfSide = isSelfSide(segment);
          const prevSegment = i > 0 ? segments[i - 1] : null;
          const sameSpeaker = prevSegment
            ? getEffectiveSpeakerKey(prevSegment, speakerMappings) ===
              getEffectiveSpeakerKey(segment, speakerMappings)
            : false;

          const hasSpeaker = !!segment.speaker;
          const isOriginallyYou = segment.speaker === "you";
          const isSystemSpeaker = hasSpeaker && !selfSide;
          const effectiveKey = getEffectiveSpeakerKey(segment, speakerMappings);
          const colorIdx = isSystemSpeaker ? (colorByKey.get(effectiveKey) ?? 0) : 0;
          const isSelected = selectedSegmentIds?.has(segment.id) ?? false;
          const selectable = !!onToggleSelect;

          const activeName = resolveSegmentSpeakerName(segment, speakerMappings);
          const matchedProfile =
            activeName && speakerProfiles
              ? speakerProfiles.find((p) => p.id != null && p.display_name === activeName)
              : undefined;
          const canAddContact =
            !!matchedProfile &&
            matchedProfile.id != null &&
            !matchedProfile.email &&
            !!onAttachSpeakerEmail;

          const labelElement = hasSpeaker && (
            <div className="flex items-center gap-1">
              <SpeakerLabel
                speakerId={segment.speaker!}
                segment={segment}
                resolvedName={activeName}
                speakerProfiles={speakerProfiles}
                participants={participants}
                colorIdx={colorIdx}
                isOriginallyYou={isOriginallyYou}
                onMap={onMapSpeaker}
                onConfirm={onConfirmSuggestion}
                onDismiss={onDismissSuggestion}
                t={t}
              />
              {canAddContact && matchedProfile && matchedProfile.id != null && (
                <AddContactButton
                  profile={{ id: matchedProfile.id, display_name: matchedProfile.display_name }}
                  onAttachEmail={onAttachSpeakerEmail!}
                  t={t}
                />
              )}
            </div>
          );

          return (
            <div
              key={segment.id}
              className={cn(
                "group flex flex-col",
                selfSide ? "items-start" : "items-end",
                !sameSpeaker && i > 0 && "mt-2",
                selectable && (selfSide ? "pl-6" : "pr-6")
              )}
              style={{ animation: "agent-message-in 200ms ease-out both" }}
            >
              {/* Unlabelled runs still get a track caption, so "you" and "the
                  room" never rely on alignment alone. Both sides, not just the
                  mic: with speaker identification off (the V1 default) no
                  system segment carries a speaker, and captioning only one
                  side leaves half the transcript anonymous. Same keys the
                  export path resolves to, so the pane and the exported file
                  call the two tracks the same thing. */}
              {!labelElement && !sameSpeaker && (
                <span className="mb-0.5 px-1 text-[11px] font-medium text-muted-foreground/60">
                  {t(selfSide ? "transcript.speaker.you" : "transcript.speaker.others")}
                </span>
              )}
              {labelElement && !sameSpeaker && labelElement}
              {labelElement && sameSpeaker && (
                <div
                  className={cn(
                    "grid grid-rows-[0fr] opacity-0 pointer-events-none transition-[grid-template-rows,opacity] duration-150 ease-out",
                    "group-hover:grid-rows-[1fr] group-hover:opacity-100 group-hover:pointer-events-auto"
                  )}
                >
                  <div className="overflow-hidden">{labelElement}</div>
                </div>
              )}
              <div className="relative max-w-[80%]">
                <div
                  className={cn(
                    "px-3 py-1.5 cursor-default transition-colors",
                    "text-[13px] leading-relaxed text-foreground",
                    selfSide
                      ? cn(
                          "bg-primary-subtle/70 border border-primary/25 border-l-2 border-l-primary",
                          sameSpeaker ? "rounded-lg rounded-tl-sm" : "rounded-lg rounded-bl-sm"
                        )
                      : cn(
                          "bg-surface-2 border border-border-subtle",
                          sameSpeaker ? "rounded-lg rounded-tr-sm" : "rounded-lg rounded-br-sm",
                          isSystemSpeaker
                            ? cn("border-r-2", SPEAKER_BORDER_COLORS[colorIdx])
                            : "border-r-2 border-r-border-hover"
                        ),
                    isSelected && "ring-2 ring-primary/60"
                  )}
                >
                  {segment.text}
                </div>
                {selectable && (
                  <SelectCheckbox
                    isSelected={isSelected}
                    onToggle={() => onToggleSelect?.(segment.id)}
                    className={cn("absolute top-1.5", selfSide ? "-left-6" : "-right-6")}
                  />
                )}
              </div>
            </div>
          );
        })}

        {/* One bubble per utterance in flight. Keyed by utterance rather than by
            source, so two people talking at once each keep their own line
            instead of overwriting one another. */}
        {live.map((utterance) => {
          // Falls back to the track name rather than to nothing: with speaker
          // identification off there is no speakerId to number, and an
          // unlabelled bubble makes the live pane read as less certain than
          // the settled transcript above it, which says "Others".
          const speakerLabel =
            utterance.source === "system"
              ? (utterance.speakerName ??
                (utterance.speakerId
                  ? t("notes.speaker.label", { n: getSpeakerNumber(utterance.speakerId) })
                  : t("transcript.speaker.others")))
              : t("transcript.speaker.you");
          return (
            <PartialBubble
              key={utterance.key}
              text={utterance.text}
              source={utterance.source}
              speakerLabel={speakerLabel}
              speakerState={
                utterance.source === "system" && utterance.speakerId
                  ? utterance.speakerName
                    ? "confirmed"
                    : "provisional"
                  : undefined
              }
              t={t}
            />
          );
        })}
      </div>

      {/* Scrolling back through a live meeting silently stops the pane from
          following the speaker. Without a way back, the transcript looks frozen
          — so say so, and offer the ride back. */}
      {!atBottom && hasContent && (
        <button
          type="button"
          onClick={jumpToLive}
          className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border-subtle bg-popover/95 px-3 py-1.5 text-[11px] font-medium text-foreground shadow-elevated backdrop-blur-xl transition-colors hover:bg-surface-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowDown size={12} />
          {isRecording ? t("notes.transcript.jumpToLive") : t("notes.transcript.jumpToLatest")}
        </button>
      )}
    </div>
  );
}
