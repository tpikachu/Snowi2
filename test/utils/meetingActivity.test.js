const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer } = require("../lib/rendererTestHarness");

async function load(t) {
  const vite = await createRendererServer(t, { cachePrefix: "snowy-meeting-activity-" });
  return await vite.ssrLoadModule("/utils/meetingActivity.ts");
}

function day(date, count, seconds = 0, weekday = 1) {
  return { date, count, seconds, weekday };
}

test("a single meeting does not render as a full-height bar", async (t) => {
  const { buildActivityBars } = await load(t);

  const bars = buildActivityBars([day("2026-08-18", 0), day("2026-08-19", 1)]);

  // Without a floor on the scale, one meeting is the maximum and fills the
  // plot — which reads as a busy month to anyone glancing at it.
  assert.equal(bars[1].ratio, 0.5);
  assert.equal(bars[0].ratio, 0);
});

test("bars scale against the tallest day", async (t) => {
  const { buildActivityBars } = await load(t);

  const bars = buildActivityBars([
    day("2026-08-17", 1),
    day("2026-08-18", 4),
    day("2026-08-19", 2),
  ]);

  assert.deepEqual(
    bars.map((b) => b.ratio),
    [0.25, 1, 0.5]
  );
});

test("the last day in the series is today", async (t) => {
  const { buildActivityBars } = await load(t);

  const bars = buildActivityBars([day("2026-08-18", 2), day("2026-08-19", 1)]);

  assert.equal(bars.at(-1).isToday, true);
  assert.equal(bars[0].isToday, false);
});

test("this week counts the last seven days, not the whole window", async (t) => {
  const { summarizeActivity } = await load(t);

  const days = Array.from({ length: 30 }, (_, i) =>
    day(`2026-07-${String(i + 1).padStart(2, "0")}`, i < 23 ? 5 : 1)
  );
  const summary = summarizeActivity({ days, total: 122, totalSeconds: 0, busiestWeekday: null });

  assert.equal(summary.thisWeek, 7, "the trailing seven days, one meeting each");
});

test("hours round finely below ten and coarsely above", async (t) => {
  const { summarizeActivity } = await load(t);

  const at = (seconds) =>
    summarizeActivity({ days: [], total: 0, totalSeconds: seconds, busiestWeekday: null })
      .totalHours;

  assert.equal(at(3.5 * 3600), 3.5, "3.5h is useful");
  assert.equal(at(127.4 * 3600), 127, "127.4h is noise");
  assert.equal(at(0), 0);
});

test("empty windows do not divide by zero or invent a busiest day", async (t) => {
  const { buildActivityBars, summarizeActivity } = await load(t);

  assert.deepEqual(buildActivityBars([]), []);

  const summary = summarizeActivity({ days: [], total: 0, totalSeconds: 0, busiestWeekday: null });
  assert.equal(summary.thisWeek, 0);
  assert.equal(summary.busiestWeekday, null);
  assert.ok(Number.isFinite(summary.peak));
});

test("weekday index 0 is Sunday, matching Date.getDay()", async (t) => {
  const { weekdayName } = await load(t);

  assert.equal(weekdayName(0, "en-GB"), "Sunday");
  assert.equal(weekdayName(2, "en-GB"), "Tuesday");
  assert.equal(weekdayName(6, "en-GB"), "Saturday");
});

test("a date label is not shifted a day by UTC parsing", async (t) => {
  const { shortDateLabel } = await load(t);

  // new Date("2026-08-19") is UTC midnight, which prints as the 18th anywhere
  // west of Greenwich. The label must name the day the bar represents.
  assert.match(shortDateLabel("2026-08-19", "en-GB"), /19/);
  assert.match(shortDateLabel("2026-01-01", "en-GB"), /1/);
});
