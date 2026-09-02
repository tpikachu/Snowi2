import { useEffect, useState } from "react";

export type BarSetupItemId = "microphone" | "speech" | "intelligence";

export interface BarDownloadStatus {
  /** Human model name from the registry, for the tooltip. */
  displayName: string;
  percentage: number;
  isInstalling: boolean;
}

export interface BarSetupStatus {
  /** Which pieces of setup are still missing, Home-card order, mic first. */
  missing: BarSetupItemId[];
  /** The speech-model download currently running, or null. */
  download: BarDownloadStatus | null;
  /** True while the model meetings transcribe with is itself still missing. */
  downloadBlocksMeetingStart: boolean;
}

/**
 * The assistant bar's view of setup and download state.
 *
 * Speech, AI readiness, and download progress arrive from the control panel
 * window via the bar-status channel (see useBarStatusPublisher) — that
 * window's settings store is the live one, and it is also the only window
 * the download's progress events reach. The microphone is checked here: it
 * is an OS fact, not a settings-store fact. Everything defaults to "ok"
 * until told otherwise, so the bar never flashes warnings while the app
 * boots.
 *
 * None of this gates the start button beyond downloadBlocksMeetingStart —
 * a meeting only needs transcription. The warnings just say what to finish.
 */
export function useBarSetupStatus(): BarSetupStatus {
  const [micOk, setMicOk] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const access = await window.electronAPI?.checkMicrophoneAccess?.();
        if (cancelled) return;
        if (access && access.granted === false) {
          setMicOk(false);
          return;
        }
        setMicOk(localStorage.getItem("micPermissionGranted") === "true");
      } catch {
        if (!cancelled) setMicOk(true);
      }
    };
    void check();
    const onWake = () => void check();
    window.addEventListener("focus", onWake);
    window.addEventListener("storage", onWake);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onWake);
      window.removeEventListener("storage", onWake);
    };
  }, []);

  const [remote, setRemote] = useState<{
    speechOk: boolean;
    actionsOk: boolean;
    chatOk: boolean;
    downloadBlocksMeetingStart: boolean;
    download: BarDownloadStatus | null;
  }>({
    speechOk: true,
    actionsOk: true,
    chatOk: true,
    downloadBlocksMeetingStart: false,
    download: null,
  });
  useEffect(() => {
    let cancelled = false;
    const apply = (
      status: {
        speechOk?: boolean;
        actionsOk?: boolean;
        chatOk?: boolean;
        downloadBlocksMeetingStart?: boolean;
        download?: BarDownloadStatus | null;
      } | null
    ) => {
      if (!status) return;
      setRemote({
        speechOk: status.speechOk !== false,
        actionsOk: status.actionsOk !== false,
        chatOk: status.chatOk !== false,
        downloadBlocksMeetingStart: status.downloadBlocksMeetingStart === true,
        download: status.download ?? null,
      });
    };
    window.electronAPI
      ?.getBarStatus?.()
      .then((status) => {
        if (!cancelled) apply(status);
      })
      .catch(() => {});
    const unsubscribe = window.electronAPI?.onBarStatus?.((status) => apply(status));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // Same order as the Home card's capability rows, mic first. Actions and
  // chat share one LLM now, so their two wire booleans collapse into a
  // single "intelligence" warning — one gap, one line, one fix.
  const missing: BarSetupItemId[] = [];
  if (!micOk) missing.push("microphone");
  if (!remote.speechOk) missing.push("speech");
  if (!remote.actionsOk || !remote.chatOk) missing.push("intelligence");
  return {
    missing,
    download: remote.download,
    downloadBlocksMeetingStart: remote.downloadBlocksMeetingStart,
  };
}
