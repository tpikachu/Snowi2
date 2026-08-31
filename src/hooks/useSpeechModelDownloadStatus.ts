import { useModelDownload } from "./useModelDownload";
import { displayNameForModelId } from "./useOnboardingTranscriptionSetup";
import { useSettingsStore } from "../stores/settingsStore";
import { speechDownloadBlocksMeetingStart } from "../utils/speechModelDownloadGate";

export interface ActiveSpeechModelDownload {
  modelId: string;
  /** Human name from the registry, for the strip's "what is downloading". */
  displayName: string;
  percentage: number;
  isInstalling: boolean;
}

export interface SpeechModelDownloadStatus {
  /** The speech-model download currently running, or null. */
  active: ActiveSpeechModelDownload | null;
  /** True while the model meetings transcribe with is itself still missing. */
  blocksMeetingStart: boolean;
}

/**
 * App-shell observer for speech-model downloads.
 *
 * Onboarding starts the recommended model's download and deliberately lets the
 * user finish the flow while it runs — the download is owned by the main
 * process and survives the flow unmounting. This hook is how the control panel
 * finds that download again after onboarding: useModelDownload self-hydrates
 * from the main process on mount, so a strip rendered from this picks up an
 * already-running download with no extra wiring. It observes both engines,
 * because a recommendation can pair a Parakeet live model with a Whisper
 * archive model.
 */
export function useSpeechModelDownloadStatus(): SpeechModelDownloadStatus {
  const whisper = useModelDownload({ modelType: "whisper" });
  const parakeet = useModelDownload({ modelType: "parakeet" });

  const meetingUsesLocalModel = useSettingsStore((s) => s.meetingUseLocalWhisper);
  const meetingProvider = useSettingsStore((s) => s.meetingLocalTranscriptionProvider);
  const meetingWhisperModel = useSettingsStore((s) => s.meetingWhisperModel || s.whisperModel);
  const meetingParakeetModel = useSettingsStore((s) => s.meetingParakeetModel || s.parakeetModel);

  const engine = parakeet.isDownloading ? parakeet : whisper.isDownloading ? whisper : null;
  const active: ActiveSpeechModelDownload | null =
    engine && engine.downloadingModel
      ? {
          modelId: engine.downloadingModel,
          displayName: displayNameForModelId(engine.downloadingModel),
          percentage: engine.downloadProgress.percentage,
          isInstalling: engine.isInstalling,
        }
      : null;

  return {
    active,
    blocksMeetingStart: speechDownloadBlocksMeetingStart({
      downloadingModel: active?.modelId ?? null,
      meetingUsesLocalModel,
      meetingProvider,
      meetingWhisperModel,
      meetingParakeetModel,
    }),
  };
}
