// Feature visibility switches — one source of truth for the main process and
// the Vite renderer.
//
// ESM, not CommonJS, because both sides have to read it. Vite serves source
// `.js` as ESM, so `module.exports` gives the renderer a module with no named
// exports (it fails at import, not at use). Electron's Node can `require()` an
// ESM module, so going the other way costs the main process nothing — the same
// reason `helpers/meetingJoinUrl.js` is written this way.
//
// These hide surfaces; they never delete capability. Everything behind a false
// flag stays built, tested and reachable in code, so turning it back on is a
// one-line change rather than a restoration.

/**
 * Dictation — the push-to-talk transcribe-and-paste flow inherited from the
 * upstream base.
 *
 * Off while V1 focuses on meetings (spec §3). With this false:
 *   - the dictation HUD never surfaces on its own,
 *   - the dictation, voice-agent and translation hotkeys are not registered
 *     (a live global shortcut into a hidden feature is worse than no shortcut),
 *   - dictation settings, onboarding steps and activity rows are hidden.
 *
 * The engine, the IPC surface and every test stay in place.
 */
export const DICTATION_ENABLED = false;

/**
 * Settings anchors, panels and search entries that only exist for dictation.
 *
 * The second group is named for what it does rather than for dictation, which
 * is exactly why it kept showing: every control under it drives the dictation
 * flow and nothing else.
 *   sound        — start/stop cues and pause-media, both read only by
 *                  `useAudioRecording` (`dictationCues`, `pauseMediaOnDictation`)
 *   floatingIcon — auto-hide for the dictation HUD, a window that never opens
 *   waylandPaste — ydotool setup for auto-paste, and the only things that
 *                  paste are the dictation and selection-edit flows
 */
export const DICTATION_SETTINGS_IDS = new Set([
  "dictationHotkey",
  "voiceAgentHotkey",
  "translationHotkey",
  "dictation",
  "dictationCleanup",
  "dictationAgent",
  "dictationTranslation",
  "sound",
  "floatingIcon",
  "waylandPaste",
]);

/** Hotkey slots owned by dictation, in `hotkeyManager` slot naming. */
export const DICTATION_HOTKEY_SLOTS = new Set(["dictation", "voiceAgent", "translation"]);

/**
 * Audio-file upload — turning an existing recording into a note
 * (UploadAudioView).
 *
 * Off because the upload view is already hidden from the icon rail (product
 * decision — see IconRail.tsx), and a Speech-to-Text settings tab configuring
 * models for a surface the user cannot reach is a dead end. The view, its
 * transcription context and the settings panel all stay wired up, so
 * re-enabling is this one line plus the rail entry.
 */
export const UPLOAD_ENABLED = false;

/** Settings panels, anchors and search entries that only exist for upload. */
export const UPLOAD_SETTINGS_IDS = new Set(["upload", "uploadEngine"]);

/**
 * Calendar integration — Google/Microsoft/Apple sync, the connect nudge, the
 * upcoming-meetings rail, and calendar reminder prompts.
 *
 * Off for now (product decision). With this false:
 *   - Home shows neither the connect nudge nor the upcoming/now cards,
 *   - the calendar-reminders notification toggle is hidden,
 *   - the sync managers never start, so a previously connected account
 *     produces no reminders or prompts.
 *
 * The OAuth flows, managers, scheduler and shared calendar_events table all
 * stay built and wired.
 */
export const CALENDAR_ENABLED = false;

/**
 * Shared team spaces.
 *
 * Off because nothing can create one: a `kind: 'team'` space only ever arrives
 * through `upsertSpaceFromCloud`, and this build has no account or sync. The
 * UI branched on it throughout — space-kind copy, the private/team explainer,
 * team-note badges — which advertises sharing the app cannot do.
 *
 * The schema column, the cloud upsert path and the sync code all stay.
 */
export const TEAM_SPACES_ENABLED = false;
