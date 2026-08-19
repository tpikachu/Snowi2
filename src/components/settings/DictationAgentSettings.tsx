import { useCallback, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Monitor } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useAgentName } from "../../utils/agentName";
import { useDialogs } from "../../hooks/useDialogs";
import { useScreenRecordingPermission } from "../../hooks/useScreenRecordingPermission";
import { Toggle } from "../ui/toggle";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { SettingsPanel, SettingsPanelRow, SettingsRow } from "../ui/SettingsSection";
import SettingsGroup, { SettingsPanelBody } from "./SettingsGroup";
import PermissionCard from "../ui/PermissionCard";
import PromptStudio from "../ui/PromptStudio";
import InferenceConfigEditor from "./InferenceConfigEditor";

export default function DictationAgentSettings() {
  const { t } = useTranslation();
  const useDictationAgent = useSettingsStore((s) => s.useDictationAgent);
  const setUseDictationAgent = useSettingsStore((s) => s.setUseDictationAgent);
  const voiceAgentScreenContext = useSettingsStore((s) => s.voiceAgentScreenContext);
  const setVoiceAgentScreenContext = useSettingsStore((s) => s.setVoiceAgentScreenContext);
  const useDictationAgentVisionModel = useSettingsStore((s) => s.useDictationAgentVisionModel);
  const setUseDictationAgentVisionModel = useSettingsStore(
    (s) => s.setUseDictationAgentVisionModel
  );
  const {
    isMacOS,
    granted: screenGranted,
    supported: screenSupported,
    needsRelaunch: screenNeedsRelaunch,
    request: requestScreenAccess,
  } = useScreenRecordingPermission();
  const screenContextActive = voiceAgentScreenContext;

  const { agentName, setAgentName } = useAgentName();
  const [agentNameInput, setAgentNameInput] = useState(agentName);
  const agentNameInputId = useId();
  const { showAlertDialog } = useDialogs();

  const handleSaveAgentName = useCallback(() => {
    const trimmed = agentNameInput.trim();

    // setAgentName also moves the name in the dictionary.
    setAgentName(trimmed);
    setAgentNameInput(trimmed);

    showAlertDialog({
      title: t("settingsPage.agentConfig.dialogs.updatedTitle"),
      description: t("settingsPage.agentConfig.dialogs.updatedDescription", {
        name: trimmed,
      }),
    });
  }, [agentNameInput, setAgentName, showAlertDialog, t]);

  const handleScreenContextToggle = useCallback(
    (enabled: boolean) => {
      setVoiceAgentScreenContext(enabled);
      // Keeps the dictation overlay out of its own screenshots.
      window.electronAPI?.setScreenContextEnabled?.(enabled);
      if (enabled && isMacOS && !screenGranted) {
        void requestScreenAccess();
      }
    },
    [setVoiceAgentScreenContext, isMacOS, screenGranted, requestScreenAccess]
  );

  const instructionMode = t("settingsPage.agentConfig.instructionMode");
  const examples = [
    t("settingsPage.agentConfig.examples.formalEmail", { agentName }),
    t("settingsPage.agentConfig.examples.professional", { agentName }),
    t("settingsPage.agentConfig.examples.bulletPoints", { agentName }),
  ];

  const voiceAgentSection = (
    <SettingsGroup
      id="dictationAgentIdentity"
      title={t("settingsPage.agentConfig.title")}
      description={t("settingsPage.agentConfig.description")}
    >
      <SettingsPanel>
        <SettingsPanelRow>
          <div className="space-y-2">
            <label htmlFor={agentNameInputId} className="block text-xs font-medium text-foreground">
              {t("settingsPage.agentConfig.agentName")}
            </label>
            <div className="flex gap-2">
              <Input
                id={agentNameInputId}
                placeholder={t("settingsPage.agentConfig.placeholder")}
                value={agentNameInput}
                onChange={(e) => setAgentNameInput(e.target.value)}
                className="h-8 flex-1 font-mono text-sm"
              />
              <Button onClick={handleSaveAgentName} disabled={!agentNameInput.trim()} size="sm">
                {t("settingsPage.agentConfig.save")}
              </Button>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("settingsPage.agentConfig.helper")}
            </p>
          </div>
        </SettingsPanelRow>

        <SettingsPanelRow>
          <p className="mb-1 text-xs font-medium text-foreground">
            {t("settingsPage.agentConfig.howItWorksTitle")}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("settingsPage.agentConfig.howItWorksDescription", { agentName })}
          </p>
        </SettingsPanelRow>

        <SettingsPanelRow>
          <p className="mb-2 text-xs font-medium text-foreground">
            {t("settingsPage.agentConfig.examplesTitle")}
          </p>
          <ul className="space-y-2">
            {examples.map((input) => (
              <li key={input} className="flex items-start gap-3">
                <span className="mt-px shrink-0 rounded-sm bg-primary/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-primary dark:bg-primary/15">
                  {instructionMode}
                </span>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  &ldquo;{input}&rdquo;
                </p>
              </li>
            ))}
          </ul>
        </SettingsPanelRow>
      </SettingsPanel>
    </SettingsGroup>
  );

  return (
    <SettingsPanelBody>
      <SettingsGroup
        id="dictationAgentModel"
        title={t("common.model")}
        description={t("settingsModal.groupTitles.modelDescription")}
      >
        <SettingsPanel>
          <SettingsPanelRow>
            <SettingsRow
              label={t("dictationAgent.enabled")}
              description={t("dictationAgent.enabledDescription", { agentName })}
            >
              <Toggle checked={useDictationAgent} onChange={setUseDictationAgent} />
            </SettingsRow>
          </SettingsPanelRow>
        </SettingsPanel>

        {useDictationAgent && <InferenceConfigEditor scope="dictationAgent" />}
      </SettingsGroup>

      {useDictationAgent && (
        <SettingsGroup
          id="dictationAgentScreenContext"
          title={t("dictationAgent.screenContext.title")}
          description={t("dictationAgent.screenContext.description")}
        >
          <SettingsPanel>
            <SettingsPanelRow>
              <SettingsRow
                label={t("dictationAgent.screenContext.enable")}
                description={
                  screenSupported
                    ? t("dictationAgent.screenContext.enableDescription")
                    : t("dictationAgent.screenContext.unsupported")
                }
              >
                <Toggle
                  checked={screenContextActive}
                  onChange={handleScreenContextToggle}
                  disabled={!screenSupported}
                />
              </SettingsRow>
            </SettingsPanelRow>
            {screenContextActive && (
              <SettingsPanelRow>
                <SettingsRow
                  label={t("dictationAgent.screenContext.visionModel")}
                  description={t("dictationAgent.screenContext.visionModelDescription")}
                >
                  <Toggle
                    checked={useDictationAgentVisionModel}
                    onChange={setUseDictationAgentVisionModel}
                  />
                </SettingsRow>
              </SettingsPanelRow>
            )}
          </SettingsPanel>
          {screenContextActive && isMacOS && !screenGranted && (
            <PermissionCard
              icon={Monitor}
              title={t("dictationAgent.screenContext.permissionTitle")}
              description={t("dictationAgent.screenContext.permissionDescription")}
              granted={false}
              onRequest={requestScreenAccess}
              buttonText={t("onboarding.permissions.grantAccess")}
            />
          )}
          {screenContextActive && isMacOS && screenNeedsRelaunch && (
            <p className="text-[11px] text-warning/80 leading-snug">
              {t("dictationAgent.screenContext.relaunchHint")}
            </p>
          )}
          {screenContextActive && useDictationAgentVisionModel && (
            <InferenceConfigEditor scope="dictationAgentVision" allowedModes={["providers"]} />
          )}
        </SettingsGroup>
      )}

      {voiceAgentSection}

      {useDictationAgent && (
        <SettingsGroup
          id="dictationAgentPrompt"
          title={t("dictationAgent.prompt.title")}
          description={t("dictationAgent.prompt.description")}
        >
          <PromptStudio kind="dictationAgent" />
        </SettingsGroup>
      )}
    </SettingsPanelBody>
  );
}
