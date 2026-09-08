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
    // The 5.6 generation dropped "minimal" and gained a true off switch:
    // reasoning_effort accepts none|low|medium|high|xhigh — a live 400 from
    // gpt-5.6-sol names exactly that enum ("'reasoning_effort' does not
    // support 'minimal' with this model"). Matched for the whole 5.6–5.9
    // range on the bet that later 5.x generations keep the post-minimal
    // enum; listed before the generic gpt-5 entry because first match wins.
    match: /^gpt-5\.[6-9]/,
    reasoningEffort: { suppressValue: "none" },
  },
  {
    family: "gpt-5",
    // Anchored: "gpt-oss" and "gpt-4.1" must not match, and gpt-oss ids
    // arrive prefixed ("openai/gpt-oss-120b"), never bare.
    match: /^gpt-5/,
    // The 5.0–5.5 generations reason by default and have no hard off switch;
    // "minimal" is the floor they all accept, and it is what turns an
    // eight-second time-to-first-token into under two. (5.6+ rejects it —
    // see the entry above.)
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
