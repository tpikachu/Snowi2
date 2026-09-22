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
 * Local and self-hosted engines are "ready" here: the download gate on the
 * dot's start button covers a missing local model, and this predicate is
 * about credentials.
 */
export type SpeechRouteReadiness = "ready" | "needsKey" | "needsModel";

export interface SpeechRouteInput {
  transcriptionMode: string;
  provider: string;
  model: string;
  /** The stored value of a credential field, by its settings-store key. */
  secret: (field: string) => string;
}

export function speechRouteReadiness(input: SpeechRouteInput): SpeechRouteReadiness {
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
