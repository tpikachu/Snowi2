import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import { Tooltip } from "../ui/tooltip";
import { useOpenCommitments } from "../../hooks/useOpenCommitments";
import {
  bucketCommitments,
  commitmentBucket,
  daysBetween,
  localToday,
  type CommitmentBucket,
} from "../../utils/commitmentBuckets";
import type { MemoryObjectRow } from "../../types/electron";

/**
 * What the user has agreed to, across every meeting.
 *
 * The data has existed since memory extraction shipped — action items,
 * commitments and deadlines with an owner, a status and a due date — but its
 * only reader was the chat prompt. You could see your own commitments solely
 * by asking the agent about them. This is the surface.
 *
 * Shown only when there is something open: an empty "no commitments" card on
 * a fresh install is a promise the app has not earned yet.
 */

const SHOWN = 6;

const bucketToneClass: Record<CommitmentBucket, string> = {
  overdue: "bg-destructive",
  today: "bg-warning",
  upcoming: "bg-primary/60",
  undated: "bg-muted-foreground/30",
};

export default function CommitmentsCard({ onOpenNote }: { onOpenNote?: (noteId: number) => void }) {
  const { t, i18n } = useTranslation();
  const { commitments, isLoading, setStatus } = useOpenCommitments(true);

  // Recomputed per render rather than memoised on the date: the card is cheap,
  // and a memo keyed on "today" would keep yesterday's overdue set past
  // midnight on a window left open overnight.
  const today = localToday();
  const bucketed = useMemo(
    () => bucketCommitments(commitments, today, SHOWN),
    [commitments, today]
  );

  if (isLoading || bucketed.total === 0) return null;

  return (
    <section className="mt-4 rounded-lg border border-border-subtle px-4 py-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("home.commitments.title")}
        </h2>
        <span className="text-[11px] text-muted-foreground/60">{bucketed.total}</span>
        <div className="flex-1" />
        {bucketed.overdueCount > 0 && (
          <span className="rounded-full bg-destructive-subtle px-2 py-0.5 text-[10px] font-medium text-destructive">
            {t("home.commitments.overdueCount", { count: bucketed.overdueCount })}
          </span>
        )}
      </div>

      <ul className="mt-2 space-y-px">
        {bucketed.groups.flatMap((group) =>
          group.items.map((row) => (
            <CommitmentRow
              key={row.id}
              row={row}
              bucket={group.bucket}
              today={today}
              language={i18n.language}
              onOpenNote={onOpenNote}
              onDone={() => setStatus(row.id, "done")}
              onDismiss={() => setStatus(row.id, "dismissed")}
            />
          ))
        )}
      </ul>

      {bucketed.hidden > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground/70">
          {t("home.commitments.more", { count: bucketed.hidden })}
        </p>
      )}
    </section>
  );
}

function CommitmentRow({
  row,
  bucket,
  today,
  language,
  onOpenNote,
  onDone,
  onDismiss,
}: {
  row: MemoryObjectRow;
  bucket: CommitmentBucket;
  today: string;
  language: string;
  onOpenNote?: (noteId: number) => void;
  onDone: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const canOpen = row.note_id != null && onOpenNote;

  return (
    <li className="group flex items-start gap-2.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-foreground/4">
      <Tooltip content={t("home.commitments.markDone")} side="top">
        <button
          type="button"
          onClick={onDone}
          aria-label={t("home.commitments.markDone")}
          className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full border border-border-hover text-transparent outline-none transition-colors hover:border-success hover:text-success focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Check size={10} strokeWidth={3} />
        </button>
      </Tooltip>

      <div className="min-w-0 flex-1">
        <p className="text-xs leading-snug text-foreground">{row.content}</p>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            aria-hidden="true"
            className={`size-1.5 shrink-0 rounded-full ${bucketToneClass[bucket]}`}
          />
          <span>{dueText(row.due_at, today, language, t)}</span>
          {row.note_title && (
            <>
              <span aria-hidden="true" className="text-muted-foreground/40">
                ·
              </span>
              {canOpen ? (
                <button
                  type="button"
                  onClick={() => onOpenNote!(row.note_id!)}
                  className="min-w-0 truncate rounded-sm underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {row.note_title}
                </button>
              ) : (
                <span className="min-w-0 truncate">{row.note_title}</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Dismiss is the escape hatch for a claim the extraction got wrong.
          Only on hover: it is the destructive one of the two. */}
      <Tooltip content={t("home.commitments.dismiss")} side="top">
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("home.commitments.dismiss")}
          className="mt-px shrink-0 rounded-sm p-0.5 text-muted-foreground/0 outline-none transition-colors group-hover:text-muted-foreground/50 hover:!text-foreground focus-visible:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X size={12} />
        </button>
      </Tooltip>
    </li>
  );
}

/** The due date as a phrase: overdue by N days, today, or the date itself. */
function dueText(
  dueAt: string | null,
  today: string,
  language: string,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const bucket = commitmentBucket(dueAt, today);
  if (bucket === "undated") return t("home.commitments.due.none");
  if (bucket === "today") return t("home.commitments.due.today");

  const date = dueAt!.slice(0, 10);
  if (bucket === "overdue") {
    return t("home.commitments.due.overdue", { count: daysBetween(date, today) });
  }

  const days = daysBetween(today, date);
  if (days === 1) return t("home.commitments.due.tomorrow");
  if (days <= 7) return t("home.commitments.due.inDays", { count: days });

  // Beyond a week a weekday means nothing, so name the date. Constructed from
  // parts rather than parsed, which would read the string as UTC midnight.
  const [year, month, day] = date.split("-").map(Number);
  const formatted = new Intl.DateTimeFormat(language, { month: "short", day: "numeric" }).format(
    new Date(year, month - 1, day)
  );
  return t("home.commitments.due.on", { date: formatted });
}
