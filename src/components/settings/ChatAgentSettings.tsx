import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { useSettingsStore } from "../../stores/settingsStore";
import { resolveFastLaneLLMConfig } from "../../utils/assistFastLane";
import { getReasoningModelLabel } from "../../models/ModelRegistry";
import SettingsGroup, { SettingsPanelBody } from "./SettingsGroup";
import { SettingsPanel, SettingsPanelRow, SettingsRow } from "../ui/SettingsSection";
import { Toggle } from "../ui/toggle";
import InferenceConfigEditor from "./InferenceConfigEditor";
import ScopeModelSummary from "./ScopeModelSummary";

export default function ChatAgentSettings() {
  const { t } = useTranslation();
  const chatAgentPrompt = useSettingsStore((s) => s.customPrompts.chatAgent);
  const setCustomPrompt = useSettingsStore((s) => s.setCustomPrompt);
  const useChatFastModel = useSettingsStore((s) => s.useChatFastModel);
  const setUseChatFastModel = useSettingsStore((s) => s.setUseChatFastModel);
  // What the automatic fast lane would run on right now, so the toggle's
  // description can say it instead of asking the user to trust a mechanism.
  const autoFastLane = useSettingsStore(
    useShallow((s) => {
      const resolved = resolveFastLaneLLMConfig(s);
      return resolved ? { model: resolved.config.model, source: resolved.source } : null;
    })
  );
  const promptId = useId();

  const overrideDescription = useChatFastModel
    ? t("agentMode.fastLane.overrideOn")
    : autoFastLane && autoFastLane.source === "derived"
      ? t("agentMode.fastLane.overrideAuto", {
          model: getReasoningModelLabel(autoFastLane.model) || autoFastLane.model,
        })
      : t("agentMode.fastLane.overrideSame");

  return (
    <SettingsPanelBody>
      <SettingsGroup
        id="chatAgentModel"
        title={t("common.model")}
        description={t("settingsModal.groupTitles.modelDescription")}
      >
        {/* The model is picked where it's used (chat composer, cue card);
            this row shows the state via the same chip, with the full editor
            behind Advanced for LAN/custom/enterprise setups. */}
        <ScopeModelSummary scope="chatIntelligence">
          <InferenceConfigEditor scope="chatIntelligence" />
        </ScopeModelSummary>
      </SettingsGroup>

      <SettingsGroup
        id="chatFastLane"
        title={t("agentMode.fastLane.title")}
        description={t("agentMode.fastLane.description")}
      >
        <SettingsPanel>
          <SettingsPanelRow>
            <SettingsRow label={t("agentMode.fastLane.override")} description={overrideDescription}>
              <Toggle checked={useChatFastModel} onChange={setUseChatFastModel} />
            </SettingsRow>
          </SettingsPanelRow>
        </SettingsPanel>
        {useChatFastModel && (
          <InferenceConfigEditor scope="chatFast" allowedModes={["providers"]} />
        )}
      </SettingsGroup>

      <SettingsGroup
        id="chatAgentPrompt"
        title={t("agentMode.settings.systemPrompt")}
        description={t("agentMode.settings.systemPromptDescription")}
      >
        <label htmlFor={promptId} className="sr-only">
          {t("agentMode.settings.systemPrompt")}
        </label>
        <textarea
          id={promptId}
          value={chatAgentPrompt}
          onChange={(e) => setCustomPrompt("chatAgent", e.target.value)}
          placeholder={t("agentMode.settings.systemPromptPlaceholder")}
          rows={5}
          className="w-full resize-y rounded-md px-3 py-2 text-xs leading-relaxed"
        />
      </SettingsGroup>
    </SettingsPanelBody>
  );
}
