import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import { useCaptureReadiness, type ReadinessTone } from "../../hooks/useCaptureReadiness";

const dotToneClass: Record<ReadinessTone, string> = {
  ok: "bg-success",
  attention: "bg-warning",
  unknown: "bg-muted-foreground/40",
};

/**
 * Whether the next meeting will actually be captured — answered before it
 * starts, not discovered from an empty transcript afterwards.
 *
 * The tones are deliberately three, not two: "unknown" covers the cases the
 * app genuinely cannot fix (no system-audio grant to give on this platform, no
 * calendar connected by choice). Painting those amber would mean a panel that
 * is permanently warning about nothing, which is how people learn to stop
 * reading it.
 */
export default function StatusPanel({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const rows = useCaptureReadiness(enabled);

  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="home-status-heading">
      <h2
        id="home-status-heading"
        className="pb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {t("home.status.title")}
      </h2>

      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li
            key={row.id}
            className="rounded-md border border-border/40 bg-card/50 px-3 py-2 dark:border-border-subtle/60 dark:bg-surface-2/60"
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn("size-1.5 shrink-0 rounded-full", dotToneClass[row.tone])}
              />
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
                {row.label}
              </span>
            </div>
            <p className="mt-1 pl-3.5 text-[11px] leading-snug text-muted-foreground">
              {row.detail}
            </p>
            {row.action && (
              <div className="mt-1.5 pl-3.5">
                <button
                  type="button"
                  onClick={row.action.run}
                  className={cn(
                    "rounded-sm text-[11px] font-medium text-primary underline-offset-2",
                    "outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  )}
                >
                  {row.action.label}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
