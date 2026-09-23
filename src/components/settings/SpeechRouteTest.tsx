import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AudioLines } from "lucide-react";
import { Button } from "../ui/button";
import { SettingsRow } from "../ui/SettingsSection";
import { useAudioListen } from "../../hooks/useAudioListen";
import { getProviderDisplayName } from "../../models/ModelRegistry";
import { displayNameForModelId } from "../../hooks/useOnboardingTranscriptionSetup";
import {
  getMeetingMicConstraints,
  getMeetingTranscriptionOptions,
  useMeetingRecordingStore,
} from "../../stores/meetingRecordingStore";
import { cn } from "../lib/utils";

const RECORD_MS = 5000;
/** The meeting's stream rate (MEETING_STREAM_SAMPLE_RATE in main). */
const STREAM_SAMPLE_RATE = 24000;

/** The meeting start options (meetingTranscriptionRouting.js), loosely typed. */
type RouteOptions = Record<string, unknown> & { provider: string };

type Outcome =
  | { kind: "text"; text: string; route: string }
  | { kind: "empty"; route: string }
  | { kind: "failed"; error: string; route: string }
  | { kind: "busy" };

/** The recording, as 16-bit PCM at the meeting's stream rate. */
async function toStreamPcm(webm: ArrayBuffer): Promise<ArrayBuffer> {
  const context = new AudioContext({ sampleRate: STREAM_SAMPLE_RATE });
  try {
    // decodeAudioData resamples to the context's rate.
    const decoded = await context.decodeAudioData(webm.slice(0));
    const samples = decoded.getChannelData(0);
    const pcm = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const v = Math.max(-1, Math.min(1, samples[i]));
      pcm[i] = v < 0 ? v * 32768 : v * 32767;
    }
    return pcm.buffer;
  } finally {
    void context.close().catch(() => {});
  }
}

/**
 * "Test transcription" (Settings → Speech-to-Text → Note Recording, client
 * direction 2026-09-23): five seconds from the microphone, run through the
 * route a meeting would take — the batch transcribe IPC of the local engine
 * picked above, or main's `meeting-speech-test`, one realtime session built
 * as a meeting's mic stream is — and the result shown as it comes back: the
 * words, or the engine's own error verbatim. A cloud route's failure here
 * ("No OpenAI API key configured", "no credits", a host that does not
 * answer) is the failure the first meeting would otherwise have found.
 */
export function SpeechRouteTest() {
  const { t } = useTranslation();
  const isRecording = useMeetingRecordingStore((s) => s.isRecording);
  const listen = useAudioListen();
  const [transcribing, setTranscribing] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Set in the effect, not at construction: StrictMode runs the cleanup
  // once at mount, and a ref that only ever goes false stays false.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    if (isRecording) {
      setOutcome({ kind: "busy" });
      return;
    }
    setOutcome(null);

    // The route first: a mode the meeting cannot use fails here, before
    // the microphone opens.
    let options: RouteOptions;
    try {
      options = getMeetingTranscriptionOptions() as RouteOptions;
    } catch (error) {
      setOutcome({ kind: "failed", error: (error as Error).message, route: "" });
      return;
    }
    const local = options.provider === "local";
    const route = local
      ? t("settings.meeting.speechTest.routeLocal", {
          model: displayNameForModelId(String(options.localModel ?? "")),
        })
      : t("settings.meeting.speechTest.routeCloud", {
          model: String(options.model ?? ""),
          provider: getProviderDisplayName(String(options.provider).replace(/-realtime$/, "")),
        });

    const chunks: Blob[] = [];
    let recorder: MediaRecorder | null = null;
    const recorded = new Promise<Blob>((resolve) => {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        resolve(new Blob(chunks, { type: recorder?.mimeType || "audio/webm" }));
      };
      // The listen ends the stream; the recorder stops with its tracks.
      void listen
        .run(
          async () => navigator.mediaDevices.getUserMedia(await getMeetingMicConstraints()),
          RECORD_MS,
          (stream) => {
            recorder = new MediaRecorder(stream);
            recorder.ondataavailable = (event) => {
              if (event.data.size > 0) chunks.push(event.data);
            };
            recorder.onstop = settle;
            recorder.start(250);
          }
        )
        .then(() => {
          if (recorder && recorder.state !== "inactive") recorder.stop();
          else settle();
        })
        .catch((error: Error) => {
          if (mounted.current) setOutcome({ kind: "failed", error: error.message, route });
          settle();
        });
    });

    const blob = await recorded;
    if (!mounted.current || blob.size === 0) {
      if (mounted.current && blob.size === 0 && !outcome) {
        setOutcome({ kind: "empty", route });
      }
      return;
    }
    setTranscribing(route);
    try {
      const webm = await blob.arrayBuffer();
      let text = "";
      if (local) {
        const request = {
          model: String(options.localModel ?? ""),
          language: options.language as string | undefined,
        };
        const result =
          options.localProvider === "nvidia"
            ? await window.electronAPI?.transcribeLocalParakeet?.(webm, request)
            : await window.electronAPI?.transcribeLocalWhisper?.(webm, request);
        if (!result?.success) {
          throw new Error(result?.message || result?.error || "Transcription failed");
        }
        text = result.text ?? "";
      } else {
        const pcm = await toStreamPcm(webm);
        const result = await window.electronAPI?.meetingSpeechTest?.(pcm, options);
        if (!result) throw new Error("Transcription is unavailable in this window");
        if (result.reason === "busy") {
          if (mounted.current) setOutcome({ kind: "busy" });
          return;
        }
        if (!result.success) throw new Error(result.error || "Transcription failed");
        text = result.text ?? "";
      }
      if (!mounted.current) return;
      setOutcome(
        text.trim() ? { kind: "text", text: text.trim(), route } : { kind: "empty", route }
      );
    } catch (error) {
      if (mounted.current) setOutcome({ kind: "failed", error: (error as Error).message, route });
    } finally {
      if (mounted.current) setTranscribing(null);
    }
  }, [isRecording, listen, outcome, t]);

  const busy = listen.active || transcribing !== null;

  return (
    <div data-speech-test="" className="space-y-2">
      <SettingsRow
        label={t("settings.meeting.speechTest.title")}
        description={t("settings.meeting.speechTest.description")}
      >
        <Button variant="outline" size="sm" onClick={run} disabled={isRecording || busy}>
          <AudioLines className="mr-1.5 h-3.5 w-3.5" />
          {t("settings.meeting.speechTest.action")}
        </Button>
      </SettingsRow>
      {listen.active && (
        <div className="space-y-1.5">
          <div
            role="meter"
            aria-label={t("audioCheck.level")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.round((listen.level / 0.3) * 100))}
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
          >
            <div
              className="h-full rounded-full bg-success transition-[width] duration-75"
              style={{ width: `${Math.min(100, Math.round((listen.level / 0.3) * 100))}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("settings.meeting.speechTest.recording", { seconds: listen.seconds })}
          </p>
        </div>
      )}
      {transcribing && (
        <p className="text-xs text-muted-foreground">
          {t("settings.meeting.speechTest.transcribing", { route: transcribing })}
        </p>
      )}
      {outcome && !busy && (
        <div
          data-speech-test-result={outcome.kind}
          className={cn(
            "rounded-lg border px-3 py-2 text-xs leading-relaxed",
            outcome.kind === "text"
              ? "border-success/30 bg-success-subtle text-foreground"
              : "border-border-subtle bg-surface-1 text-muted-foreground"
          )}
        >
          {outcome.kind === "text" && (
            <>
              <span className="font-medium text-success">
                {t("settings.meeting.speechTest.heard")}
              </span>{" "}
              <span data-speech-test-text="">{outcome.text}</span>
            </>
          )}
          {outcome.kind === "empty" && t("settings.meeting.speechTest.empty")}
          {outcome.kind === "failed" &&
            t("settings.meeting.speechTest.failed", { error: outcome.error })}
          {outcome.kind === "busy" && t("settings.meeting.speechTest.busy")}
          {outcome.kind !== "busy" && outcome.route && (
            <span className="ml-1.5 text-muted-foreground/70">{outcome.route}</span>
          )}
        </div>
      )}
    </div>
  );
}
