import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useUpperLayerDismissGuard } from "./ui/useUpperLayerDismissGuard";
import {
  Search,
  FileText,
  Mic,
  Folder,
  Lock,
  Settings,
  Users,
  Upload,
  MessageSquare,
  ChevronDown,
  CornerDownLeft,
  X,
} from "lucide-react";
import { cn } from "./lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import type { NoteItem, FolderItem, SpaceItem, TranscriptionItem } from "../types/electron.js";
import { formatRelativeTime } from "../utils/dateFormatting";
import { SETTINGS_SECTIONS, type SettingsSectionType } from "./settings/settingsNav";

interface ConversationResult {
  id: number;
  title: string;
  last_message?: string;
  updated_at: string;
}

interface JumpTarget {
  key: string;
  spaceId: number;
  folderId: number | null;
  label: string;
  space: SpaceItem | undefined;
}

export interface CommandSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "all" | "conversations";
  /**
   * "modal" is the centered dialog over a dimmed backdrop (chat history).
   * "header" drops the panel from under the window header with no dimming —
   * the same shape as the assistant bar's palette, which is where the
   * header's search field learned its manners.
   */
  variant?: "modal" | "header";
  transcriptions?: TranscriptionItem[];
  onNoteSelect?: (noteId: number, folderId: number | null, spaceId?: number) => void;
  onContainerSelect?: (spaceId: number, folderId: number | null) => void;
  onTranscriptSelect?: (transcriptId: number) => void;
  onConversationSelect?: (conversationId: number) => void;
  /** Offered when set: typing a Settings destination's name surfaces it. */
  onSettingsSelect?: (section: SettingsSectionType) => void;
}

interface SettingsTarget {
  id: SettingsSectionType;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
}

type FlatItem =
  | { kind: "container"; target: JumpTarget }
  | { kind: "settings"; target: SettingsTarget }
  | { kind: "note"; note: NoteItem }
  | { kind: "transcript"; transcript: TranscriptionItem }
  | { kind: "conversation"; conversation: ConversationResult };

/** One geometry for every result row, so the palette reads as a single list. */
function commandRowClass(isSelected: boolean): string {
  return cn(
    "group/row relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left",
    "outline-none transition-colors duration-100 ease-snap",
    isSelected ? "bg-primary/10 dark:bg-primary/15" : "hover:bg-surface-3"
  );
}

function rowIconClass(isSelected: boolean): string {
  return cn("shrink-0 transition-colors", isSelected ? "text-primary" : "text-muted-foreground");
}

/** Fixed-width tail slot: the Enter hint swaps in without moving the row. */
function EnterHint({ isSelected }: { isSelected: boolean }) {
  return (
    <span className="flex w-3.5 shrink-0 justify-end" aria-hidden="true">
      {isSelected && <CornerDownLeft size={12} className="text-primary" />}
    </span>
  );
}

const paletteKbdClass = [
  "inline-flex h-4 min-w-4 items-center justify-center rounded-[3px] px-1",
  "border border-border-subtle bg-surface-3 font-mono text-[10px] leading-none text-muted-foreground",
].join(" ");

const metaTimeClass = "shrink-0 tabular-figures text-[10px] text-muted-foreground/70";

function stripMarkdownPreview(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, "")
    .replace(/[*_~`]+/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n+/g, " ")
    .trim();
}

export default function CommandSearch({
  open,
  onOpenChange,
  mode = "all",
  variant = "modal",
  transcriptions = [],
  onNoteSelect,
  onContainerSelect,
  onTranscriptSelect,
  onConversationSelect,
  onSettingsSelect,
}: CommandSearchProps) {
  const { t } = useTranslation();
  // Same guard the shared DialogContent carries: an outside click that
  // dismisses a layer above this one must not close the palette too.
  const { guardInteractOutside, setContentRef } =
    useUpperLayerDismissGuard<React.ElementRef<typeof DialogPrimitive.Content>>();
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [spaces, setSpaces] = useState<SpaceItem[]>([]);
  const [scopeSpaceId, setScopeSpaceId] = useState<number | null>(null);
  const [conversations, setConversations] = useState<ConversationResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchVersionRef = useRef(0);
  const isConversationsMode = mode === "conversations";
  const [prevOpen, setPrevOpen] = useState(open);
  const [prevNotes, setPrevNotes] = useState(notes);
  const [prevQuery, setPrevQuery] = useState(query);

  useEffect(() => {
    if (isConversationsMode) return;
    window.electronAPI
      .getFolders()
      .then(setFolders)
      .catch(() => {});
    window.electronAPI
      .getSpaces?.()
      .then((items) => setSpaces(items ?? []))
      .catch(() => {});
  }, [isConversationsMode]);

  if (open && !prevOpen) {
    setPrevOpen(open);
    setQuery("");
    setScopeSpaceId(null);
    setSelectedIndex(0);
  } else if (open !== prevOpen) {
    setPrevOpen(open);
  }

  useEffect(() => {
    if (!open) return;
    if (isConversationsMode) {
      window.electronAPI?.getAgentConversationsWithPreview?.(20, 0, false).then((r) => {
        if (r)
          setConversations(
            r.map((c) => ({
              id: c.id,
              title: c.title || "Untitled",
              last_message: c.last_message,
              updated_at: c.updated_at,
            }))
          );
      });
    } else {
      window.electronAPI
        .getNotes()
        .then(setNotes)
        .catch(() => {});
    }
  }, [open, isConversationsMode]);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const version = ++searchVersionRef.current;

    if (isConversationsMode) {
      if (!query.trim()) {
        window.electronAPI?.getAgentConversationsWithPreview?.(20, 0, false).then((r) => {
          if (searchVersionRef.current === version && r) {
            setConversations(
              r.map((c) => ({
                id: c.id,
                title: c.title || "Untitled",
                last_message: c.last_message,
                updated_at: c.updated_at,
              }))
            );
          }
        });
        return;
      }
      searchTimerRef.current = setTimeout(async () => {
        try {
          const r = await window.electronAPI?.semanticSearchConversations?.(query, 20);
          if (searchVersionRef.current === version && r) {
            setConversations(
              r.map((c) => ({
                id: c.id,
                title: c.title || "Untitled",
                last_message: c.last_message,
                updated_at: c.updated_at,
              }))
            );
          }
        } catch {
          /* keep current */
        }
      }, 200);
    } else {
      if (!query.trim()) {
        window.electronAPI
          .getNotes()
          .then(setNotes)
          .catch(() => {});
        return;
      }
      searchTimerRef.current = setTimeout(async () => {
        // Meaning-aware search, same hybrid ranking the AI agent uses:
        // passages + whole notes + keyword, fused, with the matched passage
        // attached so the row can show *why* a note matched. Main degrades it
        // to keyword-only while the vector index is still starting, and the
        // keyword path stays as the fallback for anything else.
        try {
          const results =
            (await window.electronAPI.semanticSearchNotes?.(query, 20, scopeSpaceId, null)) ??
            (await window.electronAPI.searchNotes(query, undefined, scopeSpaceId));
          // Semantic latency varies with the embedder, so an older in-flight
          // search can finish after a newer one — drop it, don't show it.
          if (searchVersionRef.current === version) setNotes(results);
        } catch {
          try {
            const results = await window.electronAPI.searchNotes(query, undefined, scopeSpaceId);
            if (searchVersionRef.current === version) setNotes(results);
          } catch {
            /* keep current */
          }
        }
      }, 200);
    }

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query, isConversationsMode, scopeSpaceId]);

  if (notes !== prevNotes || query !== prevQuery) {
    setPrevNotes(notes);
    setPrevQuery(query);
    setSelectedIndex(0);
  }

  const folderMap = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const spaceMap = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);
  const scopeSpace = scopeSpaceId != null ? spaceMap.get(scopeSpaceId) : undefined;

  // Scoping re-filters the visible list immediately, so the keyboard
  // highlight must restart from the top.
  const selectScope = useCallback((spaceId: number | null) => {
    setScopeSpaceId(spaceId);
    setSelectedIndex(0);
  }, []);

  // The search leg scopes at the DB; this also covers browsed (empty-query)
  // results and stale in-flight results after a scope switch.
  const scopedNotes = useMemo(
    () => (scopeSpaceId == null ? notes : notes.filter((n) => n.space_id === scopeSpaceId)),
    [notes, scopeSpaceId]
  );

  const spaceLabel = useCallback(
    (space: SpaceItem) =>
      space.kind === "private"
        ? t("notes.spaces.personal")
        : `${space.emoji ? `${space.emoji} ` : ""}${space.name}`,
    [t]
  );

  const noteBreadcrumb = useCallback(
    (note: NoteItem) => {
      const space = spaceMap.get(note.space_id);
      const folder = note.folder_id != null ? folderMap.get(note.folder_id) : undefined;
      if (!space) return folder?.name ?? "";
      return folder ? `${spaceLabel(space)} / ${folder.name}` : spaceLabel(space);
    },
    [spaceMap, folderMap, spaceLabel]
  );

  const jumpTargets = useMemo<JumpTarget[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q || isConversationsMode) return [];
    const targets: JumpTarget[] = [];
    for (const space of spaces) {
      const label = spaceLabel(space);
      if (label.toLowerCase().includes(q)) {
        targets.push({ key: `s:${space.id}`, spaceId: space.id, folderId: null, label, space });
      }
    }
    for (const folder of folders) {
      if (folder.name.toLowerCase().includes(q)) {
        targets.push({
          key: `f:${folder.id}`,
          spaceId: folder.space_id,
          folderId: folder.id,
          label: folder.name,
          space: spaceMap.get(folder.space_id),
        });
      }
    }
    return targets.slice(0, 5);
  }, [query, spaces, folders, spaceMap, spaceLabel, isConversationsMode]);

  const filteredTranscripts = useMemo(() => {
    const slice = query.trim()
      ? transcriptions.filter((tr) => tr.text.toLowerCase().includes(query.toLowerCase()))
      : transcriptions;
    return slice.slice(0, 5);
  }, [transcriptions, query]);

  // Settings destinations, same IA as the assistant bar's palette (both draw
  // from SETTINGS_SECTIONS). Query-gated: an empty query browses notes, and a
  // list of Settings rows above them would push the content down for a need
  // the sidebar already serves.
  const settingsTargets = useMemo<SettingsTarget[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q || isConversationsMode || !onSettingsSelect) return [];
    return SETTINGS_SECTIONS.map((section) => ({
      id: section.id,
      label: t(section.labelKey),
      icon: section.icon,
    })).filter((target) => target.label.toLowerCase().includes(q));
  }, [query, isConversationsMode, onSettingsSelect, t]);

  const flatItems = useMemo<FlatItem[]>(() => {
    if (isConversationsMode) {
      return conversations.map((c) => ({ kind: "conversation" as const, conversation: c }));
    }
    const items: FlatItem[] = [];
    for (const target of jumpTargets) items.push({ kind: "container", target });
    for (const target of settingsTargets) items.push({ kind: "settings", target });
    for (const note of scopedNotes) items.push({ kind: "note", note });
    for (const transcript of filteredTranscripts) items.push({ kind: "transcript", transcript });
    return items;
  }, [
    jumpTargets,
    settingsTargets,
    scopedNotes,
    filteredTranscripts,
    conversations,
    isConversationsMode,
  ]);

  const selectItem = useCallback(
    (item: FlatItem) => {
      if (item.kind === "container") onContainerSelect?.(item.target.spaceId, item.target.folderId);
      else if (item.kind === "settings") onSettingsSelect?.(item.target.id);
      else if (item.kind === "note")
        onNoteSelect?.(item.note.id, item.note.folder_id ?? null, item.note.space_id);
      else if (item.kind === "transcript") onTranscriptSelect?.(item.transcript.id);
      else if (item.kind === "conversation") onConversationSelect?.(item.conversation.id);
      onOpenChange(false);
    },
    [
      onNoteSelect,
      onContainerSelect,
      onTranscriptSelect,
      onConversationSelect,
      onSettingsSelect,
      onOpenChange,
    ]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = flatItems[selectedIndex];
        if (item) selectItem(item);
      }
    },
    [flatItems, selectedIndex, selectItem]
  );

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const hasResults = flatItems.length > 0;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* The header variant dims nothing: it reads as a dropdown unfolding
            from the header's field — the bar palette's manner — and the page
            behind stays the page. The overlay still exists (transparent) so
            an outside click closes it. */}
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50",
            variant === "modal" &&
              "bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          )}
        />
        <DialogPrimitive.Content
          ref={setContentRef}
          onInteractOutside={guardInteractOutside}
          className={cn(
            "fixed left-[50%] z-50 w-full max-w-xl translate-x-[-50%]",
            "rounded-xl border border-border bg-popover overflow-hidden",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=open]:slide-in-from-left-1/2 data-[state=closed]:slide-out-to-left-1/2",
            variant === "modal"
              ? cn(
                  "top-[18%] shadow-(--shadow-modal)",
                  "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
                  "data-[state=open]:slide-in-from-top-[44%] data-[state=closed]:slide-out-to-top-[44%]"
                )
              : cn(
                  // Just under the window header, where the field that opened
                  // it lives; a short slide sells the "menu appearing" read.
                  "top-[46px] shadow-(--shadow-elevated)",
                  "data-[state=open]:slide-in-from-top-2 data-[state=closed]:slide-out-to-top-2"
                )
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            {t("commandSearch.title")}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {t("commandSearch.description")}
          </DialogPrimitive.Description>

          {/* Search input */}
          <div className="flex h-12 items-center gap-2.5 border-b border-border-subtle px-3.5">
            <Search size={15} className="shrink-0 text-muted-foreground" />
            {!isConversationsMode && spaces.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface-2",
                      "h-6 px-1.5 text-[11px] outline-none transition-colors duration-150 ease-snap",
                      "hover:border-border-hover focus-visible:ring-2 focus-visible:ring-ring",
                      scopeSpace ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="truncate max-w-32">
                      {scopeSpace ? spaceLabel(scopeSpace) : t("commandSearch.allSpaces")}
                    </span>
                    <ChevronDown size={11} className="shrink-0 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  onCloseAutoFocus={(e) => {
                    e.preventDefault();
                    inputRef.current?.focus();
                  }}
                >
                  <DropdownMenuItem onSelect={() => selectScope(null)}>
                    {t("commandSearch.allSpaces")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {spaces.map((space) => (
                    <DropdownMenuItem key={space.id} onSelect={() => selectScope(space.id)}>
                      {spaceLabel(space)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isConversationsMode ? t("chat.search") : t("commandSearch.placeholder")}
              autoFocus
              className="flex-1 text-sm text-foreground placeholder:text-muted-foreground/70"
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                boxShadow: "none",
                padding: 0,
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("commandSearch.clearQuery")}
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground",
                  "outline-none transition-colors duration-150 ease-snap",
                  "hover:bg-surface-3 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                )}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Results list */}
          <div ref={listRef} className="max-h-[360px] overflow-y-auto p-1.5">
            {!hasResults ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12">
                <Search size={18} className="text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">
                  {query.trim()
                    ? t("commandSearch.noResults")
                    : isConversationsMode
                      ? t("chat.noConversations")
                      : t("commandSearch.emptyState")}
                </p>
              </div>
            ) : isConversationsMode ? (
              conversations.map((conv, idx) => (
                <button
                  key={conv.id}
                  type="button"
                  data-idx={idx}
                  aria-selected={selectedIndex === idx}
                  onClick={() => selectItem({ kind: "conversation", conversation: conv })}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={commandRowClass(selectedIndex === idx)}
                >
                  <MessageSquare size={13} className={rowIconClass(selectedIndex === idx)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{conv.title}</p>
                    {conv.last_message && (
                      <p className="mt-px truncate text-[11px] text-muted-foreground">
                        {conv.last_message.slice(0, 90)}
                      </p>
                    )}
                  </div>
                  <span className={metaTimeClass}>{formatRelativeTime(conv.updated_at, t)}</span>
                  <EnterHint isSelected={selectedIndex === idx} />
                </button>
              ))
            ) : (
              <>
                {jumpTargets.length > 0 && (
                  <div>
                    <SectionHeader
                      icon={<Folder size={11} />}
                      label={t("commandSearch.sections.jumpTo")}
                    />
                    {jumpTargets.map((target) => {
                      const idx = flatItems.findIndex(
                        (fi) => fi.kind === "container" && fi.target.key === target.key
                      );
                      return (
                        <ContainerRow
                          key={target.key}
                          target={target}
                          showSpaceHint={target.folderId != null && spaces.length > 1}
                          spaceLabel={spaceLabel}
                          idx={idx}
                          isSelected={selectedIndex === idx}
                          onSelect={() => selectItem({ kind: "container", target })}
                          onHover={() => setSelectedIndex(idx)}
                        />
                      );
                    })}
                  </div>
                )}

                {settingsTargets.length > 0 && (
                  <div className={jumpTargets.length > 0 ? "mt-0.5" : ""}>
                    <SectionHeader icon={<Settings size={11} />} label={t("settingsModal.title")} />
                    {settingsTargets.map((target) => {
                      const idx = flatItems.findIndex(
                        (fi) => fi.kind === "settings" && fi.target.id === target.id
                      );
                      const TargetIcon = target.icon;
                      return (
                        <button
                          key={target.id}
                          type="button"
                          data-idx={idx}
                          aria-selected={selectedIndex === idx}
                          onClick={() => selectItem({ kind: "settings", target })}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          className={commandRowClass(selectedIndex === idx)}
                        >
                          <TargetIcon size={13} className={rowIconClass(selectedIndex === idx)} />
                          <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                            {target.label}
                          </p>
                          <EnterHint isSelected={selectedIndex === idx} />
                        </button>
                      );
                    })}
                  </div>
                )}

                {scopedNotes.length > 0 && (
                  <div
                    className={jumpTargets.length > 0 || settingsTargets.length > 0 ? "mt-0.5" : ""}
                  >
                    <SectionHeader
                      icon={<FileText size={11} />}
                      label={t("commandSearch.sections.notes")}
                    />
                    {scopedNotes.map((note) => {
                      const idx = flatItems.findIndex(
                        (fi) => fi.kind === "note" && fi.note.id === note.id
                      );
                      return (
                        <NoteRow
                          key={note.id}
                          note={note}
                          breadcrumb={noteBreadcrumb(note)}
                          idx={idx}
                          isSelected={selectedIndex === idx}
                          onSelect={() => selectItem({ kind: "note", note })}
                          onHover={() => setSelectedIndex(idx)}
                          t={t}
                        />
                      );
                    })}
                  </div>
                )}

                {filteredTranscripts.length > 0 && (
                  <div
                    className={
                      jumpTargets.length > 0 || settingsTargets.length > 0 || scopedNotes.length > 0
                        ? "mt-0.5"
                        : ""
                    }
                  >
                    <SectionHeader
                      icon={<Mic size={11} />}
                      label={t("commandSearch.sections.transcripts")}
                    />
                    {filteredTranscripts.map((transcript) => {
                      const idx = flatItems.findIndex(
                        (fi) => fi.kind === "transcript" && fi.transcript.id === transcript.id
                      );
                      return (
                        <TranscriptRow
                          key={transcript.id}
                          transcript={transcript}
                          idx={idx}
                          isSelected={selectedIndex === idx}
                          onSelect={() => selectItem({ kind: "transcript", transcript })}
                          onHover={() => setSelectedIndex(idx)}
                          t={t}
                        />
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 border-t border-border-subtle bg-surface-1 px-3.5 py-2">
            <FooterHint keys={["↑", "↓"]} label={t("commandSearch.footer.navigate")} />
            <FooterHint keys={["↵"]} label={t("commandSearch.footer.open")} />
            <FooterHint keys={["Esc"]} label={t("commandSearch.footer.dismiss")} />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 pt-2 pb-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span aria-hidden="true" className="ml-1 h-px flex-1 bg-border-subtle" />
    </div>
  );
}

function ContainerRow({
  target,
  showSpaceHint,
  spaceLabel,
  idx,
  isSelected,
  onSelect,
  onHover,
}: {
  target: JumpTarget;
  showSpaceHint: boolean;
  spaceLabel: (space: SpaceItem) => string;
  idx: number;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  const { space } = target;
  const iconClass = rowIconClass(isSelected);
  return (
    <button
      type="button"
      data-idx={idx}
      aria-selected={isSelected}
      onClick={onSelect}
      onMouseEnter={onHover}
      className={commandRowClass(isSelected)}
    >
      {target.folderId != null ? (
        <Folder size={13} className={iconClass} />
      ) : space?.kind === "private" ? (
        <Lock size={13} className={iconClass} />
      ) : space?.emoji ? (
        <span className="shrink-0 text-[13px] leading-none" aria-hidden="true">
          {space.emoji}
        </span>
      ) : (
        <Users size={13} className={iconClass} />
      )}
      <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{target.label}</p>
      {showSpaceHint && space && (
        <span className="max-w-32 shrink-0 truncate text-[10px] text-muted-foreground">
          {spaceLabel(space)}
        </span>
      )}
      <EnterHint isSelected={isSelected} />
    </button>
  );
}

function NoteRow({
  note,
  breadcrumb,
  idx,
  isSelected,
  onSelect,
  onHover,
  t,
}: {
  note: NoteItem;
  breadcrumb: string;
  idx: number;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  // The passage that matched beats the note's opening line: for a long
  // meeting note, the opening tells you nothing about why it is in the list.
  const matched = note.matched_snippet?.replace(/\s+/g, " ").trim();
  const preview = (matched || stripMarkdownPreview(note.content)).slice(0, 90);
  const NoteIcon =
    note.note_type === "meeting" ? Users : note.note_type === "upload" ? Upload : FileText;
  return (
    <button
      type="button"
      data-idx={idx}
      aria-selected={isSelected}
      onClick={onSelect}
      onMouseEnter={onHover}
      className={commandRowClass(isSelected)}
    >
      <NoteIcon size={13} className={rowIconClass(isSelected)} />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-xs font-medium",
            note.title ? "text-foreground" : "italic text-muted-foreground"
          )}
        >
          {note.title || t("notes.list.untitled")}
        </p>
        {(breadcrumb || preview) && (
          <p className="mt-px truncate text-[10px] text-muted-foreground">
            {breadcrumb && <span>{breadcrumb}</span>}
            {breadcrumb && preview && <span className="text-muted-foreground/50"> · </span>}
            {preview && <span className="text-muted-foreground/80">{preview}</span>}
          </p>
        )}
      </div>
      <span className={metaTimeClass}>{formatRelativeTime(note.updated_at, t)}</span>
      <EnterHint isSelected={isSelected} />
    </button>
  );
}

function TranscriptRow({
  transcript,
  idx,
  isSelected,
  onSelect,
  onHover,
  t,
}: {
  transcript: TranscriptionItem;
  idx: number;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <button
      type="button"
      data-idx={idx}
      aria-selected={isSelected}
      onClick={onSelect}
      onMouseEnter={onHover}
      className={commandRowClass(isSelected)}
    >
      <Mic size={13} className={rowIconClass(isSelected)} />
      <p className="min-w-0 flex-1 truncate text-xs text-foreground">{transcript.text}</p>
      <span className={metaTimeClass}>{formatRelativeTime(transcript.created_at, t)}</span>
      <EnterHint isSelected={isSelected} />
    </button>
  );
}

function FooterHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center gap-1">
      {keys.map((k) => (
        <kbd key={k} className={paletteKbdClass}>
          {k}
        </kbd>
      ))}
      <span className="ml-0.5 text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}
