import { create } from "zustand";

/**
 * A request to open Settings on a particular surface.
 *
 * Settings is owned by ControlPanel's local state, so anything further from it
 * than a prop — a background toast, a store, a headless listener — has no way to
 * open it. This is that way: an error that the user can only fix in Settings can
 * offer the trip there instead of naming the page and leaving them to find it.
 */
export interface SettingsDeepLink {
  /** Section id, or one of the legacy aliases `settingsNav.resolveSectionId` maps. */
  section: string;
  /** Sub-panel within the section (an `LlmTab` or `SpeechTab`). */
  panel?: string;
}

interface SettingsNavigationState {
  pending: SettingsDeepLink | null;
  /**
   * Bumped per request. Asking for the *same* target twice has to re-open
   * Settings, and an unchanged `pending` object alone would not say so.
   */
  nonce: number;
}

export const useSettingsNavigationStore = create<SettingsNavigationState>()(() => ({
  pending: null,
  nonce: 0,
}));

export function requestSettings(link: SettingsDeepLink): void {
  useSettingsNavigationStore.setState((state) => ({ pending: link, nonce: state.nonce + 1 }));
}

export function consumeSettingsRequest(): SettingsDeepLink | null {
  const { pending } = useSettingsNavigationStore.getState();
  if (pending) useSettingsNavigationStore.setState({ pending: null });
  return pending;
}
