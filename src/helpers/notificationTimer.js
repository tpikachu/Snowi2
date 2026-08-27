const DETECTION_TIMEOUT_MS = 30 * 1000;
// Calendar reminders fire 60s before the meeting (MEETING_REMINDER_LEAD_MS in
// calendarReminderScheduler.js); the prompt must survive past the meeting
// start, not vanish 30s before it.
const CALENDAR_TIMEOUT_MS = 2 * 60 * 1000;
// How long an unattended prompt waits before recording starts on its own.
// Long enough to read the card and reach Dismiss, short enough that an
// unattended meeting loses seconds, not minutes.
const AUTO_START_TIMEOUT_MS = 10 * 1000;
// A resumed countdown keeps at least this much runway so the card cannot
// vanish right as the pointer leaves it — or mid-click, while the renderer's
// 200ms dismiss animation delays the response IPC.
const MIN_RESUME_MS = 5 * 1000;

function getNotificationTimeoutMs(source) {
  return source === "calendar" ? CALENDAR_TIMEOUT_MS : DETECTION_TIMEOUT_MS;
}

/**
 * What an unanswered prompt does, and when.
 *
 * With auto-start enabled, a prompt for a meeting that is happening *now* —
 * mic or process evidence ("detected"), or a calendar event past its start
 * time ("underway") — times out into recording rather than into nothing:
 * evidence says the meeting exists, and the cost of a wrong start is one
 * Discard, while the cost of a missed meeting is the meeting.
 *
 * A "starting" prompt (calendar reminder before the event begins) never
 * auto-starts: there is no evidence yet, and recording a meeting a minute
 * before it exists because the user glanced away is exactly the wrong kind
 * of eager. It keeps the long dismiss countdown it has today.
 */
function resolvePromptTimeout({ source, variant, autoStartEnabled }) {
  const autoStart = Boolean(autoStartEnabled) && variant !== "starting";
  return {
    ms: autoStart ? AUTO_START_TIMEOUT_MS : getNotificationTimeoutMs(source),
    autoStart,
  };
}

// Auto-dismiss countdown for the meeting notification overlay, pausable while
// the user is interacting with the card.
class NotificationDismissTimer {
  constructor(onTimeout) {
    this._onTimeout = onTimeout;
    this._timer = null;
    this._deadline = null;
    this._pausedRemainingMs = null;
  }

  start(durationMs) {
    this.cancel();
    this._arm(durationMs);
  }

  pause() {
    if (!this._timer) return;
    clearTimeout(this._timer);
    this._timer = null;
    this._pausedRemainingMs = Math.max(0, this._deadline - Date.now());
    this._deadline = null;
  }

  resume() {
    if (this._pausedRemainingMs === null) return;
    this._arm(Math.max(this._pausedRemainingMs, MIN_RESUME_MS));
  }

  cancel() {
    if (this._timer) {
      clearTimeout(this._timer);
    }
    this._timer = null;
    this._deadline = null;
    this._pausedRemainingMs = null;
  }

  _arm(durationMs) {
    this._pausedRemainingMs = null;
    this._deadline = Date.now() + durationMs;
    this._timer = setTimeout(() => {
      this._timer = null;
      this._deadline = null;
      this._onTimeout();
    }, durationMs);
  }
}

module.exports = {
  NotificationDismissTimer,
  getNotificationTimeoutMs,
  resolvePromptTimeout,
  AUTO_START_TIMEOUT_MS,
};
