import {
  selectLLMConfigReady,
  selectResolvedLLMConfig,
  type SettingsState,
} from "../stores/settingsStore";

export type ResolvedLLMConfigLike = ReturnType<typeof selectResolvedLLMConfig>;

export interface FastLaneResolution {
  config: ResolvedLLMConfigLike;
  /**
   * "override"  — the user picked a fast model themselves (chatFast scope);
   * "derived"   — the small sibling of the chat provider was substituted;
   * "chat"      — nothing faster was available, the chat model serves as-is.
   */
  source: "override" | "derived" | "chat";
}

/**
 * The provider's designated latency model — the one its own docs put forward
 * when time-to-first-token is the point. Only providers with an unambiguous
 * small sibling are listed; everything else (custom endpoints, LAN, local,
 * enterprise, privacy enclaves) keeps the model the user configured, because
 * substituting a model on someone's own infrastructure is a guess, not an
 * optimization.
 */
export const FAST_LANE_MODELS: Record<string, string> = {
  openai: "gpt-5-nano",
  anthropic: "claude-haiku-4-5",
  gemini: "gemini-2.5-flash-lite",
  groq: "llama-3.1-8b-instant",
};

/**
 * The model the meeting assistant's fast lane runs on.
 *
 * Three rungs, first match wins:
 * 1. An explicit override (Settings → Language Models → Chat → Fast answers),
 *    taken only when it is actually callable — a half-configured override
 *    falls through rather than breaking fast answers.
 * 2. The chat provider's small sibling, when the chat scope is BYOK and the
 *    provider has one. Same provider, same key, a fraction of the
 *    time-to-first-token — this is what makes Fast mean fast.
 * 3. The chat model itself (today's behavior), with thinking disabled by the
 *    caller.
 *
 * Returns null when the chat scope itself is not ready — the fast lane never
 * outlives the feature it belongs to.
 */
export function resolveFastLaneLLMConfig(settings: SettingsState): FastLaneResolution | null {
  if (settings.useChatFastModel) {
    const override = selectResolvedLLMConfig(settings, "chatFast");
    if (selectLLMConfigReady(settings, override)) {
      return { config: override, source: "override" };
    }
  }

  const chat = selectResolvedLLMConfig(settings, "chatIntelligence");
  if (!selectLLMConfigReady(settings, chat)) return null;

  if ((chat.mode || "local") === "providers") {
    const sibling = FAST_LANE_MODELS[chat.provider];
    // "custom" aliases the OpenAI client but points at someone else's server;
    // the map has no entry for it, so it lands on the chat rung below.
    if (sibling && sibling !== chat.model) {
      return { config: { ...chat, model: sibling }, source: "derived" };
    }
  }

  return { config: chat, source: "chat" };
}

/** The two speeds of a chat answer, chosen per send by the lane chip. */
export type ChatLane = "fast" | "thinking";

export interface ChatLaneResolution {
  config: ResolvedLLMConfigLike;
  /** The lane actually served — "thinking" when fast could not resolve. */
  lane: ChatLane;
  disableThinking: boolean | undefined;
}

/**
 * The model and turn shape for one chat send.
 *
 * Both lanes are the full agent — same tools, same prefetched grounding —
 * because a lane that cannot call list_meetings answers "how many meetings
 * did we have" with a confident guess, and a wrong answer is slower than any
 * model. What Fast changes is the engine: the fast-lane model with thinking
 * forced off, so a plain question streams immediately and a tool round-trip
 * costs a quick call instead of a reasoning pass. Thinking keeps the chat
 * model and whatever thinking setting the user chose.
 *
 * A fast request that cannot resolve (the chat scope itself is unready)
 * degrades to the thinking lane rather than failing differently: the thinking
 * path already explains an unconfigured model in words the user can act on,
 * and the returned `lane` says what was actually served.
 */
export function resolveChatLaneConfig(settings: SettingsState, lane: ChatLane): ChatLaneResolution {
  if (lane === "fast") {
    const fast = resolveFastLaneLLMConfig(settings);
    if (fast) {
      return { config: fast.config, lane: "fast", disableThinking: true };
    }
  }
  const chat = selectResolvedLLMConfig(settings, "chatIntelligence");
  return { config: chat, lane: "thinking", disableThinking: chat.disableThinking };
}
