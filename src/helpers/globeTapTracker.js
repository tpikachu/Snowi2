/**
 * Was a Globe/Fn press a tap, or the modifier half of a combo?
 *
 * On a Mac the same key is both: tapped alone it is the Globe key, held it
 * is the Fn modifier — Fn+Left is Home, Fn+F5 is F5, Fn+C is Control
 * Center. The native listener reports the press the instant Fn goes down,
 * when nobody can yet tell which of the two is happening. Acting on that
 * press toggled the assistant bar — and focused it — under every Fn combo
 * on the Mac, so the second key of the combo landed in the bar instead of
 * the app the user was in (client report, 2026-09: "Fn+anything stopped
 * working while Snowy runs").
 *
 * So a Globe-bound summon acts on RELEASE, and only when the hold was a tap:
 * `down()` arms the tracker, `interrupt()` (another key pressed while Fn was
 * held) disarms it, and `up()` says whether the release completes a tap.
 *
 * Pure — no Electron, no timers.
 */
function createGlobeTapTracker() {
  let held = false;
  let interrupted = false;

  return {
    /** Fn went down. */
    down() {
      held = true;
      interrupted = false;
    },
    /** Another key went down while Fn was held: this hold is a combo. */
    interrupt() {
      if (held) interrupted = true;
    },
    /** Fn came up. True only when nothing else was pressed in between. */
    up() {
      const tap = held && !interrupted;
      held = false;
      interrupted = false;
      return tap;
    },
    /** Forget any hold in progress (the binding changed under it). */
    reset() {
      held = false;
      interrupted = false;
    },
  };
}

module.exports = { createGlobeTapTracker };
