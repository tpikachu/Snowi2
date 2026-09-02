import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settingsStore";
import SettingsGroup, { SettingsPanelBody } from "./SettingsGroup";
import ApiKeyInput from "../ui/ApiKeyInput";
import { GetApiKeyLink } from "../ui/GetApiKeyLink";
import { getProviderDisplayName } from "../../models/ModelRegistry";
import { CLOUD_PROVIDER_KEY_LINKS } from "../../config/providerKeyLinks";

/**
 * The one thing model setup still needs Settings for: credentials.
 *
 * Models themselves are picked where they are used — the chat composer, the
 * meeting cue card, each action's editor — and a key entered here is what
 * makes a provider appear in those pickers. One row per BYOK provider, a
 * green dot for "unlocked", nothing else: the old per-feature model editors
 * survive behind each feature's Advanced setup disclosure.
 */

const PROVIDER_ROWS: Array<{
  id: string;
  keyField:
    | "openaiApiKey"
    | "anthropicApiKey"
    | "geminiApiKey"
    | "groqApiKey"
    | "openrouterApiKey"
    | "tinfoilApiKey"
    | "cortiApiKey";
  setter:
    | "setOpenaiApiKey"
    | "setAnthropicApiKey"
    | "setGeminiApiKey"
    | "setGroqApiKey"
    | "setOpenrouterApiKey"
    | "setTinfoilApiKey"
    | "setCortiApiKey";
}> = [
  { id: "openai", keyField: "openaiApiKey", setter: "setOpenaiApiKey" },
  { id: "anthropic", keyField: "anthropicApiKey", setter: "setAnthropicApiKey" },
  { id: "gemini", keyField: "geminiApiKey", setter: "setGeminiApiKey" },
  { id: "groq", keyField: "groqApiKey", setter: "setGroqApiKey" },
  { id: "openrouter", keyField: "openrouterApiKey", setter: "setOpenrouterApiKey" },
  { id: "tinfoil", keyField: "tinfoilApiKey", setter: "setTinfoilApiKey" },
  { id: "corti", keyField: "cortiApiKey", setter: "setCortiApiKey" },
];

function ProviderKeyRow({ id, keyField, setter }: (typeof PROVIDER_ROWS)[number]) {
  const { t } = useTranslation();
  const value = useSettingsStore((s) => s[keyField]);
  const setValue = useSettingsStore((s) => s[setter]);
  const link = CLOUD_PROVIDER_KEY_LINKS[id];
  const name = id === "openrouter" ? "OpenRouter" : getProviderDisplayName(id);
  const configured = !!value?.trim();

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span
          aria-hidden="true"
          className={`inline-block size-1.5 shrink-0 translate-y-[-1px] rounded-full ${
            configured ? "bg-success" : "bg-border"
          }`}
        />
        <span className="text-sm font-medium text-foreground">{name}</span>
        {link?.noteKey && (
          <span className="text-[11px] text-muted-foreground">{t(link.noteKey)}</span>
        )}
        <span className="ml-auto">{link && <GetApiKeyLink url={link.url} />}</span>
      </div>
      <ApiKeyInput apiKey={value ?? ""} setApiKey={setValue} label="" helpText="" />
    </div>
  );
}

export default function ProviderKeysPanel() {
  const { t } = useTranslation();
  return (
    <SettingsPanelBody>
      <SettingsGroup
        id="providerKeys"
        title={t("settingsPage.llms.providers.title")}
        description={t("settingsPage.llms.providers.description")}
      >
        <div className="space-y-5">
          {PROVIDER_ROWS.map((row) => (
            <ProviderKeyRow key={row.id} {...row} />
          ))}
        </div>
      </SettingsGroup>
    </SettingsPanelBody>
  );
}
