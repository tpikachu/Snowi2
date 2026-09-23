import { PROVIDER_CREDENTIALS } from "../components/transcription/providerCredentials";

/**
 * Whether the meeting's speech route could transcribe a meeting right now.
 *
 * Settings → Speech-to-Text marked the Cloud Providers card and the chosen
 * model "Active" the moment they were selected, key or no key, and Home's
 * capabilities card called transcription ready in the same state — so a
 * person who picked OpenAI and never pasted a key learned it from the first
 * meeting failing with "No OpenAI API key configured" (client, 2026-09-22).
 * Readiness is judged the way the request path will: the provider must be
 * one the meeting route knows, every secret it needs must be stored, and a
 * model must be picked.
 *
 * A local engine is judged the same way (2026-09-23): the model the route
 * would load must be on disk. Until then a local engine was "ready" no
 * matter what — a model picked and never downloaded, or deleted from
 * Settings → System after it was picked, left Home saying transcription
 * worked while the first meeting had nothing to transcribe with. When the
 * disk has not been read yet (`installed` answers null) the engine is taken
 * as ready, which is the old answer and never a false alarm.
 */
export type SpeechRouteReadiness = "ready" | "needsKey" | "needsModel" | "needsDownload";

export interface SpeechRouteInput {
  transcriptionMode: string;
  provider: string;
  model: string;
  /** The stored value of a credential field, by its settings-store key. */
  secret: (field: string) => string;
  /** The local engine ("whisper" | "nvidia") and the model picked on it. */
  localProvider?: string;
  localModel?: string;
  /** The model the route loads when none is picked (the routing's own default). */
  localFallbackModel?: string;
  /**
   * Whether this engine's model is on disk: true / false, or null when the
   * disk has not been listed yet.
   */
  installed?: (provider: string, model: string) => boolean | null;
}

export function speechRouteReadiness(input: SpeechRouteInput): SpeechRouteReadiness {
  if (input.transcriptionMode === "local") return localReadiness(input);
  if (input.transcriptionMode !== "providers") return "ready";
  const fields = PROVIDER_CREDENTIALS[input.provider]?.fields;
  // A provider the meeting route cannot stream through ("custom", or none
  // at all) has nothing to transcribe with; the picker corrects it to the
  // first provider on its next visit.
  if (!fields) return "needsModel";
  const keyed = fields.every(
    (field) => field.input !== "secret" || input.secret(field.key).trim().length > 0
  );
  if (!keyed) return "needsKey";
  return input.model.trim() ? "ready" : "needsModel";
}

function localReadiness(input: SpeechRouteInput): SpeechRouteReadiness {
  // A caller that does not consult the disk gets the old answer.
  if (!input.installed) return "ready";
  const picked = (input.localModel ?? "").trim();
  const effective = picked || (input.localFallbackModel ?? "").trim();
  if (!effective) return "needsModel";
  const onDisk = input.installed(input.localProvider ?? "", effective);
  if (onDisk !== false) return "ready";
  // A pick that is not on disk wants its download; no pick at all, with the
  // route's fallback missing too, wants a choice.
  return picked ? "needsDownload" : "needsModel";
}
