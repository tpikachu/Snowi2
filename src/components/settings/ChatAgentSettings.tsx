import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settingsStore";
import SettingsGroup, { SettingsPanelBody } from "./SettingsGroup";
import InferenceConfigEditor from "./InferenceConfigEditor";

export default function ChatAgentSettings() {
  const { t } = useTranslation();
  const chatAgentPrompt = useSettingsStore((s) => s.customPrompts.chatAgent);
  const setCustomPrompt = useSettingsStore((s) => s.setCustomPrompt);
  const promptId = useId();

  return (
    <SettingsPanelBody>
      <SettingsGroup
        id="chatAgentModel"
        title={t("common.model")}
        description={t("settingsModal.groupTitles.modelDescription")}
      >
        <InferenceConfigEditor scope="chatIntelligence" />
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
