import { create } from "zustand";
import { TOUR_STEPS, TOUR_VERSION, TOUR_STORAGE_KEY, type TourStep } from "../config/tourSteps";

/**
 * Guided-tour state.
 *
 * Completion is recorded by version, not as a boolean: a tour that gains a step
 * for a new feature should run again for someone who finished the old one, and
 * a boolean cannot express that.
 */

interface TourState {
  isActive: boolean;
  stepIndex: number;
  /** Anchors present in the DOM, published by the overlay each step. */
  availableAnchors: string[];
}

const isBrowser = typeof window !== "undefined" && typeof localStorage !== "undefined";

export const useTourStore = create<TourState>()(() => ({
  isActive: false,
  stepIndex: 0,
  availableAnchors: [],
}));

export function hasCompletedTour(): boolean {
  if (!isBrowser) return true;
  const raw = localStorage.getItem(TOUR_STORAGE_KEY);
  if (!raw) return false;
  const version = Number.parseInt(raw, 10);
  return Number.isFinite(version) && version >= TOUR_VERSION;
}

function markComplete(): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, String(TOUR_VERSION));
  } catch {
    // A full or blocked localStorage must not leave the overlay stuck open.
  }
}

export function startTour(): void {
  useTourStore.setState({ isActive: true, stepIndex: 0 });
}

/** Replays from the beginning regardless of the stored version. */
export function restartTour(): void {
  startTour();
}

export function endTour(): void {
  markComplete();
  useTourStore.setState({ isActive: false, stepIndex: 0 });
}

export function goToStep(index: number): void {
  const clamped = Math.max(0, Math.min(TOUR_STEPS.length - 1, index));
  useTourStore.setState({ stepIndex: clamped });
}

export function nextStep(): void {
  const { stepIndex } = useTourStore.getState();
  if (stepIndex >= TOUR_STEPS.length - 1) endTour();
  else useTourStore.setState({ stepIndex: stepIndex + 1 });
}

export function previousStep(): void {
  const { stepIndex } = useTourStore.getState();
  useTourStore.setState({ stepIndex: Math.max(0, stepIndex - 1) });
}

/**
 * Starts the tour once, after onboarding, for someone who has not seen this
 * version. Returns whether it started, so the caller can tell.
 */
export function startTourIfUnseen(): boolean {
  if (hasCompletedTour()) return false;
  startTour();
  return true;
}

export function currentStep(index: number): TourStep | null {
  return TOUR_STEPS[index] ?? null;
}
