import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Key, Cpu, Network, Building2 } from "lucide-react";
import {
  useSettingsStore,
  selectLLMConfigReady,
  selectResolvedLLMConfig,
  setResolvedLLMConfig,
} from "../../stores/settingsStore";
import { InferenceModeSelector } from "../ui/SettingsSection";
import type { InferenceModeOption } from "../ui/SettingsSection";
import ReasoningModelSelector from "../ReasoningModelSelector";
import EnterpriseSection from "../EnterpriseSection";
import OpenAICompatiblePanel from "../OpenAICompatiblePanel";
import { Toggle } from "../ui/toggle";
import type { InferenceMode } from "../../types/electron";
import type { InferenceScope } from "../../config/inferenceScopes";
import {
  isProviderValidForMode,
  getCloudModel,
  getLocalModel,
  getProviderDisplayName,
} from "../../models/ModelRegistry";

const MODE_LABEL_PREFIX: Record<InferenceScope, string> = {
  dictationCleanup: "settingsPage.aiModels.modes",
  actions: "settingsPage.aiModels.modes",
  dictationAgent: "dictationAgent.modes",
  dictationAgentVision: "dictationAgent.modes",
  chatIntelligence: "agentMode.settings.modes",
  dictationTranslation: "settingsPage.aiModels.modes",
};

interface InferenceConfigEditorProps {
  scope: InferenceScope;
  onModeChange?: (mode: InferenceMode) => void;
  /** Restrict the selectable modes (e.g. vision override offers cloud/BYOK only). */
  allowedModes?: InferenceMode[];
}

export default function InferenceConfigEditor({
  scope,
  onModeChange,
  allowedModes,
}: InferenceConfigEditorProps) {
  const { t } = useTranslation();
  const config = useSettingsStore(
    useShallow((settings) => selectResolvedLLMConfig(settings, scope))
  );
  // Whether the scope as saved could serve a request right now. A tab can
  // *look* fully chosen — mode active, a provider tile selected, a model
  // highlighted, all of it store defaults — while the credential that makes
  // any of it callable was never entered. The banner below says so plainly.
  const ready = useSettingsStore((settings) =>
    selectLLMConfigReady(settings, selectResolvedLLMConfig(settings, scope))
  );

  const readinessHint = (): { key: string; values?: Record<string, string> } => {
    const mode = config.mode || "local";
    if (mode === "local") return { key: "reasoning.readiness.needsLocalModel" };
    if (mode === "self-hosted") {
      return config.remoteUrl?.trim()
        ? { key: "reasoning.readiness.needsModel" }
        : { key: "reasoning.readiness.needsEndpoint" };
    }
    if (mode === "enterprise") return { key: "reasoning.readiness.needsEnterprise" };
    if (!config.model || !config.provider) return { key: "reasoning.readiness.needsModel" };
    if (config.provider === "custom") return { key: "reasoning.readiness.needsCustom" };
    return {
      key: "reasoning.readiness.needsKey",
      values: { provider: getProviderDisplayName(config.provider) || config.provider },
    };
  };

  const prefix = MODE_LABEL_PREFIX[scope];
  const modes = (
    [
      {
        id: "providers",
        label: t(`${prefix}.providers`),
        description: t(`${prefix}.providersDesc`),
        icon: <Key className="w-4 h-4" />,
      },
      {
        id: "local",
        label: t(`${prefix}.local`),
        description: t(`${prefix}.localDesc`),
        icon: <Cpu className="w-4 h-4" />,
      },
      {
        id: "self-hosted",
        label: t(`${prefix}.selfHosted`),
        description: t(`${prefix}.selfHostedDesc`),
        icon: <Network className="w-4 h-4" />,
      },
      {
        id: "enterprise",
        label: t(`${prefix}.enterprise`),
        description: t(`${prefix}.enterpriseDesc`),
        icon: <Building2 className="w-4 h-4" />,
      },
    ] as InferenceModeOption[]
  ).filter((mode) => !allowedModes || allowedModes.includes(mode.id));

  const setField = useCallback(
    <K extends keyof Omit<typeof config, "scope">>(field: K) =>
      (value: NonNullable<(typeof config)[K]>) => {
        setResolvedLLMConfig(scope, { [field]: value });
      },
    [scope]
  );

  const handleModeSelect = useCallback(
    (mode: InferenceMode) => {
      if (mode === config.mode) return;

      const patch: Parameters<typeof setResolvedLLMConfig>[1] = {
        mode,
        cloudMode: "byok",
      };
      if (!isProviderValidForMode(config.provider, mode)) {
        patch.provider = "";
        patch.model = "";
      }
      setResolvedLLMConfig(scope, patch);

      if (mode === "self-hosted" || mode === "enterprise") {
        window.electronAPI?.llamaServerStop?.();
      }

      onModeChange?.(mode);
    },
    [scope, config.provider, config.mode, onModeChange]
  );

  const setMode = setField("mode");
  const setProvider = setField("provider");
  const setModel = setField("model");

  const switchCloudProvider = useCallback(
    (provider: string, fallbackModel: string) =>
      useSettingsStore.getState().switchReasoningProvider(scope, provider, fallbackModel),
    [scope]
  );

  const renderModelSelector = (mode?: "cloud" | "local") => (
    <ReasoningModelSelector
      reasoningModel={config.model}
      setReasoningModel={setModel}
      localReasoningProvider={config.provider}
      setLocalReasoningProvider={setProvider}
      onCloudProviderSelect={switchCloudProvider}
      cloudReasoningBaseUrl={config.cloudBaseUrl ?? ""}
      setCloudReasoningBaseUrl={setField("cloudBaseUrl")}
      customReasoningApiKey={config.customApiKey ?? ""}
      setCustomReasoningApiKey={setField("customApiKey")}
      setReasoningMode={setMode}
      mode={mode}
    />
  );

  const showThinkingToggle =
    config.mode === "self-hosted" ||
    (config.mode === "providers" &&
      (config.provider === "custom" ||
        config.provider === "openrouter" ||
        !!getCloudModel(config.model)?.supportsThinking)) ||
    (config.mode === "local" && !!getLocalModel(config.model)?.supportsThinking);

  return (
    <div className="space-y-3">
      <InferenceModeSelector modes={modes} activeMode={config.mode} onSelect={handleModeSelect} />

      {!ready && (
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-subtle px-3 py-2">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-foreground">
            {(() => {
              const hint = readinessHint();
              return t(hint.key, hint.values);
            })()}
          </p>
        </div>
      )}

      {config.mode === "providers" && renderModelSelector("cloud")}
      {config.mode === "local" && renderModelSelector("local")}

      {config.mode === "self-hosted" && (
        <OpenAICompatiblePanel
          baseUrl={config.remoteUrl ?? ""}
          setBaseUrl={setField("remoteUrl")}
          apiKey={config.customApiKey ?? ""}
          setApiKey={setField("customApiKey")}
          model={config.model}
          setModel={setModel}
          baseUrlPlaceholder="http://192.168.1.126:11434/v1"
          helpExamples={
            <p className="text-xs text-muted-foreground">
              {t("reasoning.selfHosted.endpointHelp")}
            </p>
          }
        />
      )}

      {showThinkingToggle && (
        <div className="flex items-start justify-between gap-3 pt-1">
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-foreground">
              {t("reasoning.disableThinking.label")}
            </h4>
            <p className="text-xs text-muted-foreground">{t("reasoning.disableThinking.help")}</p>
          </div>
          <Toggle checked={config.disableThinking} onChange={setField("disableThinking")} />
        </div>
      )}

      {config.mode === "enterprise" && (
        <EnterpriseSection
          currentProvider={config.provider}
          reasoningModel={config.model}
          setReasoningModel={setModel}
          setLocalReasoningProvider={setProvider}
        />
      )}
    </div>
  );
}
