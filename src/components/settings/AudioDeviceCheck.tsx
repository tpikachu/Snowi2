import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mic, Speaker } from "lucide-react";
import { Button } from "../ui/button";
import { SettingsPanel, SettingsPanelRow, SettingsRow } from "../ui/SettingsSection";
import { useAudioListen } from "../../hooks/useAudioListen";
import { LISTEN_MS, type LevelVerdict } from "../../utils/audioLevelCheck";
import {
  getMeetingMicConstraints,
  requestSystemAudioDisplayStream,
  useMeetingRecordingStore,
} from "../../stores/meetingRecordingStore";
import { getDisplayCaptureModeForStrategy } from "../../utils/systemAudioAccess";
import { cn } from "../lib/utils";

type Verdict = LevelVerdict | "unsupported" | "busy" | "failed";

interface CheckResult {
  verdict: Verdict;
  peak?: number;
  strategy?: string;
  error?: string;
}

/** The moving bar: full at a comfortable speaking level, not at digital full scale. */
const METER_FULL_RMS = 0.3;

function LevelMeter({ level, label }: { level: number; label: string }) {
  const percent = Math.min(100, Math.round((level / METER_FULL_RMS) * 100));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
    >
      <div
        className="h-full rounded-full bg-success transition-[width] duration-75"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/**
 * "Check your devices" (Settings → General → Microphone, client direction
 * 2026-09-23): two listens of a few seconds each that say whether Snowy
 * hears the microphone and what the computer plays — the two sources a
 * meeting transcribes — before a meeting finds out. The microphone is
 * opened with the meeting's own constraints; system audio goes through
 * main's `system-audio-listen` (the native helper a meeting would use) or,
 * where the meeting captures in the renderer, through the same display
 * media request. Neither runs while a meeting records.
 */
export function AudioDeviceCheck() {
  const { t } = useTranslation();
  const isRecording = useMeetingRecordingStore((s) => s.isRecording);
  const mic = useAudioListen();
  const system = useAudioListen();
  const [micResult, setMicResult] = useState<CheckResult | null>(null);
  const [systemResult, setSystemResult] = useState<CheckResult | null>(null);
  const [systemBusy, setSystemBusy] = useState(false);
  const [systemSeconds, setSystemSeconds] = useState(0);
  // Set in the effect, not at construction: StrictMode runs the cleanup
  // once at mount, and a ref that only ever goes false stays false.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const runMic = useCallback(async () => {
    if (isRecording) {
      setMicResult({ verdict: "busy" });
      return;
    }
    setMicResult(null);
    try {
      const result = await mic.run(
        async () => navigator.mediaDevices.getUserMedia(await getMeetingMicConstraints()),
        LISTEN_MS
      );
      if (mounted.current) setMicResult(result);
    } catch (error) {
      if (mounted.current) setMicResult({ verdict: "failed", error: (error as Error).message });
    }
  }, [isRecording, mic]);

  const runSystem = useCallback(async () => {
    if (isRecording) {
      setSystemResult({ verdict: "busy" });
      return;
    }
    setSystemResult(null);
    setSystemBusy(true);
    // The native helpers meter in main, which reports nothing until the
    // listen ends; the countdown here is the only sign it is running.
    const endsAt = Date.now() + LISTEN_MS;
    setSystemSeconds(Math.ceil(LISTEN_MS / 1000));
    const countdown = setInterval(() => {
      setSystemSeconds(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    }, 250);
    try {
      const listen = await window.electronAPI?.systemAudioListen?.({ durationMs: LISTEN_MS });
      if (!listen) {
        setSystemResult({ verdict: "unsupported" });
        return;
      }
      if (!listen.success) {
        setSystemResult({
          verdict: listen.reason === "busy" ? "busy" : "failed",
          strategy: listen.strategy,
          error: listen.error,
        });
        return;
      }
      if (listen.rendererCapture) {
        clearInterval(countdown);
        setSystemBusy(false);
        // The renderer captures only through the loopback strategy.
        const mode = getDisplayCaptureModeForStrategy("loopback");
        const result = await system.run(async () => {
          const { stream, error } = await requestSystemAudioDisplayStream(mode);
          if (!stream) throw error ?? new Error("No system-audio track was returned.");
          return stream;
        }, LISTEN_MS);
        if (mounted.current) setSystemResult({ ...result, strategy: listen.strategy });
        return;
      }
      setSystemResult({
        verdict: (listen.verdict ?? "nothing") as Verdict,
        peak: listen.peak,
        strategy: listen.strategy,
      });
    } catch (error) {
      if (mounted.current) setSystemResult({ verdict: "failed", error: (error as Error).message });
    } finally {
      clearInterval(countdown);
      if (mounted.current) setSystemBusy(false);
    }
  }, [isRecording, system]);

  const verdictCopy = (result: CheckResult, source: "mic" | "system") => {
    switch (result.verdict) {
      case "heard":
        return t(source === "mic" ? "audioCheck.result.heard" : "audioCheck.result.heardSystem");
      case "silent":
        return t(source === "mic" ? "audioCheck.result.silent" : "audioCheck.result.silentSystem");
      case "nothing":
        return t("audioCheck.result.nothing");
      case "busy":
        return t("audioCheck.result.busy");
      case "unsupported":
        return t("audioCheck.result.unsupported");
      default:
        return t("audioCheck.result.failed", { error: result.error ?? "" });
    }
  };

  const strategyLabel = (strategy?: string) =>
    strategy && strategy !== "unsupported"
      ? t("audioCheck.via", { strategy: t(`audioCheck.strategy.${strategy}`) })
      : null;

  const renderResult = (result: CheckResult | null, source: "mic" | "system") => {
    if (!result) return null;
    const good = result.verdict === "heard";
    return (
      <p
        data-audio-verdict={result.verdict}
        className={cn(
          "text-xs leading-relaxed",
          good
            ? "text-success"
            : result.verdict === "silent"
              ? "text-warning"
              : "text-muted-foreground"
        )}
      >
        {verdictCopy(result, source)}
        {typeof result.peak === "number" && result.verdict !== "nothing" && (
          <span className="ml-1.5 text-muted-foreground/70">
            {t("audioCheck.peak", { percent: Math.round((result.peak / METER_FULL_RMS) * 100) })}
          </span>
        )}
        {source === "system" && strategyLabel(result.strategy) && (
          <span className="ml-1.5 text-muted-foreground/70">{strategyLabel(result.strategy)}</span>
        )}
      </p>
    );
  };

  const systemActive = systemBusy || system.active;
  const systemLeft = system.active ? system.seconds : systemSeconds;

  return (
    <SettingsPanel>
      <SettingsPanelRow>
        <div data-audio-check="mic" className="space-y-2">
          <SettingsRow
            label={t("audioCheck.mic.label")}
            description={t("audioCheck.mic.description")}
          >
            {mic.active ? (
              <Button variant="outline" size="sm" onClick={mic.stop}>
                {t("audioCheck.stop")}
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={runMic} disabled={isRecording}>
                <Mic className="mr-1.5 h-3.5 w-3.5" />
                {t("audioCheck.mic.action")}
              </Button>
            )}
          </SettingsRow>
          {mic.active && (
            <div className="space-y-1.5">
              <LevelMeter level={mic.level} label={t("audioCheck.level")} />
              <p className="text-xs text-muted-foreground">
                {t("audioCheck.listening", { seconds: mic.seconds })}
              </p>
            </div>
          )}
          {!mic.active && renderResult(micResult, "mic")}
        </div>
      </SettingsPanelRow>
      <SettingsPanelRow>
        <div data-audio-check="system" className="space-y-2">
          <SettingsRow
            label={t("audioCheck.system.label")}
            description={t("audioCheck.system.description")}
          >
            {system.active ? (
              <Button variant="outline" size="sm" onClick={system.stop}>
                {t("audioCheck.stop")}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={runSystem}
                disabled={isRecording || systemBusy}
              >
                <Speaker className="mr-1.5 h-3.5 w-3.5" />
                {t("audioCheck.system.action")}
              </Button>
            )}
          </SettingsRow>
          {systemActive && (
            <div className="space-y-1.5">
              {system.active && <LevelMeter level={system.level} label={t("audioCheck.level")} />}
              <p className="text-xs text-muted-foreground">
                {t("audioCheck.listening", { seconds: systemLeft })}
              </p>
            </div>
          )}
          {!systemActive && renderResult(systemResult, "system")}
        </div>
      </SettingsPanelRow>
    </SettingsPanel>
  );
}
