// Feature visibility switches. CommonJS + pure data so the main process and the
// Vite renderer share one source of truth, like `secretKeys.js`.
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
const DICTATION_ENABLED = false;

/** Settings anchors, panels and search entries that only exist for dictation. */
const DICTATION_SETTINGS_IDS = new Set([
  "dictationHotkey",
  "voiceAgentHotkey",
  "translationHotkey",
  "dictation",
  "dictationCleanup",
  "dictationAgent",
  "dictationTranslation",
]);

/** Hotkey slots owned by dictation, in `hotkeyManager` slot naming. */
const DICTATION_HOTKEY_SLOTS = new Set(["dictation", "voiceAgent", "translation"]);

module.exports = {
  DICTATION_ENABLED,
  DICTATION_SETTINGS_IDS,
  DICTATION_HOTKEY_SLOTS,
};
