import { useEffect, useState } from "react";

export type BarSetupItemId = "microphone" | "speech" | "actions" | "chatIntelligence";

/**
 * The assistant bar's warning icons: which pieces of setup are still missing.
 *
 * Speech and AI readiness arrive from the control panel window via the
 * bar-status channel (see useBarStatusPublisher) — that window's settings
 * store is the live one. The microphone is checked here: it is an OS fact,
 * not a settings-store fact. Everything defaults to "ok" until told
 * otherwise, so the bar never flashes warnings while the app boots.
 *
 * None of this gates the start button — a meeting only needs transcription,
 * and that has its own download gate. These icons just say what to finish.
 */
export function useBarSetupStatus(): BarSetupItemId[] {
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

  const [remote, setRemote] = useState({ speechOk: true, actionsOk: true, chatOk: true });
  useEffect(() => {
    let cancelled = false;
    const apply = (
      status: { speechOk?: boolean; actionsOk?: boolean; chatOk?: boolean } | null
    ) => {
      if (!status) return;
      setRemote({
        speechOk: status.speechOk !== false,
        actionsOk: status.actionsOk !== false,
        chatOk: status.chatOk !== false,
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

  // Same order as the Home card's capability rows, mic first.
  const missing: BarSetupItemId[] = [];
  if (!micOk) missing.push("microphone");
  if (!remote.speechOk) missing.push("speech");
  if (!remote.actionsOk) missing.push("actions");
  if (!remote.chatOk) missing.push("chatIntelligence");
  return missing;
}
