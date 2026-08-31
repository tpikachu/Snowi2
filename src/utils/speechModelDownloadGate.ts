/**
 * Whether an in-flight speech-model download should block starting a meeting.
 *
 * Blocking is deliberately narrow: only the model the meeting transcription is
 * actually configured to use blocks. A second model downloading in the
 * background (the archive model, or an upgrade picked in Settings while a
 * working model is already on disk) must never lock the Start button — the
 * meeting would transcribe fine without it.
 */
export interface SpeechDownloadGateInput {
  /** Model id currently downloading, or null when idle. */
  downloadingModel: string | null;
  /** Whether meeting transcription runs locally at all — cloud modes never block. */
  meetingUsesLocalModel: boolean;
  /** The local engine meetings are configured for. */
  meetingProvider: "whisper" | "nvidia";
  /** The configured model id per engine (already fallen back to the dictation scope). */
  meetingWhisperModel: string;
  meetingParakeetModel: string;
}

export function speechDownloadBlocksMeetingStart(input: SpeechDownloadGateInput): boolean {
  if (!input.downloadingModel || !input.meetingUsesLocalModel) return false;
  const needed =
    input.meetingProvider === "nvidia" ? input.meetingParakeetModel : input.meetingWhisperModel;
  return needed !== "" && input.downloadingModel === needed;
}
