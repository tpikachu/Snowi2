import type { ReasoningConfig } from "../BaseReasoningService";
import { getOpenAiApiConfig } from "../../models/ModelRegistry";
import { detectEndpointDialect } from "./thinkingSuppressionDialects";
import { getModelFamilyConstraints } from "./modelFamilyConstraints";
import { learnSuppressEffortFromError } from "./reasoningEffortRecovery";
import { applyThinkingSuppression } from "./thinkingSuppression";

/**
 * Providers whose OpenAI-compat chat endpoints speak the legacy shape: always
 * `max_tokens`, always `temperature`. Groq's registry entries carry no
 * tokenParam and its ids don't match the OpenAI fallback heuristics; Tinfoil's
 * catalog is dynamic (models outside the registry must not fall through to
 * `max_completion_tokens`); local/lan are llama.cpp-style servers.
 */
const LEGACY_CHAT_COMPLETIONS_PROVIDERS = new Set(["local", "lan", "groq", "tinfoil", "corti"]);

/**
 * Single place that turns (model, provider, endpoint, config) into the
 * parameter set of an OpenAI-compatible chat-completions body: token-limit
 * param, temperature, family reasoning effort, and thinking suppression.
 * Callers own `model`/`messages`/`stream`; this owns every tunable param, so
 * a family or provider fact changed in the data tables reaches all transports
 * at once instead of one call site at a time (#1611).
 */
export function applyChatCompletionsParams(
  requestBody: Record<string, unknown>,
  {
    model,
    provider,
    endpoint,
    config,
    maxTokens,
  }: {
    model: string;
    provider: string;
    endpoint?: string | null;
    config: ReasoningConfig;
    maxTokens: number;
  }
): void {
  const providerKey = provider.toLowerCase();
  // No systemPrompt override means the default cleanup path: a deterministic
  // transform, so zero temperature.
  const defaultTemperature = config.systemPrompt ? 0.3 : 0;

  if (LEGACY_CHAT_COMPLETIONS_PROVIDERS.has(providerKey)) {
    requestBody.max_tokens = maxTokens;
    requestBody.temperature = config.temperature ?? defaultTemperature;
  } else {
    // A known endpoint host knows its own request shape better than the model id does.
    const apiConfig = detectEndpointDialect(endpoint) ?? getOpenAiApiConfig(model, providerKey);
    requestBody[apiConfig.tokenParam] = maxTokens;
    if (apiConfig.supportsTemperature) {
      requestBody.temperature = config.temperature ?? defaultTemperature;
    }
  }

  // Deterministic transforms (cleanup, selection edits) pin the family's
  // preferred effort — see modelFamilyConstraints for the gpt-oss rationale.
  // applyThinkingSuppression still wins when thinking is disabled by the user.
  const familyEffort = getModelFamilyConstraints(model)?.reasoningEffort;
  if (familyEffort?.cleanupValue && (!config.systemPrompt || config.requireCompleteOutput)) {
    requestBody.reasoning_effort = familyEffort.cleanupValue;
  }

  applyThinkingSuppression(requestBody, model, provider, config, endpoint ?? undefined);
}

/** Finish reasons that mean the output hit the token cap, across providers. */
export function isTruncatedFinishReason(reason: unknown): boolean {
  return reason === "length" || reason === "max_tokens";
}

/**
 * Shaped params a backend may reject by name with a 400/422. Only params this
 * module's shaping layer added are strippable — never messages or model — so a
 * retry degrades the request (model reasons when asked not to, default
 * sampling) instead of failing it outright. The strip is logged loudly: a
 * fallback that fires on every request is a dialect bug to fix, not a rescue.
 */
const STRIPPABLE_SHAPED_PARAMS = [
  "reasoning_effort",
  "chat_template_kwargs",
  "thinking",
  "think",
  "temperature",
] as const;

/** The effort value a shaped body carries, in either OpenAI shape. */
function sentSuppressEffort(requestBody: Record<string, unknown>): string | undefined {
  const reasoning = requestBody.reasoning as { effort?: unknown } | undefined;
  if (reasoning && typeof reasoning === "object" && typeof reasoning.effort === "string") {
    return reasoning.effort;
  }
  return typeof requestBody.reasoning_effort === "string"
    ? requestBody.reasoning_effort
    : undefined;
}

function setSuppressEffort(requestBody: Record<string, unknown>, effort: string): void {
  const reasoning = requestBody.reasoning as { effort?: unknown } | undefined;
  if (reasoning && typeof reasoning === "object" && "effort" in reasoning) {
    reasoning.effort = effort;
    return;
  }
  requestBody.reasoning_effort = effort;
}

/**
 * Fetch with a bounded ladder for 400/422 rejections.
 * Rung 0 (corrective): a rejected reasoning-effort value is replaced by the
 * best off-switch the error's own "supported values" list allows — the
 * request keeps a low-latency effort instead of losing it to the blind strip,
 * and the value is remembered for the model (reasoningEffortRecovery).
 * Rung 1 (blind): old Ollama/strict proxies reject the `reasoning` object
 * without naming it — drop it and retry once. Rung 2 (named): strip exactly
 * the shaped params the error body names and retry once. At most three
 * retries; the caller must build the body inside `doFetch` so retries
 * re-serialize.
 */
export async function fetchWithParamFallback(
  doFetch: () => Promise<Response>,
  requestBody: Record<string, unknown>,
  logRejection: (details: {
    status: number;
    stripped: string[];
    corrected?: { effort: string };
  }) => void
): Promise<Response> {
  let res = await doFetch();
  if (res.ok || (res.status !== 400 && res.status !== 422)) return res;

  const sentEffort = sentSuppressEffort(requestBody);
  if (sentEffort !== undefined) {
    const errorText = await res
      .clone()
      .text()
      .catch(() => "");
    const model = typeof requestBody.model === "string" ? requestBody.model : "";
    const corrected = learnSuppressEffortFromError(model, sentEffort, errorText);
    if (corrected) {
      logRejection({ status: res.status, stripped: [], corrected: { effort: corrected } });
      setSuppressEffort(requestBody, corrected);
      void res.body?.cancel();
      res = await doFetch();
      if (res.ok || (res.status !== 400 && res.status !== 422)) return res;
    }
  }

  if (requestBody.reasoning) {
    logRejection({ status: res.status, stripped: ["reasoning"] });
    delete requestBody.reasoning;
    void res.body?.cancel();
    res = await doFetch();
    if (res.ok || (res.status !== 400 && res.status !== 422)) return res;
  }

  const errorText = await res
    .clone()
    .text()
    .catch(() => "");
  const named = STRIPPABLE_SHAPED_PARAMS.filter((p) => p in requestBody && errorText.includes(p));
  if (named.length > 0) {
    logRejection({ status: res.status, stripped: named });
    for (const param of named) delete requestBody[param];
    void res.body?.cancel();
    res = await doFetch();
  }
  return res;
}
