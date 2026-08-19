import type { MeetingActivity, MeetingActivityDay } from "../types/electron";

/**
 * Geometry and headline figures for the home page activity chart.
 *
 * Pure and separate from the component because the parts that go wrong here
 * are arithmetic, not markup: an empty window dividing by zero, a single
 * meeting rendering as a full-height bar, "this week" counting a different
 * seven days than the user would.
 */

export interface ActivityBar {
  date: string;
  count: number;
  /** 0..1 — the bar's height as a fraction of the plot area. */
  ratio: number;
  weekday: number;
  isToday: boolean;
}

export interface ActivitySummary {
  /** Meetings in the last 7 days, today included. */
  thisWeek: number;
  totalHours: number;
  busiestWeekday: number | null;
  /** The tallest day in the window, which is the y-axis top. */
  peak: number;
}

/**
 * A day with one meeting must not look like a day with the maximum. The scale
 * therefore starts at 2 even when nothing exceeds 1, so a lone meeting renders
 * as a half-height bar rather than a full one.
 */
const MIN_SCALE = 2;

export function buildActivityBars(days: readonly MeetingActivityDay[]): ActivityBar[] {
  if (days.length === 0) return [];

  const peak = Math.max(MIN_SCALE, ...days.map((day) => day.count));
  const lastDate = days[days.length - 1]?.date;

  return days.map((day) => ({
    date: day.date,
    count: day.count,
    ratio: day.count / peak,
    weekday: day.weekday,
    // The series always ends on today (the query builds it that way), so the
    // last entry is today without re-deriving it from a clock here.
    isToday: day.date === lastDate,
  }));
}

export function summarizeActivity(activity: MeetingActivity): ActivitySummary {
  const days = activity.days;
  const lastSeven = days.slice(-7);
  return {
    thisWeek: lastSeven.reduce((sum, day) => sum + day.count, 0),
    // One decimal below ten hours, whole hours above: "3.5h" is useful,
    // "127.4h" is noise.
    totalHours: roundHours(activity.totalSeconds),
    busiestWeekday: activity.busiestWeekday,
    peak: days.length > 0 ? Math.max(MIN_SCALE, ...days.map((d) => d.count)) : MIN_SCALE,
  };
}

function roundHours(seconds: number): number {
  const hours = seconds / 3600;
  if (hours <= 0) return 0;
  return hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours);
}

/** Localised weekday name for an index from `Date.getDay()`. */
export function weekdayName(weekday: number, locale?: string): string {
  // 2024-01-07 was a Sunday, so adding the index lands on the right weekday
  // without depending on what today happens to be.
  const date = new Date(Date.UTC(2024, 0, 7 + weekday));
  return date.toLocaleDateString(locale, { weekday: "long", timeZone: "UTC" });
}

/** Short label for an axis end, from a local YYYY-MM-DD key. */
export function shortDateLabel(isoDay: string, locale?: string): string {
  const [year, month, day] = isoDay.split("-").map(Number);
  if (!year || !month || !day) return isoDay;
  // Constructed as a local date, not parsed from the string: `new Date("2026-08-19")`
  // is UTC midnight, which prints as the 18th west of Greenwich.
  return new Date(year, month - 1, day).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  });
}
