import { useCallback, useEffect, useRef, useState } from "react";
import type { CapabilitySnapshot, TranscriptionRecommendation } from "../types/electron";

/**
 * What this machine should run for transcription, measured rather than guessed.
 *
 * The main process caches the hardware probe against a fingerprint of the
 * machine, so this is a file read on every launch after the first — cheap
 * enough to call whenever the setup UI mounts, and it re-measures on its own
 * when the hardware actually changes.
 */
export function useTranscriptionRecommendation(language: "en" | "multilingual" = "en") {
  const [recommendation, setRecommendation] = useState<TranscriptionRecommendation | null>(null);
  const [capability, setCapability] = useState<CapabilitySnapshot | null>(null);
  const [probeFailed, setProbeFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  // Guards against a slow first probe resolving after a faster later one and
  // overwriting it — switching language remounts the request, and the probe is
  // only fast once it has been cached.
  const requestIdRef = useRef(0);

  const load = useCallback(
    async (force = false) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      try {
        const result = await window.electronAPI?.getTranscriptionRecommendation({
          language,
          force,
        });
        if (requestId !== requestIdRef.current) return;

        if (result?.recommendation) {
          setRecommendation(result.recommendation);
          setCapability(result.capability ?? null);
          setProbeFailed(result.probeFailed === true);
        }
      } catch {
        // Main already substitutes the conservative tier when the probe throws,
        // so reaching here means the IPC itself failed. Leaving `recommendation`
        // null is what the caller renders its own fallback for.
        if (requestId === requestIdRef.current) setProbeFailed(true);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [language]
  );

  useEffect(() => {
    void load();
  }, [load]);

  return {
    recommendation,
    capability,
    probeFailed,
    loading,
    refresh: useCallback(() => load(true), [load]),
  };
}
