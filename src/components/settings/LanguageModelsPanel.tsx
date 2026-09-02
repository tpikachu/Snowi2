import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { Cpu, Key } from "lucide-react";
import {
  useSettingsStore,
  selectResolvedLLMConfig,
  setResolvedLLMConfig,
  setCoreLlmEngine,
} from "../../stores/settingsStore";
import SettingsGroup, { SettingsPanelBody } from "./SettingsGroup";
import { InferenceModeSelector, type InferenceModeOption } from "../ui/SettingsSection";
import ApiKeyInput from "../ui/ApiKeyInput";
import { GetApiKeyLink } from "../ui/GetApiKeyLink";
import { ProviderGrid } from "../ui/ProviderGrid";
import ReasoningModelSelector from "../ReasoningModelSelector";
import { getProviderDisplayName } from "../../models/ModelRegistry";
import { CLOUD_PROVIDER_KEY_LINKS } from "../../config/providerKeyLinks";

/**
 * The whole Language Models setup, on one page — because chat and actions
 * share one LLM, and configuring it twice bought nothing anyone could
 * perceive (client direction, 2026-09).
 *
 * The user makes exactly one choice here: cloud or local, the same engine
 * cards the Speech-to-Text page uses. Cloud shows the provider grid and a key
 * field — entering a key IS the setup, the scope defaults
 * (scopeModelDefaults.ts) pick each feature's model. Local shows the model
 * list with downloads, and a selection routes chat and actions to it
 * together. Everything else is handled by the app: models are changed at
 * point of use (chat bar, cue card, action editor), never here. The former
 * Advanced disclosure (per-scope editors, fast-lane override, chat prompt)
 * was removed on client direction, 2026-09 — the fast lane auto-derives
 * (assistFastLane.ts) and actions are managed from the notes sidebar.
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

/** Cloud: the provider cards and the selected provider's key. */
function CloudKeysSection() {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState(PROVIDER_ROWS[0].id);

  const selected = PROVIDER_ROWS.find((row) => row.id === selectedId) ?? PROVIDER_ROWS[0];
  const value = useSettingsStore((s) => s[selected.keyField]);
  const setValue = useSettingsStore((s) => s[selected.setter]);
  const configured = useSettingsStore(
    useShallow((s) => PROVIDER_ROWS.map((row) => !!(s[row.keyField] as string | undefined)?.trim()))
  );
  const link = CLOUD_PROVIDER_KEY_LINKS[selected.id];

  return (
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
    </div>
  );
}

/**
 * Local: the shared model list. A pick routes chat AND actions at it — one
 * LLM, chosen once. Reads from the chat scope (the canonical copy) and
 * writes both.
 */
function LocalModelSection() {
  const chat = useSettingsStore(
    useShallow((s) => {
      const config = selectResolvedLLMConfig(s, "chatIntelligence");
      return { provider: config.provider, model: config.model };
    })
  );
  const setShared = (patch: { provider?: string; model?: string }) => {
    setResolvedLLMConfig("chatIntelligence", { mode: "local", ...patch });
    setResolvedLLMConfig("actions", { mode: "local", ...patch });
  };

  return (
    <ReasoningModelSelector
      reasoningModel={chat.model}
      setReasoningModel={(model) => setShared({ model })}
      localReasoningProvider={chat.provider}
      setLocalReasoningProvider={(provider) => setShared({ provider })}
      cloudReasoningBaseUrl=""
      setCloudReasoningBaseUrl={() => {}}
      mode="local"
    />
  );
}

export default function LanguageModelsPanel() {
  const { t } = useTranslation();

  // The chat scope is the canonical copy of the shared engine choice; actions
  // follow it through setCoreLlmEngine. A legacy LAN/enterprise setup leaves
  // neither card active — an honest picture.
  const engineMode = useSettingsStore(
    (s) => selectResolvedLLMConfig(s, "chatIntelligence").mode || "local"
  );

  const modes: InferenceModeOption[] = [
    {
      id: "providers",
      label: t("settingsPage.aiModels.modes.providers"),
      description: t("settingsPage.aiModels.modes.providersDesc"),
      icon: <Key className="w-4 h-4" />,
    },
    {
      id: "local",
      label: t("settingsPage.aiModels.modes.local"),
      description: t("settingsPage.aiModels.modes.localDesc"),
      icon: <Cpu className="w-4 h-4" />,
    },
  ];

  return (
    <SettingsPanelBody>
      <SettingsGroup
        id="llmEngine"
        title={t("settingsPage.llms.engine.title")}
        description={t("settingsPage.llms.engine.description")}
      >
        <div className="space-y-4">
          <InferenceModeSelector
            modes={modes}
            activeMode={engineMode}
            onSelect={(mode) => setCoreLlmEngine(mode === "local" ? "local" : "cloud")}
          />

          {engineMode === "local" ? <LocalModelSection /> : <CloudKeysSection />}
        </div>
      </SettingsGroup>
    </SettingsPanelBody>
  );
}
