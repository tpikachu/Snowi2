// Electron-free decision: should the assistant bar be on screen right after
// launch, before the user has asked for anything?
//
// The bar is the product's daily face — after setup it should simply be there,
// the way it is in every session the user has already lived with it. Two
// carve-outs keep it polite:
//
// - `showBarAtStartup` is the user's explicit opt-out (Settings → Startup).
//   When it wins, main falls back to showing the classic window instead —
//   a launch must never be invisible.
// - During the very first run the control panel is front and centre showing
//   onboarding; a second floating window would only compete with it. The
//   exception is a hidden launch (login item, start minimized): no window is
//   on screen then, so the bar is the only surface left to say "finish
//   setup" — which is exactly what its renderer shows pre-onboarding.
function shouldShowBarAtStartup({ showBarAtStartup, onboardingDone, launchedHidden }) {
  if (!showBarAtStartup) return false;
  return Boolean(onboardingDone || launchedHidden);
}

module.exports = { shouldShowBarAtStartup };
