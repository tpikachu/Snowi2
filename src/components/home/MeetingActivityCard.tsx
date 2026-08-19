import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MeetingActivity } from "../../types/electron";
import {
  buildActivityBars,
  summarizeActivity,
  weekdayName,
  shortDateLabel,
} from "../../utils/meetingActivity";

/**
 * Meetings per day over the last 30 days.
 *
 * Hand-rolled SVG rather than a charting library: no chart dependency is
 * installed, and pulling one in for a single 30-bar card would cost more bundle
 * than the whole home page. The arithmetic lives in utils/meetingActivity.ts
 * where it can be tested.
 */

const DAYS = 30;
const PLOT_HEIGHT = 56;

export default function MeetingActivityCard({ spaceId }: { spaceId?: number | null }) {
  const { t, i18n } = useTranslation();
  const [activity, setActivity] = useState<MeetingActivity | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI
      ?.getMeetingActivity?.({ days: DAYS, spaceId: spaceId ?? null })
      .then((result) => {
        if (!cancelled) setActivity(result ?? null);
      })
      .catch(() => {
        // A missing chart is not worth an error state on the home page.
        if (!cancelled) setActivity(null);
      });
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  // Nothing recorded yet: the empty-state card below already explains what to
  // do, and a flat chart of thirty zeroes only says "you have done nothing".
  if (!activity || activity.total === 0) return null;

  const bars = buildActivityBars(activity.days);
  const summary = summarizeActivity(activity);
  const firstDay = activity.days[0]?.date;
  const lastDay = activity.days[activity.days.length - 1]?.date;

  const facts = [
    t("home.activity.thisWeek", { count: summary.thisWeek }),
    summary.totalHours > 0 ? t("home.activity.recorded", { hours: summary.totalHours }) : null,
    summary.busiestWeekday != null
      ? t("home.activity.busiest", { day: weekdayName(summary.busiestWeekday, i18n.language) })
      : null,
  ].filter(Boolean) as string[];

  return (
    <section className="mt-4 rounded-lg border border-border-subtle px-4 py-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("home.activity.title")}
        </h2>
        <span className="text-[11px] text-muted-foreground/60">
          {t("home.activity.range", { count: DAYS })}
        </span>
      </div>

      <div className="mt-3 flex items-end gap-[3px]" style={{ height: PLOT_HEIGHT }}>
        {bars.map((bar) => (
          <div
            key={bar.date}
            className="group relative flex-1"
            style={{ height: PLOT_HEIGHT }}
            // Native title: one tooltip element per bar would be 30 popovers on
            // a page that already renders a meeting list.
            title={`${shortDateLabel(bar.date, i18n.language)} · ${t("home.activity.meetingCount", { count: bar.count })}`}
          >
            <div
              className={[
                "absolute bottom-0 w-full rounded-sm transition-colors",
                bar.count === 0
                  ? "bg-foreground/6"
                  : bar.isToday
                    ? "bg-primary"
                    : "bg-primary/45 group-hover:bg-primary/70",
              ].join(" ")}
              style={{
                // Empty days keep a 2px sliver so the axis reads as a row of
                // days rather than as gaps where the chart failed to load.
                height: bar.count === 0 ? 2 : Math.max(3, bar.ratio * PLOT_HEIGHT),
              }}
            />
          </div>
        ))}
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground/60">
        <span>{firstDay ? shortDateLabel(firstDay, i18n.language) : ""}</span>
        <span>{lastDay ? shortDateLabel(lastDay, i18n.language) : ""}</span>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">{facts.join(" · ")}</p>
    </section>
  );
}
