export interface ProviderCredentialField {
  key:
    | "openaiApiKey"
    | "groqApiKey"
    | "xaiApiKey"
    | "mistralApiKey"
    | "cortiClientId"
    | "cortiClientSecret"
    | "cortiEnvironment"
    | "cortiTenant"
    | "tinfoilApiKey";
  input: "secret" | "text" | "select";
  labelKey?: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
}

/**
 * What each cloud transcription provider needs from the user before it works,
 * and where they go to get it. Shared by the settings model picker and the
 * onboarding cloud setup, so a provider's credential story is defined once.
 */
export const PROVIDER_CREDENTIALS: Record<
  string,
  { consoleUrl: string; fields: ProviderCredentialField[] }
> = {
  openai: {
    consoleUrl: "https://platform.openai.com/api-keys",
    fields: [{ key: "openaiApiKey", input: "secret" }],
  },
  groq: {
    consoleUrl: "https://console.groq.com/keys",
    fields: [{ key: "groqApiKey", input: "secret" }],
  },
  xai: {
    consoleUrl: "https://console.x.ai",
    fields: [{ key: "xaiApiKey", input: "secret" }],
  },
  mistral: {
    consoleUrl: "https://console.mistral.ai/api-keys",
    fields: [{ key: "mistralApiKey", input: "secret" }],
  },
  corti: {
    consoleUrl: "https://www.corti.ai/",
    fields: [
      { key: "cortiClientId", input: "secret", labelKey: "transcription.corti.clientId" },
      { key: "cortiClientSecret", input: "secret", labelKey: "transcription.corti.clientSecret" },
      {
        key: "cortiEnvironment",
        input: "select",
        labelKey: "transcription.corti.environment",
        options: [
          { value: "us", label: "US" },
          { value: "eu", label: "EU" },
        ],
      },
      {
        key: "cortiTenant",
        input: "text",
        labelKey: "transcription.corti.tenant",
        placeholder: "base",
      },
    ],
  },
  tinfoil: {
    consoleUrl: "https://tinfoil.sh/inference",
    fields: [{ key: "tinfoilApiKey", input: "secret" }],
  },
};
