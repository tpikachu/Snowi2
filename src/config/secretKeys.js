// Single source of truth for the uniform BYOK cloud-LLM API-key secrets:
// environment.js, ipcHandlers.js and the settings store all derive their
// per-key plumbing from this list, so adding a provider is one entry.
// CommonJS + pure data so both the main process and the Vite renderer share it.
// `base` yields the IPC channels `get-<base>-key` / `save-<base>-key`.
// preload.js can't require local modules under sandbox, so it mirrors the
// {base, get, save} tuples inline — keep BYOK_KEY_BRIDGES there in sync
// (guarded by test/helpers/secretKeys.test.js).
const BYOK_API_KEYS = [
  {
    base: "openai",
    env: "OPENAI_API_KEY",
    get: "getOpenAIKey",
    save: "saveOpenAIKey",
    storeKey: "openaiApiKey",
  },
  {
    base: "anthropic",
    env: "ANTHROPIC_API_KEY",
    get: "getAnthropicKey",
    save: "saveAnthropicKey",
    storeKey: "anthropicApiKey",
  },
  {
    base: "gemini",
    env: "GEMINI_API_KEY",
    get: "getGeminiKey",
    save: "saveGeminiKey",
    storeKey: "geminiApiKey",
  },
  {
    base: "groq",
    env: "GROQ_API_KEY",
    get: "getGroqKey",
    save: "saveGroqKey",
    storeKey: "groqApiKey",
  },
  { base: "xai", env: "XAI_API_KEY", get: "getXaiKey", save: "saveXaiKey", storeKey: "xaiApiKey" },
  {
    base: "mistral",
    env: "MISTRAL_API_KEY",
    get: "getMistralKey",
    save: "saveMistralKey",
    storeKey: "mistralApiKey",
  },
  {
    base: "openrouter",
    env: "OPENROUTER_API_KEY",
    get: "getOpenrouterKey",
    save: "saveOpenrouterKey",
    storeKey: "openrouterApiKey",
  },
  {
    base: "tinfoil",
    env: "TINFOIL_API_KEY",
    get: "getTinfoilKey",
    save: "saveTinfoilKey",
    storeKey: "tinfoilApiKey",
  },
  {
    base: "corti",
    env: "CORTI_API_KEY",
    get: "getCortiKey",
    save: "saveCortiKey",
    storeKey: "cortiApiKey",
  },
  // Per-scope Custom-endpoint keys. Dictation cleanup's counterpart predates
  // this manifest and keeps its bespoke accessors (CUSTOM_CLEANUP_API_KEY).
  // The Actions scope, formerly `note-formatting-custom`. `base` names the
  // encrypted file under userData/secure-keys and `env` the variable it is
  // loaded into, so this rename orphans a key stored by an earlier build
  // rather than moving it: whoever had a custom Actions endpoint re-enters it
  // once. Deliberate — a scope whose credential is filed under a name the
  // scope no longer has is the kind of thing that is only ever discovered by
  // someone debugging something else.
  {
    base: "actions-custom",
    env: "ACTIONS_CUSTOM_API_KEY",
    get: "getActionsCustomKey",
    save: "saveActionsCustomKey",
    storeKey: "actionsCustomApiKey",
  },
  {
    base: "translation-custom",
    env: "TRANSLATION_CUSTOM_API_KEY",
    get: "getTranslationCustomKey",
    save: "saveTranslationCustomKey",
    storeKey: "translationCustomApiKey",
  },
  {
    base: "dictation-agent-custom",
    env: "DICTATION_AGENT_CUSTOM_API_KEY",
    get: "getDictationAgentCustomKey",
    save: "saveDictationAgentCustomKey",
    storeKey: "dictationAgentCustomApiKey",
  },
  {
    base: "dictation-agent-vision-custom",
    env: "DICTATION_AGENT_VISION_CUSTOM_API_KEY",
    get: "getDictationAgentVisionCustomKey",
    save: "saveDictationAgentVisionCustomKey",
    storeKey: "dictationAgentVisionCustomApiKey",
  },
  {
    base: "chat-agent-custom",
    env: "CHAT_AGENT_CUSTOM_API_KEY",
    get: "getChatAgentCustomKey",
    save: "saveChatAgentCustomKey",
    storeKey: "chatAgentCustomApiKey",
  },
];

module.exports = { BYOK_API_KEYS };
