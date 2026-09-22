import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { Cpu, Key } from "lucide-react";
import {
  useSettingsStore,
  selectResolvedLLMConfig,
  setResolvedLLMConfig,
  setCoreLlmEngine,
  setCoreCloudProvider,
  selectResolvedMeetingTranscription,
} from "../../stores/settingsStore";
import SettingsGroup, { SettingsPanelBody } from "./SettingsGroup";
import { InferenceModeSelector, type InferenceModeOption } from "../ui/SettingsSection";
import ApiKeyInput from "../ui/ApiKeyInput";
import { GetApiKeyLink } from "../ui/GetApiKeyLink";
import { useToast } from "../ui/useToast";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import { ProviderGrid } from "../ui/ProviderGrid";
import ReasoningModelSelector from "../ReasoningModelSelector";
import { getProviderDisplayName } from "../../models/ModelRegistry";
import { CLOUD_PROVIDER_KEY_LINKS } from "../../config/providerKeyLinks";
import { LOCAL_LLM_ENABLED } from "../../config/features";

/**
 * The whole Language Models setup, on one page — one AI model serves chat,
 * the cue card and the meeting write-up (client direction, 2026-09-22), so
 * this page is where it runs, never which model it is.
 *
 * The cloud | local engine cards the Speech-to-Text page uses lead. Cloud is
 * the provider grid and a key field: the "In use" card is the provider the
 * model runs on, a click on a card only selects it (its key), saving a FIRST
 * key on a card is the switch, and a keyed card that is not in use offers
 * the "Use X" button (setCoreCloudProvider — the provider's default model,
 * or the one already picked there). Local shows the model list with
 * downloads under one honest line (private and free, slower and shorter
 * than cloud, no web search), each row labelled for its use case
 * (localModelLabels.ts). With LOCAL_LLM_ENABLED off the page is the cloud
 * half alone, no engine cards. The model itself is changed at point of use
 * — the chat bar, the cue card, a note's Generate Notes — never here.
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

const isProviderRow = (id: string) => PROVIDER_ROWS.some((row) => row.id === id);

/**
 * Cloud: the provider cards and the selected provider's key.
 *
 * The page opens on the provider the model runs on rather than always on
 * the first card. A card clicked is a selection held here — its key box, its
 * badge — never a switch by itself: saving its first key is the switch, and
 * a keyed card offers the explicit button. Before 2026-09-15 the cards only
 * chose which key box was shown and nothing on the page switched providers
 * (client report: "added the key, it still uses the previous provider").
 */
function CloudKeysSection() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const routedProvider = useSettingsStore((s) => {
    const config = selectResolvedLLMConfig(s, "chatIntelligence");
    return config.mode === "providers" ? config.provider : "";
  });
  const configured = useSettingsStore(
    useShallow((s) => PROVIDER_ROWS.map((row) => !!(s[row.keyField] as string | undefined)?.trim()))
  );

  const routedId = isProviderRow(routedProvider) ? routedProvider : null;
  const selectedId = pendingId ?? routedId ?? PROVIDER_ROWS[0].id;
  const selected = PROVIDER_ROWS.find((row) => row.id === selectedId) ?? PROVIDER_ROWS[0];
  const selectedHasKey = configured[PROVIDER_ROWS.indexOf(selected)];
  // Serving, not merely routed: a fresh install's defaulted provider survives
  // the flip to cloud with no key, and "In use" over "No API key yet" would
  // read as a contradiction.
  const isServing = (id: string) =>
    id === routedId && configured[PROVIDER_ROWS.findIndex((row) => row.id === id)] === true;
  const selectedInUse = isServing(selected.id);
  const value = useSettingsStore((s) => s[selected.keyField]);
  const storeSetter = useSettingsStore((s) => s[selected.setter]);
  const link = CLOUD_PROVIDER_KEY_LINKS[selected.id];

  const choose = (id: string) => setPendingId(id);
  const providerLabel = providerName(selected.id);
  const useProvider = () => {
    setCoreCloudProvider(selected.id);
    setPendingId(null);
  };
  const setValue = (key: string) => {
    const hadKey = !!(value ?? "").trim();
    if (hadKey && !key.trim()) {
      // The store moves the model off this provider and says so. A meeting
      // recording through it right now is the one thing that cannot move:
      // its session keeps the token it already has, and the next meeting is
      // what needs a key.
      const speech = selectResolvedMeetingTranscription(useSettingsStore.getState());
      const liveOnThis =
        useMeetingRecordingStore.getState().isRecording &&
        speech.transcriptionMode === "providers" &&
        speech.cloudTranscriptionProvider === selected.id;
      if (liveOnThis) {
        toast({
          title: t("settingsPage.llms.reroute.speechInUseTitle"),
          description: t("settingsPage.llms.reroute.speechInUse", { provider: providerLabel }),
          variant: "default",
        });
      }
    }
    storeSetter(key);
    if (!hadKey && key.trim()) {
      setCoreCloudProvider(selected.id);
      setPendingId(null);
    }
  };

  const hint = selectedInUse
    ? t("settingsPage.llms.engine.cloudInUse", { provider: providerLabel })
    : selectedHasKey
      ? t("settingsPage.llms.engine.cloudChooseHint", { provider: providerLabel })
      : t("settingsPage.llms.engine.cloudSwitchHint", { provider: providerLabel });

  return (
    <div className="space-y-4">
      <ProviderGrid
        providers={PROVIDER_ROWS.map((row, index) => {
          const rowLink = CLOUD_PROVIDER_KEY_LINKS[row.id];
          return {
            id: row.id,
            name: providerName(row.id),
            configured: configured[index],
            roles: isServing(row.id) ? [t("reasoning.providerGrid.inUse")] : [],
            note: rowLink?.noteKey ? t(rowLink.noteKey) : undefined,
          };
        })}
        selectedId={selected.id}
        onSelect={choose}
      />

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-foreground">{t("common.apiKey")}</span>
          {link && <GetApiKeyLink url={link.url} />}
        </div>
        <ApiKeyInput apiKey={value ?? ""} setApiKey={setValue} label="" helpText={hint} />
        {selectedHasKey && !selectedInUse && (
          <button
            type="button"
            onClick={useProvider}
            className="text-xs font-medium text-primary transition-colors hover:text-primary-hover"
          >
            {t("settingsPage.llms.engine.useProvider", { provider: providerLabel })}
          </button>
        )}
      </div>
    </div>
  );
}

/** Local: the model list. A pick is the one model. */
function LocalModelSection() {
  const { t } = useTranslation();
  const current = useSettingsStore(
    useShallow((s) => {
      const config = selectResolvedLLMConfig(s, "chatIntelligence");
      return { provider: config.provider, model: config.model };
    })
  );
  const setLocal = (patch: { provider?: string; model?: string }) =>
    setResolvedLLMConfig("chatIntelligence", { mode: "local", ...patch });

  return (
    <div className="space-y-3">
      {/* Said once, at the moment of choice — the trade the rows' labels
          then itemize per model. */}
      <p className="text-xs leading-snug text-muted-foreground">{t("models.local.note")}</p>
      <ReasoningModelSelector
        reasoningModel={current.model}
        setReasoningModel={(model) => setLocal({ model })}
        localReasoningProvider={current.provider}
        setLocalReasoningProvider={(provider) => setLocal({ provider })}
        cloudReasoningBaseUrl=""
        setCloudReasoningBaseUrl={() => {}}
        mode="local"
      />
    </div>
  );
}

export default function LanguageModelsPanel() {
  const { t } = useTranslation();

  // A legacy LAN/enterprise setup leaves neither card active — an honest
  // picture.
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

  if (!LOCAL_LLM_ENABLED) {
    return (
      <SettingsPanelBody>
        <SettingsGroup
          id="llmEngine"
          title={t("settingsPage.llms.provider.title")}
          description={t("settingsPage.llms.provider.description")}
        >
          <CloudKeysSection />
        </SettingsGroup>
      </SettingsPanelBody>
    );
  }

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
