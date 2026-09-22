import type { TourStep } from "../config/tourSteps";

/**
 * What the tour needs to know about setup, and nothing more.
 *
 * Kept to the model ids because that is the only part the tour can speak to
 * honestly. A model id being present does not mean inference works — the key
 * may be missing, the local weights may not be downloaded — so the "ready"
 * copy says a model is *chosen*, never that it is working. The real
 * diagnosis is `settingsRemedies`, which runs on an actual failure.
 */
export interface TourSetupState {
  /** The resolved id of the one AI model, if any. */
  model?: string | null;
}

/** Whether a model is chosen at all. */
export function isModelSetupComplete(state: TourSetupState): boolean {
  return Boolean(state.model?.trim());
}

/**
 * The body copy for a step, given what is already set up.
 *
 * Steps without a `bodyKeyWhenReady` read the same either way — only the setup
 * step changes its mind.
 */
export function tourStepBodyKey(step: TourStep, setupComplete: boolean): string {
  if (setupComplete && step.bodyKeyWhenReady) return step.bodyKeyWhenReady;
  return step.bodyKey;
}

/**
 * Whether a step's call-to-action button should be offered.
 *
 * Hidden once setup is done: an action that says "Set up models" on a
 * configured install is noise, and the same page is one click away in the
 * rail the step is pointing at.
 */
export function showsTourAction(step: TourStep, setupComplete: boolean): boolean {
  if (!step.action) return false;
  return !(setupComplete && step.action.hideWhenReady);
}
