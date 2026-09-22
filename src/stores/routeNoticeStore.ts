import { create } from "zustand";
import type { RerouteMove } from "../utils/providerReroute";

/**
 * Notices the settings store queues when it moves a feature off a provider
 * whose key was removed (providerReroute.ts). The store has no toast of its
 * own; `RouteNoticeToastListener` drains this from inside the ToastProvider,
 * the same shape as the background-action error events.
 */
interface RouteNoticeState {
  notices: RerouteMove[];
}

export const useRouteNoticeStore = create<RouteNoticeState>()(() => ({ notices: [] }));

export function pushRouteNotices(moves: RerouteMove[]): void {
  if (moves.length === 0) return;
  const { notices } = useRouteNoticeStore.getState();
  useRouteNoticeStore.setState({ notices: [...notices, ...moves] });
}

export function consumeRouteNotices(): RerouteMove[] {
  const { notices } = useRouteNoticeStore.getState();
  if (notices.length === 0) return [];
  useRouteNoticeStore.setState({ notices: [] });
  return notices;
}
