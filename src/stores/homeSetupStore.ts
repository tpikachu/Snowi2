import { create } from "zustand";

/**
 * A request to land the user on Home with the capabilities card open.
 *
 * The assistant bar's warning icon leads here: the card is the app's setup
 * guide (each missing capability with its own Set up button), but it is
 * collapsible and its state lives in ControlPanel-owned localStorage — so a
 * window that wants it visible needs this signal, same shape as
 * settingsNavigationStore. Nonce-only: the request carries no payload, it
 * just has to fire every time, including twice for the same target.
 */
interface HomeSetupState {
  nonce: number;
}

export const useHomeSetupStore = create<HomeSetupState>()(() => ({
  nonce: 0,
}));

export function requestHomeSetup(): void {
  useHomeSetupStore.setState((state) => ({ nonce: state.nonce + 1 }));
}
