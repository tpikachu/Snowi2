import { useEffect, useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { getDefaultHotkey, parseHotkeyList } from "../../utils/hotkeys";

/**
 * Cross-window bridge for the shell's capture control.
 *
 * The dictation recorder lives in the overlay window (`App.jsx` →
 * `useAudioRecording`); the control panel is a separate renderer, so it cannot
 * call that hook. Rather than add an IPC channel, the two windows talk over the
 * renderer→renderer broadcast bus that already exists for sync events
 * (`electronAPI.emitSyncEvent` / `onSyncEvent`, main-process channel
 * `broadcast-sync-event` → `sync-event`). The overlay answers a toggle request
 * by running the *same* `handleToggle` the `toggle-dictation` hotkey IPC runs,
 * so there is exactly one recording implementation.
 */
export const DICTATION_TOGGLE_EVENT = "capture:dictation-toggle";
/** Overlay → everyone: the current recorder state. */
export const DICTATION_STATE_EVENT = "capture:dictation-state";
/** Anyone → overlay: "re-announce your state" (used on control panel mount). */
export const DICTATION_STATE_REQUEST_EVENT = "capture:dictation-state-request";

export interface DictationCaptureState {
  isRecording: boolean;
  isProcessing: boolean;
  /** Epoch ms the current recording started — drives the elapsed clock. */
  startedAt: number | null;
}

export const IDLE_DICTATION_STATE: DictationCaptureState = {
  isRecording: false,
  isProcessing: false,
  startedAt: null,
};

function normalizeState(payload: unknown): DictationCaptureState {
  if (!payload || typeof payload !== "object") return IDLE_DICTATION_STATE;
  const raw = payload as Partial<DictationCaptureState>;
  return {
    isRecording: raw.isRecording === true,
    isProcessing: raw.isProcessing === true,
    startedAt: typeof raw.startedAt === "number" ? raw.startedAt : null,
  };
}

/**
 * Run the dictation hotkey's press-time sequence from another window: capture
 * the paste target and any selection before the overlay takes focus, surface
 * the HUD, then deliver the toggle. Mirrors `WindowManager._sendDictationToggle`.
 */
export async function requestDictationToggle(): Promise<void> {
  try {
    await window.electronAPI?.captureDictationTarget?.();
  } catch {
    // Target capture is best-effort — a missed PID only costs the paste target.
  }
  try {
    await window.electronAPI?.showDictationPanel?.();
  } catch {
    // The HUD may already be visible.
  }
  await window.electronAPI?.emitSyncEvent?.(DICTATION_TOGGLE_EVENT);
}

/**
 * Live dictation state, mirrored from the overlay window. Stays idle when the
 * overlay never answers, so the capture button can never be permanently stuck
 * in a recording state it cannot stop.
 */
export function useDictationCaptureState(): DictationCaptureState {
  const [state, setState] = useState<DictationCaptureState>(IDLE_DICTATION_STATE);

  useEffect(() => {
    const dispose = window.electronAPI?.onSyncEvent?.((event) => {
      if (event?.name !== DICTATION_STATE_EVENT) return;
      setState(normalizeState(event.payload));
    });
    // A control panel opened mid-dictation has missed every state broadcast so
    // far, so ask the overlay to say it again.
    void window.electronAPI?.emitSyncEvent?.(DICTATION_STATE_REQUEST_EVENT);
    return () => dispose?.();
  }, []);

  return state;
}

export interface DictationHotkeyStatus {
  /** Still resolving what the main process registered — show no hint yet. */
  isResolving: boolean;
  /** Nothing is registered: the capture button is the only way in. */
  isRegistered: boolean;
  /** First registered hotkey, in Electron accelerator form. */
  hotkey: string | null;
}

/**
 * What the main process actually registered, not what the user asked for.
 * `get-active-dictation-key` returns null when no dictation hotkey is bound
 * (registration failed, or the user cleared it), which is exactly the case
 * where the capture button has to advertise itself as the fallback path.
 */
export function useDictationHotkeyStatus(): DictationHotkeyStatus {
  const activeKey = useSettingsStore((s) => s.activeDictationKey);
  const [resolved, setResolved] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      try {
        const key = await window.electronAPI?.getActiveDictationKey?.();
        if (!cancelled) setResolved(key ?? null);
      } catch {
        if (!cancelled) setResolved(null);
      } finally {
        if (!cancelled) setIsResolving(false);
      }
    };
    void read();
    return () => {
      cancelled = true;
    };
  }, []);

  // The store value arrives later via the `dictation-key-active` broadcast and
  // supersedes the one-shot read.
  const effective = activeKey ?? resolved;
  const first = parseHotkeyList(effective)[0] ?? null;

  return {
    isResolving: isResolving && !activeKey,
    isRegistered: first != null,
    hotkey: first ?? getDefaultHotkey(),
  };
}
