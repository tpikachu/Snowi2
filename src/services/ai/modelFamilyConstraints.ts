/**
 * Request constraints that belong to a model family, independent of which
 * provider serves it. Storing a family fact inside a provider branch is what
 * broke Tinfoil gpt-oss (#1611: the "no reasoning off switch" rule lived under
 * `providerKey === "groq"`, so every other provider sent the rejected "none").
 * New family facts must land here, never in a provider conditional.
 *
 * Kept free of runtime imports so the table stays unit-testable on its own,
 * like thinkingSuppressionDialects.
 */
export interface ModelFamilyConstraints {
  family: "gpt-oss" | "qwen" | "magistral" | "gpt-5";
  reasoningEffort?: {
    /** Value that best approximates "thinking off" for reasoning_effort. */
    suppressValue: string;
    /**
     * Effort for deterministic transforms (cleanup, selection edits). gpt-oss
     * defaults to medium; low cuts hidden reasoning tokens (latency) and the
     * tendency to answer the transcript instead of cleaning it. At higher
     * efforts gpt-oss can leave the whole reply in the reasoning channel and
     * return whitespace content, failing selection edits.
     */
    cleanupValue?: string;
  };
  /** Family reasons natively and may reject reasoning params outright. */
  omitReasoningParams?: boolean;
}

const FAMILIES: Array<ModelFamilyConstraints & { match: RegExp }> = [
  {
    family: "gpt-5",
    // Every DOTTED gpt-5 generation — 5.2, 5.5, 5.6 and on — has dropped
    // "minimal" and takes a true off switch: reasoning effort accepts
    // none|low|medium|high|xhigh (5.6 adds "max"). Live-probed against the
    // API on 2026-09-11 after a client's Generate Notes died on gpt-5.5 with
    // "Unsupported value: 'minimal' is not supported with the 'gpt-5.5'
    // model" — the earlier entry only moved 5.6+ and left 5.2/5.5 on the
    // rejected floor. Listed before the generic gpt-5 entry: first match wins.
    match: /^gpt-5\.\d/,
    reasoningEffort: { suppressValue: "none" },
  },
  {
    family: "gpt-5",
    // Anchored: "gpt-oss" and "gpt-4.1" must not match, and gpt-oss ids
    // arrive prefixed ("openai/gpt-oss-120b"), never bare.
    match: /^gpt-5/,
    // The undotted first generation — gpt-5, gpt-5-mini, gpt-5-nano — is the
    // mirror image: it REJECTS "none" ("Supported values are: 'minimal',
    // 'low', 'medium', and 'high'", same live probe) and "minimal" is its
    // floor, the one that turns an eight-second time-to-first-token into
    // under two. Should OpenAI move this enum too, the reply's own
    // "supported values" list corrects the request on the spot — see
    // reasoningEffortRecovery.
    reasoningEffort: { suppressValue: "minimal" },
  },
  {
    family: "gpt-oss",
    match: /gpt-oss/,
    // gpt-oss accepts low|medium|high only; it has no off switch. Confirmed
    // live on Groq and Tinfoil (#1611): "none" is a 400 on both.
    reasoningEffort: { suppressValue: "low", cleanupValue: "low" },
  },
  {
    family: "qwen",
    match: /qwen/,
    // qwen3 accepts none|default only (Groq's enum; "none" is also what the
    // generic dialect sends everywhere, so the fact is provider-agnostic).
    reasoningEffort: { suppressValue: "none" },
  },
  {
    family: "magistral",
    match: /magistral/,
    // Legacy magistral models reason natively and may reject reasoning_effort.
    // Verified only against the Mistral API, so the mistral dialect is the
    // sole consumer today — a canary run should confirm other hosts before
    // the generic dialect honors it.
    omitReasoningParams: true,
  },
];

export function getModelFamilyConstraints(
  model: string | null | undefined
): ModelFamilyConstraints | null {
  const id = (model || "").toLowerCase();
  if (!id) return null;
  return FAMILIES.find((f) => f.match.test(id)) ?? null;
}
