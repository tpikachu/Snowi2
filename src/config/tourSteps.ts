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
    id: "home",
    anchor: "nav-home",
    view: "home",
    placement: "right",
    titleKey: "tour.steps.home.title",
    bodyKey: "tour.steps.home.body",
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
    id: "settings",
    anchor: "nav-settings",
    placement: "right",
    titleKey: "tour.steps.settings.title",
    bodyKey: "tour.steps.settings.body",
  },
] as const;

/** Bumped when the steps change enough that a finished tour should run again. */
export const TOUR_VERSION = 1;

export const TOUR_STORAGE_KEY = "tourCompletedVersion";
