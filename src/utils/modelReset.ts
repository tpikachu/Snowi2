/**
 * What "Remove models" in Settings → System resets, besides the files.
 *
 * Deleting every downloaded model used to leave the model choices as they
 * were: the speech route still named a model that was gone, Home still
 * called transcription ready, and the first meeting after the cleanup had
 * nothing to transcribe with (client, 2026-09-23: "it should reset every
 * model configuration to let the user configure again"). The reset puts
 * every model choice back to a fresh install's — speech on the local engine
 * with no model picked, in all three speech scopes (dictation, meetings,
 * uploads), and the AI model cleared — and keeps every API key: a key is a
 * credential, not a model choice, and re-entering one is not what the
 * person asked for.
 *
 * The store applies this plan; the AI model is then handed to the same
 * launch-time repair that adopts a keyed provider's default, so the state
 * after the reset is the state after the next relaunch.
 */
export interface ModelResetPlan {
  /** String settings to write, by store key. */
  strings: Record<string, string>;
  /** Boolean settings to write, by store key. */
  booleans: Record<string, boolean>;
}

const SPEECH_SCOPES = ["", "meeting", "upload"] as const;

const scoped = (scope: string, key: string) =>
  scope ? `${scope}${key[0].toUpperCase()}${key.slice(1)}` : key;

export function planDownloadedModelsReset(): ModelResetPlan {
  const strings: Record<string, string> = {};
  const booleans: Record<string, boolean> = {};
  for (const scope of SPEECH_SCOPES) {
    strings[scoped(scope, "transcriptionMode")] = "local";
    booleans[scoped(scope, "useLocalWhisper")] = true;
    // The recommended engine, the one onboarding sets up.
    strings[scoped(scope, "localTranscriptionProvider")] = "nvidia";
    strings[scoped(scope, "whisperModel")] = "";
    strings[scoped(scope, "parakeetModel")] = "";
    strings[scoped(scope, "cloudTranscriptionProvider")] = "";
    strings[scoped(scope, "cloudTranscriptionModel")] = "";
  }
  return { strings, booleans };
}
