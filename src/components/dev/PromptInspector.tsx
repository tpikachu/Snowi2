// The prompt pipeline, as it actually ran.
//
// Reachable whenever debug logging is on — not dev-only like the database
// explorer — because the people who need it most are running a packaged build
// and trying to explain a bad answer.
//
// Untranslated for the same reason the database explorer is: it is a debugging
// surface, and the terms in it (system prompt, retrieval, first token) are the
// terms of the thing being debugged.

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Copy, Check, Trash2, Shield, ShieldAlert } from "lucide-react";
import { Button } from "../ui/button";
import {
  getChatTurns,
  subscribeChatTurns,
  clearChatTurns,
  isLocalDestination,
  sectionBreakdown,
  totalRequestChars,
  type ChatTurnRecord,
} from "../../utils/chatTurnRecord";

function ms(value?: number): string {
  if (value === undefined) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`;
}

/** A latency worth noticing: the client's target is an answer in 2–3 seconds. */
const SLOW_FIRST_TOKEN_MS = 3000;

export default function PromptInspector() {
  const [turns, setTurns] = useState<ChatTurnRecord[]>(getChatTurns());
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => subscribeChatTurns(setTurns), []);

  if (turns.length === 0) {
    return (
      <div className="mx-auto w-full max-w-4xl p-4">
        <p className="rounded-lg border border-dashed border-border-subtle px-6 py-10 text-center text-xs text-muted-foreground">
          No chat turns recorded yet. Ask the assistant something and it will appear here, with the
          exact prompt it was sent.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-3 p-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Prompt pipeline
        </h2>
        <span className="text-[11px] text-muted-foreground/60">
          last {turns.length} turn{turns.length === 1 ? "" : "s"}
        </span>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={clearChatTurns}>
          <Trash2 className="mr-1 h-3 w-3" />
          Clear
        </Button>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Kept in memory only. The full prompt is written to the log file when debug logging is on.
      </p>

      {turns.map((turn) => (
        <TurnCard
          key={turn.id}
          turn={turn}
          open={openId === turn.id}
          onToggle={() => setOpenId(openId === turn.id ? null : turn.id)}
        />
      ))}
    </div>
  );
}

function TurnCard({
  turn,
  open,
  onToggle,
}: {
  turn: ChatTurnRecord;
  open: boolean;
  onToggle: () => void;
}) {
  const onDevice = isLocalDestination(turn.provider, turn.mode);
  const slow = (turn.timings.firstTokenMs ?? 0) > SLOW_FIRST_TOKEN_MS;

  return (
    <section className="rounded-lg border border-border-subtle">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {open ? (
          <ChevronDown size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-foreground">{turn.question}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-muted-foreground">
            <span>{turn.surface}</span>
            <span>
              {turn.provider}/{turn.model}
            </span>
            <span className={slow ? "text-warning" : undefined}>
              first token {ms(turn.timings.firstTokenMs)}
            </span>
            <span>total {ms(turn.timings.totalMs)}</span>
            <span>{totalRequestChars(turn).toLocaleString()} chars sent</span>
            <span>
              {turn.retrieved.length} retrieved / {turn.citedNoteIds.length} cited
            </span>
            {turn.error && <span className="text-destructive">error</span>}
          </div>
        </div>
        {/* Where this question and the meeting passages attached to it went. */}
        <span
          className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${
            onDevice ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
          }`}
        >
          {onDevice ? <Shield size={10} /> : <ShieldAlert size={10} />}
          {onDevice ? "on device" : turn.provider}
        </span>
      </button>

      {open && <TurnDetail turn={turn} />}
    </section>
  );
}

function TurnDetail({ turn }: { turn: ChatTurnRecord }) {
  const breakdown = sectionBreakdown(turn);

  return (
    <div className="space-y-3 border-t border-border-subtle px-3 py-3">
      {turn.error && (
        <p className="rounded border border-destructive/25 bg-destructive-subtle/60 px-2 py-1.5 font-mono text-[11px] text-destructive">
          {turn.error}
        </p>
      )}

      {!isLocalDestination(turn.provider, turn.mode) && (
        <p className="rounded border border-warning/25 bg-warning/5 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
          This turn left the device. The system prompt below — including any retrieved meeting
          passages and open commitments — was sent to {turn.provider}
          {turn.endpoint ? ` at ${turn.endpoint}` : ""}.
        </p>
      )}

      <Row label="Timings">
        <span className="font-mono text-[11px] text-muted-foreground">
          retrieval {ms(turn.timings.retrievalMs)} · memory {ms(turn.timings.memoryMs)} · first
          token {ms(turn.timings.firstTokenMs)} · total {ms(turn.timings.totalMs)}
        </span>
      </Row>

      <Row label="Retrieval">
        <div className="space-y-1">
          <p className="font-mono text-[11px] text-muted-foreground">
            query: {turn.retrievalQuery}
            {turn.retrievalQuery !== turn.question && " (widened from the previous turn)"}
          </p>
          {turn.retrievedDropped > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {turn.retrievedDropped} hit{turn.retrievedDropped === 1 ? "" : "s"} dropped by the
              grounding filter.
            </p>
          )}
          {turn.retrieved.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/70">Nothing retrieved.</p>
          ) : (
            <ul className="space-y-0.5">
              {turn.retrieved.map((note) => {
                const cited = turn.citedNoteIds.includes(note.noteId);
                return (
                  <li
                    key={note.noteId}
                    className="flex items-baseline gap-2 font-mono text-[11px] text-muted-foreground"
                  >
                    <span className={cited ? "text-success" : "text-muted-foreground/40"}>
                      {cited ? "cited" : "  —  "}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-foreground/70">{note.title}</span>
                    <span>{note.score !== undefined ? note.score.toFixed(3) : "keyword"}</span>
                    <span>{note.chars}c</span>
                    {!note.fromThisTurn && (
                      <span className="text-muted-foreground/50">carried</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Row>

      <Row label="Prompt sections">
        <ul className="space-y-0.5">
          {breakdown.map((section) => (
            <li
              key={section.name}
              className="flex items-baseline gap-2 font-mono text-[11px] text-muted-foreground"
            >
              <span className="w-36 shrink-0 text-foreground/70">{section.name}</span>
              <span className="w-16 shrink-0 text-right">{section.chars}c</span>
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/5">
                <span
                  className="block h-full rounded-full bg-primary/50"
                  style={{ width: `${Math.round(section.share * 100)}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      </Row>

      <Row label="Message window">
        <span className="font-mono text-[11px] text-muted-foreground">
          {turn.messageWindow.length} message{turn.messageWindow.length === 1 ? "" : "s"} ·{" "}
          {turn.messageWindow.map((m) => `${m.role[0]}${m.chars}`).join(" ")}
        </span>
      </Row>

      {turn.availableTools.length > 0 && (
        <Row label="Tools">
          <span className="font-mono text-[11px] text-muted-foreground">
            offered: {turn.availableTools.join(", ")}
            {turn.toolCalls.length > 0 && (
              <>
                <br />
                called:{" "}
                {turn.toolCalls
                  .map((call) => `${call.name}${call.failed ? " (failed)" : ""}`)
                  .join(", ")}
              </>
            )}
          </span>
        </Row>
      )}

      <SystemPrompt turn={turn} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {label}
      </p>
      {children}
    </div>
  );
}

function SystemPrompt({ turn }: { turn: ChatTurnRecord }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const full = turn.sections.map((section) => section.text).join("\n\n");

  const copy = async () => {
    await navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
          System prompt ({turn.systemPromptChars.toLocaleString()} chars)
        </p>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={() => setShown(!shown)}
        >
          {shown ? "Hide" : "Show"}
        </Button>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={copy}>
          {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
      {shown && (
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded border border-border-subtle bg-foreground/3 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground dark:bg-white/4">
          {full}
        </pre>
      )}
    </div>
  );
}
