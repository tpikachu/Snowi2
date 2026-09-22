import { getModelFamilyConstraints } from "./modelFamilyConstraints";

/**
 * Recovery for a rejected reasoning-effort value.
 *
 * modelFamilyConstraints says which value means "thinking off" for a family,
 * and that table is a guess OpenAI can invalidate any week: the 5.6
 * generation dropped "minimal" first, then 5.2 and 5.5 turned out to have
 * done the same (live probe, 2026-09-11 — while gpt-5-mini and gpt-5-nano
 * still take "minimal" and reject "none"). A client's Generate Notes died on
 * gpt-5.5 while the table said "minimal". The 400 names the enum outright,
 * in either of the wordings the API has used:
 *
 *   Unsupported value: 'minimal' is not supported with the 'gpt-5.5' model.
 *   Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
 *
 *   Unsupported value: 'reasoning_effort' does not support 'minimal' with
 *   this model. Supported values are: 'none', 'low', 'medium', 'high', ...
 *
 * So the reply is the source of truth. This module reads it, picks the best
 * off-switch the model does accept, and remembers it per model for the
 * session so the retry — and every request after it — is right first time.
 *
 * Pure apart from the session memory; no runtime imports beyond the table.
 */

const SUPPORTED_VALUES = /supported values (?:are|is)\s*:?\s*([^.\n]+)/i;
const QUOTED = /['"`]([a-z_-]+)['"`]/gi;

/** Off-ish values in order of preference: a true off switch, then the floors. */
const SUPPRESS_PREFERENCE = ["none", "minimal", "low"] as const;

/** The list is an effort enum, not some other parameter's ("auto", "flex"…). */
const isEffortEnum = (values: readonly string[]): boolean =>
  values.some((v) => v === "medium" || v === "high") &&
  values.some((v) => v === "none" || v === "minimal" || v === "low");

/** The effort values an API error says the model accepts, or null. */
export function supportedEffortsFromError(text: string | null | undefined): string[] | null {
  if (!text) return null;
  const match = SUPPORTED_VALUES.exec(text);
  if (!match) return null;
  // Read from a raw response body, the quotes may arrive JSON-escaped.
  const list = match[1].replace(/\\/g, "");
  const values = Array.from(list.matchAll(QUOTED), (m) => m[1].toLowerCase());
  return values.length > 0 && isEffortEnum(values) ? values : null;
}

/** The best "thinking off" value on a supported list, or null when none is. */
export function pickSuppressEffort(supported: readonly string[]): string | null {
  return SUPPRESS_PREFERENCE.find((value) => supported.includes(value)) ?? null;
}

/** What an API error said, from either place an AI-SDK or fetch error keeps it. */
export function apiErrorText(error: unknown): string {
  const record = error as { message?: unknown; responseBody?: unknown } | null;
  return [record?.message, record?.responseBody]
    .filter((part): part is string => typeof part === "string")
    .join("\n");
}

const learned = new Map<string, string>();

export function rememberSuppressEffort(model: string, value: string): void {
  const id = model.trim().toLowerCase();
  if (id) learned.set(id, value);
}

export function learnedSuppressEffort(model: string | null | undefined): string | null {
  const id = (model || "").trim().toLowerCase();
  return (id && learned.get(id)) || null;
}

/** Test seam. */
export function forgetLearnedEfforts(): void {
  learned.clear();
}

/**
 * The value to send for "thinking off": what the API taught us for this
 * model, else the family table, else the caller's default.
 */
export function resolveSuppressEffort(model: string | null | undefined, fallback: string): string {
  return (
    learnedSuppressEffort(model) ??
    getModelFamilyConstraints(model)?.reasoningEffort?.suppressValue ??
    fallback
  );
}

/**
 * Reads a rejection and remembers what the model accepts. Returns the value
 * to retry with, or null when the error is not an effort rejection or offers
 * nothing different from what was sent — the caller retries only on a value.
 */
export function learnSuppressEffortFromError(
  model: string,
  sent: string | undefined,
  text: string | null | undefined
): string | null {
  const supported = supportedEffortsFromError(text);
  if (!supported) return null;
  const pick = pickSuppressEffort(supported);
  if (!pick || pick === sent) return null;
  rememberSuppressEffort(model, pick);
  return pick;
}

/**
 * OpenRouter's "thinking off" is its own request field, and for some models
 * it is refused outright:
 *
 *   Reasoning is mandatory for this endpoint and cannot be disabled.
 *
 * (GPT-5 Mini through OpenRouter — client report, 2026-09-22.) The disable
 * is right for the models that take it (Qwen, DeepSeek), so it stays the
 * first thing sent; a model that refuses it is remembered for the session
 * and asked for the lowest effort instead — the retry and every request
 * after it are right first time.
 */
const MANDATORY_REASONING = /reasoning is mandatory|cannot be disabled/i;
const OPENROUTER_FLOOR_EFFORT = "low";

const mandatoryReasoning = new Set<string>();

export type OpenrouterReasoning = { enabled: false } | { effort: string };

/** The reasoning field that means "thinking off" for this OpenRouter model. */
export function openrouterReasoningOff(model: string | null | undefined): OpenrouterReasoning {
  const id = (model || "").trim().toLowerCase();
  return id && mandatoryReasoning.has(id)
    ? { effort: OPENROUTER_FLOOR_EFFORT }
    : { enabled: false };
}

/** Whether the request body carries the disable that OpenRouter can refuse. */
export function sentReasoningDisable(requestBody: Record<string, unknown>): boolean {
  const reasoning = requestBody.reasoning as { enabled?: unknown } | undefined;
  return !!reasoning && typeof reasoning === "object" && reasoning.enabled === false;
}

/**
 * Reads a rejection and remembers that this model's reasoning cannot be
 * disabled. True when that was just learned — the caller retries once on
 * it; a model already known, or any other error, is false.
 */
export function learnMandatoryReasoningFromError(
  model: string,
  text: string | null | undefined
): boolean {
  if (!text || !MANDATORY_REASONING.test(text)) return false;
  const id = model.trim().toLowerCase();
  if (!id || mandatoryReasoning.has(id)) return false;
  mandatoryReasoning.add(id);
  return true;
}

/** Test seam. */
export function forgetMandatoryReasoning(): void {
  mandatoryReasoning.clear();
}
