import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Copy,
  Check,
  Search,
  FileText,
  ChevronDown,
  ChevronRight,
  CircleAlert,
} from "lucide-react";
import { cn } from "../lib/utils";
import { MarkdownRenderer } from "../ui/MarkdownRenderer";
import type { MessageSource, ToolCallInfo } from "./types";
import { resolveMessageSources } from "./messageSources";
import { extractNoteCards } from "./noteCards";
import { renderCitations, renderStreamingCitations } from "../../utils/chatCitations";
import { toolIcons } from "./toolIcons";
import { groupToolCalls } from "../../utils/toolCallGroups";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming: boolean;
  toolCalls?: ToolCallInfo[];
  sources?: MessageSource[];
  onOpenNote?: (noteId: number) => void;
}

/**
 * One activity row per tool NAME, not per call: `calls` is a group from
 * groupToolCalls. An agent that reads four notes shows one "Reading note…"
 * shimmer while it works and one settled row with a ×4 count after — four
 * stacked identical rows read as stutter, which the client called out.
 */
function ToolCallStep({ calls }: { calls: ToolCallInfo[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const name = calls[0].name;
  const count = calls.length;
  const Icon = toolIcons[name] || Search;
  const isExecuting = calls.some((call) => call.status === "executing");
  const firstError = calls.find((call) => call.status === "error");
  const isError = !isExecuting && !!firstError;
  const isCompleted = !isExecuting && !isError;
  const isClipboard = name === "copy_to_clipboard" && isCompleted;

  // The settled row leads with the freshest result; expanding lists every
  // call's result, one per line, so nothing the agent did is hidden.
  const lastResult = [...calls].reverse().find((call) => call.result)?.result;
  const detailText = calls
    .map((call) => call.result)
    .filter(Boolean)
    .join("\n");
  const resultLines = detailText.split("\n");
  const hasDetail = (resultLines.length > 1 || count > 1) && !isClipboard;

  const countBadge = count > 1 && (
    <span data-numeric className="shrink-0 text-[11px] text-muted-foreground/50">
      ×{count}
    </span>
  );

  return (
    <div
      className={cn(
        "relative rounded-md mb-1 overflow-hidden",
        "border-l-2 transition-colors duration-300",
        isExecuting && "border-l-primary/60",
        isCompleted && !isError && "border-l-muted-foreground/20",
        isClipboard && "border-l-success/50",
        isError && "border-l-destructive/50"
      )}
    >
      {isExecuting && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ animation: "tool-step-shimmer 2s ease-in-out infinite" }}
        />
      )}

      <div
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5",
          "bg-surface-1/60",
          hasDetail && !isExecuting && "cursor-pointer"
        )}
        onClick={hasDetail && !isExecuting ? () => setExpanded((v) => !v) : undefined}
      >
        <Icon
          size={12}
          className={cn(
            "shrink-0 transition-colors duration-300",
            isExecuting && "text-primary/70",
            isCompleted && !isError && !isClipboard && "text-muted-foreground/50",
            isClipboard && "text-success/70",
            isError && "text-destructive/60"
          )}
        />

        {isExecuting ? (
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground/80">
            <span className="min-w-0 truncate">
              {t(`agentMode.tools.${name}Status`, { defaultValue: name })}
            </span>
            {countBadge}
          </span>
        ) : isError ? (
          <div className="flex min-w-0 items-center gap-1">
            <CircleAlert size={10} className="text-destructive/60 shrink-0" />
            <span className="min-w-0 truncate text-[11px] text-destructive/70">
              {firstError?.result || name}
            </span>
            {countBadge}
          </div>
        ) : isClipboard ? (
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-success dark:text-success/80">
              {t("agentMode.tools.copiedToClipboard")}
            </span>
            <Check
              size={10}
              className="text-success shrink-0"
              style={{ animation: "tool-check-pop 300ms ease-out both" }}
            />
          </div>
        ) : (
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground/70">
            <span className="min-w-0 truncate">{(lastResult || name).split("\n")[0]}</span>
            {countBadge}
          </span>
        )}

        {hasDetail && !isExecuting && (
          <ChevronDown
            size={10}
            className={cn(
              "ml-auto text-muted-foreground/40 shrink-0 transition-transform duration-200",
              expanded && "rotate-180"
            )}
          />
        )}
      </div>

      {hasDetail && !isExecuting && (
        <div
          className="overflow-hidden transition-all duration-200"
          style={{ maxHeight: expanded ? `${resultLines.length * 16 + 12}px` : "0px" }}
        >
          <pre className="text-[10px] text-muted-foreground/60 px-2.5 pb-1.5 whitespace-pre-wrap leading-tight">
            {detailText}
          </pre>
        </div>
      )}
    </div>
  );
}

function NoteCard({
  noteId,
  title,
  index,
  subtitle,
  onOpenNote,
}: {
  noteId: number;
  title: string;
  /** Citation number, when the answer cited this note. */
  index?: number;
  subtitle: string;
  onOpenNote?: (noteId: number) => void;
}) {
  return (
    <button
      onClick={() =>
        onOpenNote ? onOpenNote(noteId) : window.electronAPI?.agentOpenNote?.(noteId)
      }
      className={cn(
        "flex items-center gap-2 w-full mt-1.5 px-2.5 py-2 rounded-md",
        "bg-primary/6 border border-primary/12",
        "hover:bg-primary/10 hover:border-primary/20",
        "active:scale-[0.99]",
        "transition-all duration-150",
        "text-left group/note"
      )}
    >
      <div
        className={cn(
          "shrink-0 rounded bg-primary/10",
          index != null
            ? "flex size-[22px] items-center justify-center text-[10px] font-semibold text-primary"
            : "p-1"
        )}
      >
        {index != null ? index : <FileText size={12} className="text-primary/70" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-foreground truncate">{title}</p>
        {/* A matched passage runs to hundreds of characters and arrives with
            its own newlines; one clamped line is the whole budget here. */}
        <p className="line-clamp-1 text-[10px] text-muted-foreground/50">{subtitle}</p>
      </div>
      <ChevronRight
        size={12}
        className="text-muted-foreground/30 group-hover/note:text-primary/50 shrink-0 transition-colors duration-150"
      />
    </button>
  );
}

export function ChatMessage({
  role,
  content,
  isStreaming,
  toolCalls,
  sources,
  onOpenNote,
}: ChatMessageProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  if (role === "user") {
    return (
      <div
        className="flex justify-end"
        style={{ animation: "agent-message-in 200ms ease-out both" }}
      >
        <div
          data-chat-bubble
          className={cn(
            "max-w-[80%] px-3 py-2 rounded-lg rounded-br-sm",
            "bg-primary/90 text-primary-foreground",
            "text-[13px] leading-relaxed"
          )}
        >
          {content}
        </div>
      </div>
    );
  }

  const hasToolCalls = toolCalls && toolCalls.length > 0;
  const hasContent = content.length > 0;

  const fallbackTitle = t("notes.list.untitledNote");
  // Notes reach an answer two ways, and a citation must survive either. Only
  // retrieved notes counted here before, so a note the model found through a
  // tool — every meeting from list_meetings, every search_notes hit — had its
  // citation dropped as if it had been hallucinated, and rendered as nothing.
  const toolNoteIds = extractNoteCards(toolCalls, fallbackTitle).map((card) => card.noteId);
  const knownIds = [...(sources?.map((s) => s.noteId) ?? []), ...toolNoteIds];
  const { content: renderedContent, citedIds } = isStreaming
    ? renderStreamingCitations(content, knownIds)
    : renderCitations(content, knownIds);
  const { items: sourceItems, cited } = resolveMessageSources(
    sources,
    toolCalls,
    citedIds,
    fallbackTitle
  );

  const openNote = (noteId: number) =>
    onOpenNote ? onOpenNote(noteId) : void window.electronAPI?.agentOpenNote?.(noteId);

  return (
    <div
      className="group/msg flex justify-start"
      style={{ animation: "agent-message-in 200ms ease-out both" }}
    >
      <div
        data-chat-bubble
        className={cn(
          "max-w-[85%] px-3 py-2 rounded-lg rounded-bl-sm",
          "bg-surface-1 border border-border/30 text-foreground",
          "text-[13px] leading-relaxed"
        )}
      >
        {hasToolCalls && (
          <div
            className={cn(
              (hasContent || sourceItems.length > 0) && "mb-2 pb-1.5 border-b border-border/15"
            )}
          >
            {groupToolCalls(toolCalls).map((group) => (
              <ToolCallStep key={group.calls[0].id} calls={group.calls} />
            ))}
          </div>
        )}

        {hasContent && (
          <MarkdownRenderer
            content={renderedContent}
            onOpenNote={openNote}
            className="text-[13px] leading-relaxed [&_p]:text-[13px] [&_li]:text-[13px]"
          />
        )}

        {isStreaming && hasContent && (
          <span
            className="inline-block w-[2px] h-[14px] bg-foreground/70 align-middle ml-0.5"
            style={{ animation: "agent-cursor-blink 1s ease-in-out infinite" }}
          />
        )}

        {isStreaming && !hasContent && !hasToolCalls && (
          <span className="text-[13px] font-medium select-none thinking-shimmer-text">
            {t("agentMode.input.thinking")}...
          </span>
        )}

        {sourceItems.length > 0 && !isStreaming && (
          <div className="mt-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
              {cited ? t("agentMode.sources.cited") : t("agentMode.sources.related")}
            </p>
            {sourceItems.map((item, i) => (
              <NoteCard
                key={item.noteId}
                noteId={item.noteId}
                title={item.title}
                index={cited ? i + 1 : undefined}
                subtitle={item.snippet?.trim() || t("agentMode.tools.openNote")}
                onOpenNote={onOpenNote}
              />
            ))}
          </div>
        )}

        {hasContent && !isStreaming && (
          <div className="flex justify-start mt-1.5 -mb-0.5">
            <button
              onClick={handleCopy}
              className={cn(
                "p-1 rounded-sm",
                "text-muted-foreground/40 hover:text-foreground hover:bg-foreground/8",
                "opacity-0 group-hover/msg:opacity-100 transition-all duration-150",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
            >
              {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
