import registry from "../config/languageRegistry.json";

function buildLanguageSet(key: "whisper" | "assemblyai"): Set<string> {
  const set = new Set<string>();
  for (const lang of registry.languages) {
    if (lang[key]) {
      set.add(lang.code);
      const base = lang.code.split("-")[0];
      if (base !== lang.code) set.add(base);
    }
  }
  return set;
}

const WHISPER_LANGUAGES = buildLanguageSet("whisper");
const ASSEMBLYAI_UNIVERSAL3_PRO_LANGUAGES = buildLanguageSet("assemblyai");

const LANGUAGE_INSTRUCTIONS: Record<string, string> = Object.fromEntries(
  registry.languages
    .filter(
      (l): l is typeof l & { instruction: string } =>
        "instruction" in l && typeof l.instruction === "string"
    )
    .map((l) => [l.code, l.instruction])
);

export function getBaseLanguageCode(language: string | null | undefined): string | undefined {
  if (!language || language === "auto") return undefined;
  return language.split("-")[0];
}

/**
 * Which speech-model pair a preferred language calls for.
 *
 * English, any regional variant, gets the English pair (nemotron-speech-
 * streaming-en live, parakeet-unified-en archive): more accurate on English
 * than the multilingual models, and unable to flip languages mid-call on an
 * accent or a foreign name. Anything else, Auto-detect included, gets the
 * multilingual pair. Decided on the base code because the registry stores
 * regions ("en-US", "en-GB"): comparing the raw value to "en" had routed
 * every English speaker to the multilingual pair (found 2026-09-15).
 */
export function speechModelLanguage(
  preferredLanguage: string | null | undefined
): "en" | "multilingual" {
  return getBaseLanguageCode(preferredLanguage) === "en" ? "en" : "multilingual";
}

export function getLanguageInstruction(language: string | undefined): string {
  if (!language) return "";
  return LANGUAGE_INSTRUCTIONS[language] || buildGenericInstruction(language);
}

function buildGenericInstruction(langCode: string): string {
  const template = registry._genericTemplate || "";
  return template.replace("{{code}}", langCode);
}

export function getLanguageLabel(code: string | null | undefined): string {
  if (!code) return "";
  const entry = registry.languages.find((l) => l.code === code);
  return entry?.label ?? code;
}

export { WHISPER_LANGUAGES, ASSEMBLYAI_UNIVERSAL3_PRO_LANGUAGES };
