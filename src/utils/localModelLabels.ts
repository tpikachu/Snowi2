/**
 * What the picker says about a local language model, so a person can choose
 * one for their use case rather than by name.
 *
 * Local models came back on 2026-09-18 (client direction) with the rule that
 * every row answers three questions at the moment of choice: which one gives
 * the best meeting answers, will it run on this machine, and what does it
 * give up against cloud. The first was the gap that produced the "why is ours
 * weak" message — the thin answer had come from a 9B model at 4-bit with
 * nothing on the row saying what it was good for.
 *
 * Pure over registry facts and the capability snapshot, so it is unit-tested
 * without a renderer.
 */

export type LocalModelTier = "best" | "fast" | "light";

/**
 * Below this many billions of parameters the chat agent sends no function
 * tools — a small model calls them wrong more than it calls them right, and
 * a wrong `search_notes` costs a turn (useChatStreaming). The label names
 * the consequence: no notes search.
 */
export const LOCAL_TOOL_MIN_PARAMS_B = 4;

/** Curated tier boundaries by parameter count, for models the registry leaves unlabelled. */
const BEST_MIN_PARAMS_B = 7;
const FAST_MIN_PARAMS_B = 3.5;

/**
 * Parameters in billions, read off the model id — "qwen3.5-9b-q4_k_m" → 9,
 * "gemma-4-e4b-it" → 4 (Gemma's effective-parameter prefix), "lfm2.5-350m" → 0.
 * A MoE id names its total ("-26b-a4b" → 26), which is what memory follows.
 */
export function localModelParamsB(modelId: string): number {
  const match = modelId.match(/-e?(\d+(?:\.\d+)?)[bB](?![a-z0-9])/);
  return match ? parseFloat(match[1]) : 0;
}

export function localModelCanUseTools(modelId: string): boolean {
  return localModelParamsB(modelId) >= LOCAL_TOOL_MIN_PARAMS_B;
}

export function localModelTier(model: { id: string; tier?: LocalModelTier }): LocalModelTier {
  if (model.tier) return model.tier;
  const params = localModelParamsB(model.id);
  if (params >= BEST_MIN_PARAMS_B) return "best";
  if (params >= FAST_MIN_PARAMS_B) return "fast";
  return "light";
}

/**
 * Memory the model needs to run comfortably, in whole gigabytes: the weights
 * as stored, a margin for the KV cache at the context llama-server opens
 * with, and the runtime itself. Rounded up because a number that reads as
 * exact invites arithmetic against the machine's total.
 */
export function localModelMemoryGb(sizeBytes: number): number {
  const weightsGb = Math.max(0, sizeBytes) / 1024 ** 3;
  return Math.max(1, Math.ceil(weightsGb * 1.15 + 1));
}

export interface MachineMemory {
  totalMemGb: number;
  /** Dedicated GPU memory when a discrete card was found. */
  vramGb?: number | null;
}

export type LocalModelFit = "good" | "tight" | "poor" | "unknown";

/** Headroom the OS, the app and the meeting capture keep for themselves. */
const SYSTEM_HEADROOM_GB = 4;

export function localModelFit(sizeBytes: number, machine: MachineMemory | null): LocalModelFit {
  if (!machine || !Number.isFinite(machine.totalMemGb) || machine.totalMemGb <= 0) return "unknown";
  const needs = localModelMemoryGb(sizeBytes);
  if ((machine.vramGb ?? 0) >= needs) return "good";
  if (machine.totalMemGb >= needs + SYSTEM_HEADROOM_GB) return "good";
  if (machine.totalMemGb >= needs + 1) return "tight";
  return "poor";
}

export interface LocalModelLabels {
  tier: LocalModelTier;
  memoryGb: number;
  fit: LocalModelFit;
  /** The chat agent will not search notes on this model (see LOCAL_TOOL_MIN_PARAMS_B). */
  toolsOff: boolean;
}

export function describeLocalModel(
  model: { id: string; sizeBytes: number; tier?: LocalModelTier },
  machine: MachineMemory | null
): LocalModelLabels {
  return {
    tier: localModelTier(model),
    memoryGb: localModelMemoryGb(model.sizeBytes),
    fit: localModelFit(model.sizeBytes, machine),
    toolsOff: !localModelCanUseTools(model.id),
  };
}

/**
 * The Settings list leads with the current generation and tucks the rest —
 * older generations, alternate quantizations — under one "more" row. A
 * model already on disk, or the one in use, is never tucked away.
 */
export function splitFeaturedModels<T extends { id: string; featured?: boolean }>(
  models: readonly T[],
  keep: ReadonlySet<string>
): { featured: T[]; more: T[] } {
  const featured: T[] = [];
  const more: T[] = [];
  for (const model of models) {
    (model.featured || keep.has(model.id) ? featured : more).push(model);
  }
  return { featured, more };
}
