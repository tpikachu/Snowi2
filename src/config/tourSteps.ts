import type { Placement } from "../utils/tourPlacement";

/**
 * The guided tour, as data.
 *
 * Each step names a DOM anchor by its `data-tour` attribute rather than a
 * selector or a ref, so moving a button in the layout does not silently break
 * the tour — the attribute travels with the element.
 *
 * A step whose anchor is not in the DOM is skipped rather than shown pointing
 * at nothing: features are conditionally rendered (calendar, update button),
 * and a tour that stalls on a missing element is worse than a shorter tour.
 *
 * The order is the order of the work, not the order of the rail. Picking a
 * model comes second because a fresh install has none: without one, meeting
 * notes stay raw transcripts and chat cannot answer, and a user who meets
 * that after the tour has no idea it was a setting.
 */

export interface TourStep {
  id: string;
  /** Matches `[data-tour="..."]`. */
  anchor: string;
  /** The view to switch to before this step, when it lives on one. */
  view?: "home" | "chat" | "personal-notes" | "dictionary";
  placement: Placement;
  /** i18n keys under `tour.steps`. */
  titleKey: string;
  bodyKey: string;
  /** Used instead of `bodyKey` once the thing this step asks for is done. */
  bodyKeyWhenReady?: string;
  /** A primary button that deep-links into settings and ends the tour. */
  action?: {
    labelKey: string;
    settingsSection: string;
    settingsPanel?: string;
    /** Dropped when setup is already complete, rather than nagging. */
    hideWhenReady?: boolean;
  };
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "capture",
    anchor: "capture",
    view: "home",
    placement: "bottom",
    titleKey: "tour.steps.capture.title",
    bodyKey: "tour.steps.capture.body",
  },
  {
    // Second, and the only step with an action: this is the one thing a new
    // install cannot do for the user.
    id: "models",
    anchor: "nav-settings",
    placement: "right",
    titleKey: "tour.steps.models.title",
    bodyKey: "tour.steps.models.body",
    bodyKeyWhenReady: "tour.steps.models.bodyReady",
    action: {
      labelKey: "tour.steps.models.action",
      settingsSection: "llms",
      hideWhenReady: true,
    },
  },
  {
    id: "notes",
    anchor: "nav-notes",
    view: "personal-notes",
    placement: "right",
    titleKey: "tour.steps.notes.title",
    bodyKey: "tour.steps.notes.body",
  },
  {
    id: "chat",
    anchor: "nav-chat",
    view: "chat",
    placement: "right",
    titleKey: "tour.steps.chat.title",
    bodyKey: "tour.steps.chat.body",
  },
  {
    id: "home",
    anchor: "nav-home",
    view: "home",
    placement: "right",
    titleKey: "tour.steps.home.title",
    bodyKey: "tour.steps.home.body",
  },
  {
    id: "search",
    anchor: "nav-search",
    placement: "right",
    titleKey: "tour.steps.search.title",
    bodyKey: "tour.steps.search.body",
  },
  {
    id: "settings",
    anchor: "nav-settings",
    placement: "right",
    titleKey: "tour.steps.settings.title",
    bodyKey: "tour.steps.settings.body",
  },
] as const;

/**
 * Bumped when the steps change enough that a finished tour should run again.
 * 2: added the model-setup and search steps, and reordered around setup.
 */
export const TOUR_VERSION = 2;

export const TOUR_STORAGE_KEY = "tourCompletedVersion";
