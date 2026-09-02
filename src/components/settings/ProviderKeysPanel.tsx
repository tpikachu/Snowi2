import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { ChevronDown } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import SettingsGroup, { SettingsPanelBody } from "./SettingsGroup";
import ApiKeyInput from "../ui/ApiKeyInput";
import { GetApiKeyLink } from "../ui/GetApiKeyLink";
import { ProviderGrid } from "../ui/ProviderGrid";
import InferenceConfigEditor from "./InferenceConfigEditor";
import { getProviderDisplayName } from "../../models/ModelRegistry";
import { CLOUD_PROVIDER_KEY_LINKS } from "../../config/providerKeyLinks";
import { cn } from "../lib/utils";

/**
 * The one thing model setup still needs Settings for: credentials.
 *
 * Models themselves are picked where they are used — the chat composer, the
 * meeting cue card, each action's editor — and entering a key here IS the
 * setup: the scope defaults (scopeModelDefaults.ts) assign each feature a
 * sensible model from the new provider the moment its key lands.
 *
 * Same anatomy as the Speech-to-Text engine page, on purpose — a card per
 * provider, the selected one's key field below — but with tab semantics, not
 * radio: there is no "active" LLM provider anymore, only keys that unlock
 * providers in the pickers. The filled dot means "key saved".
 *
 * The old per-scope editors survive below, folded behind Advanced setup:
 * local model downloads, LAN endpoints, custom APIs and enterprise routing
 * do not fit in a chip and must stay reachable.
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

const providerName = (id: string) =>
  id === "openrouter" ? "OpenRouter" : getProviderDisplayName(id);

export default function ProviderKeysPanel() {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState(PROVIDER_ROWS[0].id);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const selected = PROVIDER_ROWS.find((row) => row.id === selectedId) ?? PROVIDER_ROWS[0];
  const value = useSettingsStore((s) => s[selected.keyField]);
  const setValue = useSettingsStore((s) => s[selected.setter]);
  const configured = useSettingsStore(
    useShallow((s) => PROVIDER_ROWS.map((row) => !!(s[row.keyField] as string | undefined)?.trim()))
  );
  const link = CLOUD_PROVIDER_KEY_LINKS[selected.id];

  return (
    <SettingsPanelBody>
      <SettingsGroup
        id="providerKeys"
        title={t("settingsPage.llms.providers.title")}
        description={t("settingsPage.llms.providers.description")}
      >
        <div className="space-y-4">
          <ProviderGrid
            providers={PROVIDER_ROWS.map((row, index) => {
              const rowLink = CLOUD_PROVIDER_KEY_LINKS[row.id];
              return {
                id: row.id,
                name: providerName(row.id),
                configured: configured[index],
                note: rowLink?.noteKey ? t(rowLink.noteKey) : undefined,
              };
            })}
            selectedId={selected.id}
            onSelect={setSelectedId}
          />

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-foreground">{t("common.apiKey")}</span>
              {link && <GetApiKeyLink url={link.url} />}
            </div>
            <ApiKeyInput apiKey={value ?? ""} setApiKey={setValue} label="" helpText="" />
          </div>

          {/* The escape hatch, one quiet line under the keys — the same
              manner the per-feature disclosure had before it moved here. */}
          <div className="space-y-3 pt-1">
            <button
              type="button"
              onClick={() => setAdvancedOpen((open) => !open)}
              aria-expanded={advancedOpen}
              title={t("settingsPage.llms.advanced.description")}
              className={cn(
                "flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground",
                "transition-colors duration-150 hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              )}
            >
              <ChevronDown
                size={12}
                className={cn("transition-transform duration-200", advancedOpen && "rotate-180")}
              />
              {t("settingsPage.llms.advancedSetup")}
            </button>
            {advancedOpen && (
              <div className="space-y-8">
                <p className="text-xs text-muted-foreground">
                  {t("settingsPage.llms.advanced.description")}
                </p>
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    {t("settingsPage.llms.tabs.chatIntelligence")}
                  </p>
                  <InferenceConfigEditor scope="chatIntelligence" />
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    {t("settingsPage.llms.tabs.actions")}
                  </p>
                  <InferenceConfigEditor scope="actions" />
                </div>
              </div>
            )}
          </div>
        </div>
      </SettingsGroup>
    </SettingsPanelBody>
  );
}
