import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { DICTATION_ENABLED } from "../config/features";
import { Button } from "./ui/button";
import {
  ChevronRight,
  ChevronLeft,
  Flag,
  Settings,
  Shield,
  Command,
  Sparkles,
  Users,
} from "lucide-react";
import TitleBar from "./TitleBar";
import StepProgress from "./ui/StepProgress";
import { AlertDialog, ConfirmDialog } from "./ui/dialog";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useDialogs } from "../hooks/useDialogs";
import { usePermissions } from "../hooks/usePermissions";
import { useClipboard } from "../hooks/useClipboard";
import { useSystemAudioPermission } from "../hooks/useSystemAudioPermission";
import { useSettings } from "../hooks/useSettings";
import { useSettingsStore } from "../stores/settingsStore";
import { setAgentName as saveAgentName } from "../utils/agentName";
import {
  formatHotkeyLabel,
  formatHotkeyListLabel,
  getDefaultHotkey,
  isGlobeLikeHotkey,
  parseHotkeyList,
  serializeHotkeyList,
} from "../utils/hotkeys";
import { useHotkeyRegistration } from "../hooks/useHotkeyRegistration";
import { useHotkeyModeInfo } from "../hooks/useHotkeyModeInfo";
import { getValidationMessage } from "../utils/hotkeyValidator";
import { validateHotkeyForSlot } from "../utils/hotkeyValidation";
import { getPlatform } from "../utils/platform";
import logger from "../utils/logger";
import { ACCESSIBILITY_SKIPPED_KEY, areRequiredPermissionsMet } from "../utils/permissions";
import OnboardingRail from "./onboarding/OnboardingRail";
import UseCaseStep from "./onboarding/UseCaseStep";
import TranscriptionStep, { type TranscriptionSetupStage } from "./onboarding/TranscriptionStep";
import { canProceedSetup } from "./onboarding/transcriptionSetupGating";
import {
  displayNameForModelId,
  providerOfRecommended,
  useOnboardingTranscriptionSetup,
} from "../hooks/useOnboardingTranscriptionSetup";
import PermissionsStep from "./onboarding/PermissionsStep";
import ActivationStep from "./onboarding/ActivationStep";
import VoiceAgentStep from "./onboarding/VoiceAgentStep";
import MeetingSetupStep from "./onboarding/MeetingSetupStep";
import FinishStep from "./onboarding/FinishStep";

// Highest possible step index across flow variants (with the meeting step shown).
const MAX_STEP_INDEX = 6;

// Steps whose primary action is optional — the user can advance without it.
const SKIPPABLE_STEPS = new Set(["usecase", "voiceAgent", "meeting"]);

interface OnboardingFlowProps {
  onComplete: (options?: { openSettings?: boolean }) => void;
}

export default function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const { t } = useTranslation();

  const [currentStep, setCurrentStep, removeCurrentStep] = useLocalStorage(
    "onboardingCurrentStep",
    0,
    {
      serialize: String,
      deserialize: (value) => {
        const parsed = parseInt(value, 10);
        // Clamp to valid range to handle users upgrading from older versions
        // with different step counts. The steps array is dynamic, so a second
        // effect below clamps against the actual flow length.
        if (isNaN(parsed) || parsed < 0) return 0;
        return Math.min(parsed, MAX_STEP_INDEX);
      },
    }
  );
  const [accessibilitySkipped, setAccessibilitySkipped] = useLocalStorage(
    ACCESSIBILITY_SKIPPED_KEY,
    false,
    {
      serialize: String,
      deserialize: (value) => value === "true",
    }
  );

  const {
    useLocalWhisper,
    whisperModel,
    localTranscriptionProvider,
    parakeetModel,
    cloudTranscriptionProvider,
    cloudTranscriptionModel,
    cloudTranscriptionBaseUrl,
    openaiApiKey,
    groqApiKey,
    xaiApiKey,
    mistralApiKey,
    tinfoilApiKey,
    dictationKey,
    meetingKey,
    setMeetingKey,
    voiceAgentKey,
    setVoiceAgentKey,
    activationMode,
    setActivationMode,
    setDictationKey,
    updateTranscriptionSettings,
    preferredLanguage,
    onboardingUseCases,
    setOnboardingUseCases,
    onboardingUseCaseNote,
    setOnboardingUseCaseNote,
  } = useSettings();

  const cortiClientId = useSettingsStore((s) => s.cortiClientId);
  const cortiClientSecret = useSettingsStore((s) => s.cortiClientSecret);
  const setMeetingTranscriptionMode = useSettingsStore((s) => s.setMeetingTranscriptionMode);
  const setMeetingUseLocalWhisper = useSettingsStore((s) => s.setMeetingUseLocalWhisper);
  const setMeetingLocalTranscriptionProvider = useSettingsStore(
    (s) => s.setMeetingLocalTranscriptionProvider
  );
  const setMeetingParakeetModel = useSettingsStore((s) => s.setMeetingParakeetModel);
  const setMeetingWhisperModel = useSettingsStore((s) => s.setMeetingWhisperModel);

  // The setup step's own little flow (local-or-cloud, then pick-for-me-or-not)
  // lives up here so Back/Next — which unmount the step — cannot reset it
  // while a download it started is still running.
  const [setupStage, setSetupStage] = useState<TranscriptionSetupStage>("fork");

  // Owns the hardware recommendation and the model downloads for the whole
  // flow: the step that starts a download is not the component that has to
  // survive it. `installed` updating on completion is what re-opens the Next
  // button after the user walked ahead mid-download.
  const transcriptionSetup = useOnboardingTranscriptionSetup(
    preferredLanguage === "en" ? "en" : "multilingual"
  );

  const applyRecommendation = useCallback(
    ({ provider, modelId }: { provider: "whisper" | "nvidia"; modelId: string }) => {
      // One atomic write rather than the provider-then-model prop callbacks the
      // manual picker uses. Those decide which field to write from the provider
      // captured at render time, so setting both in a single tick would file a
      // Parakeet model name under `whisperModel`. The picker gets away with it
      // because switching engine tabs is a separate click; this is not.
      updateTranscriptionSettings({
        useLocalWhisper: true,
        localTranscriptionProvider: provider,
        ...(provider === "nvidia" ? { parakeetModel: modelId } : { whisperModel: modelId }),
      });

      // Meetings resolve transcription from their own scope, and
      // `localTranscriptionProvider` is the one field in it with no fallback to
      // the general setting (see selectResolvedMeetingTranscription). Writing
      // only the general scope would download the streaming model and then have
      // every meeting reach for Whisper anyway.
      setMeetingTranscriptionMode("local");
      setMeetingUseLocalWhisper(true);
      setMeetingLocalTranscriptionProvider(provider);
      if (provider === "nvidia") setMeetingParakeetModel(modelId);
      else setMeetingWhisperModel(modelId);
    },
    [
      updateTranscriptionSettings,
      setMeetingTranscriptionMode,
      setMeetingUseLocalWhisper,
      setMeetingLocalTranscriptionProvider,
      setMeetingParakeetModel,
      setMeetingWhisperModel,
    ]
  );

  // Persist at choice time, not at download completion: the moment the user is
  // on the "set it up for me" path and the recommendation is known, the
  // selection is written (idempotently). Nothing is left to lose if the step
  // unmounts while the download runs — the old persist-on-complete effect
  // only fired while its component stayed mounted.
  useEffect(() => {
    if (setupStage !== "auto") return;
    const recommendation = transcriptionSetup.recommendation;
    if (!recommendation) return;
    applyRecommendation({
      provider: providerOfRecommended(recommendation.live),
      modelId: recommendation.live.name,
    });
  }, [setupStage, transcriptionSetup.recommendation, applyRecommendation]);

  const handleSetupStageChange = useCallback(
    (stage: TranscriptionSetupStage) => {
      // Choosing the cloud path supersedes a running local download — cancel
      // quietly rather than spending the rest of someone's bandwidth on a
      // model they just walked away from. Going back to the fork alone keeps
      // it: they may only be double-checking the other card.
      if (stage === "cloud" && transcriptionSetup.isDownloading) {
        transcriptionSetup.activeDownload.cancel();
      }
      setSetupStage(stage);
    },
    [transcriptionSetup]
  );

  // Onboarding edits only the primary dictation hotkey; extra bindings are
  // preserved via withExtraDictationHotkeys.
  const [hotkey, setHotkey] = useState(
    () => parseHotkeyList(dictationKey)[0] || getDefaultHotkey()
  );
  const [agentName] = useState("Snowy");
  const [isModelDownloaded, setIsModelDownloaded] = useState(false);
  const { isUsingNativeShortcut, isUsingHyprland, hyprlandConfigStatus, supportsPushToTalk } =
    useHotkeyModeInfo("onboarding");
  const readableHotkey = formatHotkeyLabel(hotkey);
  const readableVoiceAgentKey = formatHotkeyListLabel(voiceAgentKey);
  const { alertDialog, confirmDialog, showAlertDialog, hideAlertDialog, hideConfirmDialog } =
    useDialogs();

  const autoRegisterInFlightRef = useRef(false);
  const hotkeyStepInitializedRef = useRef(false);

  // Replace the primary dictation hotkey while keeping additional bindings intact.
  const withExtraDictationHotkeys = useCallback(
    (primary: string) => serializeHotkeyList([primary, ...parseHotkeyList(dictationKey).slice(1)]),
    [dictationKey]
  );

  const { registerHotkey, isRegistering: isHotkeyRegistering } = useHotkeyRegistration({
    onSuccess: (registeredHotkey) => {
      setHotkey(parseHotkeyList(registeredHotkey)[0] || registeredHotkey);
      setDictationKey(registeredHotkey);
    },
    showSuccessToast: false,
    showErrorToast: false,
  });

  const validateHotkeyForInput = useCallback(
    (hotkey: string) => getValidationMessage(hotkey, getPlatform()),
    []
  );

  const validateVoiceAgentHotkey = useCallback(
    (newHotkey: string) =>
      validateHotkeyForSlot(
        newHotkey,
        { "settingsPage.general.hotkey.title": withExtraDictationHotkeys(hotkey) },
        t
      ),
    [hotkey, withExtraDictationHotkeys, t]
  );

  const permissionsHook = usePermissions(showAlertDialog);
  useClipboard(showAlertDialog); // Initialize clipboard hook for permission checks

  const systemAudio = useSystemAudioPermission();

  useEffect(() => {
    if (permissionsHook.accessibilityPermissionGranted && accessibilitySkipped) {
      setAccessibilitySkipped(false);
    }
  }, [
    permissionsHook.accessibilityPermissionGranted,
    accessibilitySkipped,
    setAccessibilitySkipped,
  ]);

  // The meeting step is temporarily hidden for all users while it gets more
  // design polish — the step's render code and MeetingSetupStep stay in place.
  // Restore by showing it once system audio is granted; the old relevance check
  // keyed off a "meetings" use case that no longer exists, because every use
  // case is a kind of meeting now.
  const showMeetingStep = false;

  const steps = useMemo(() => {
    const list = [
      { id: "usecase", title: t("onboarding.steps.useCase"), icon: Sparkles },
      { id: "setup", title: t("onboarding.steps.setup"), icon: Settings },
      { id: "permissions", title: t("onboarding.steps.permissions"), icon: Shield },
    ];
    // Activation and voice agent both configure dictation hotkeys, which are
    // not registered while dictation is hidden — asking the user to choose one
    // would set a shortcut that never fires.
    if (DICTATION_ENABLED) {
      list.push(
        { id: "activation", title: t("onboarding.steps.activation"), icon: Command },
        { id: "voiceAgent", title: t("onboarding.steps.voiceAgent"), icon: Sparkles }
      );
    }
    if (showMeetingStep) {
      list.push({ id: "meeting", title: t("onboarding.steps.meeting"), icon: Users });
    }
    list.push({ id: "finish", title: t("onboarding.steps.finish"), icon: Flag });
    return list;
  }, [showMeetingStep, t]);

  const currentStepId = steps[currentStep]?.id;

  // The steps array can shrink (e.g. meeting step removed after deselecting
  // meetings on the way back) — keep the index in range.
  useEffect(() => {
    if (currentStep > steps.length - 1) {
      setCurrentStep(steps.length - 1);
    }
  }, [currentStep, steps.length, setCurrentStep]);

  useEffect(() => {
    if (isUsingNativeShortcut && !supportsPushToTalk) {
      setActivationMode("tap");
    }
  }, [isUsingNativeShortcut, supportsPushToTalk, setActivationMode]);

  // Update wizard UI when backend falls back to a different hotkey.
  // Only update local state — don't persist to localStorage so the app
  // retries the preferred key on next launch.
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onHotkeyFallbackUsed?.((data: { fallback: string }) => {
      if (data?.fallback) {
        setHotkey(data.fallback);
      }
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    const modelToCheck = localTranscriptionProvider === "nvidia" ? parakeetModel : whisperModel;
    if (!useLocalWhisper || !modelToCheck) {
      setIsModelDownloaded(false);
      return;
    }

    const checkStatus = async () => {
      try {
        const result =
          localTranscriptionProvider === "nvidia"
            ? await window.electronAPI?.checkParakeetModelStatus(modelToCheck)
            : await window.electronAPI?.checkModelStatus(modelToCheck);
        setIsModelDownloaded(result?.downloaded ?? false);
      } catch (error) {
        logger.error("Failed to check model status", { error }, "onboarding");
        setIsModelDownloaded(false);
      }
    };

    checkStatus();
  }, [useLocalWhisper, whisperModel, parakeetModel, localTranscriptionProvider]);

  // Auto-register default hotkey when entering the activation step
  const activationStepIndex = steps.findIndex((step) => step.id === "activation");

  useEffect(() => {
    if (currentStep !== activationStepIndex) {
      // Reset initialization flag when leaving activation step
      hotkeyStepInitializedRef.current = false;
      return;
    }

    // Prevent double-invocation from React.StrictMode
    if (autoRegisterInFlightRef.current || hotkeyStepInitializedRef.current) {
      return;
    }

    const autoRegisterDefaultHotkey = async () => {
      autoRegisterInFlightRef.current = true;
      hotkeyStepInitializedRef.current = true;

      try {
        // Check if backend already registered a hotkey (e.g., KDE D-Bus fallback)
        const backendKey = localStorage.getItem("dictationKey");
        if (backendKey && backendKey.trim() !== "") {
          setHotkey(parseHotkeyList(backendKey)[0] || backendKey);
          setDictationKey(backendKey);
          return;
        }

        // Get platform-appropriate default hotkey from backend (accounts for
        // X11 modifier-only and GNOME gsettings limitations)
        const defaultHotkey =
          (await window.electronAPI?.getEffectiveDefaultHotkey?.()) || getDefaultHotkey();
        const platform = window.electronAPI?.getPlatform?.() ?? "darwin";

        // Only auto-register if no hotkey is currently set
        const shouldAutoRegister =
          !hotkey || hotkey.trim() === "" || (platform !== "darwin" && isGlobeLikeHotkey(hotkey));

        if (shouldAutoRegister) {
          // Try to register the default hotkey silently
          const success = await registerHotkey(defaultHotkey);
          if (success) {
            setHotkey(defaultHotkey);
          }
        }
      } catch (error) {
        logger.error("Failed to auto-register default hotkey", { error }, "onboarding");
      } finally {
        autoRegisterInFlightRef.current = false;
      }
    };

    void autoRegisterDefaultHotkey();
  }, [currentStep, hotkey, registerHotkey, activationStepIndex, setDictationKey]);

  const ensureHotkeyRegistered = useCallback(async () => {
    if (!window.electronAPI?.updateHotkey) {
      return true;
    }

    try {
      const result = await window.electronAPI.updateHotkey(withExtraDictationHotkeys(hotkey));
      if (result && !result.success) {
        showAlertDialog({
          title: t("onboarding.hotkey.couldNotRegisterTitle"),
          description: result.message || t("onboarding.hotkey.couldNotRegisterDescription"),
        });
        return false;
      }
      return true;
    } catch (error) {
      logger.error("Failed to register onboarding hotkey", { error }, "onboarding");
      showAlertDialog({
        title: t("onboarding.hotkey.couldNotRegisterTitle"),
        description: t("onboarding.hotkey.couldNotRegisterDescription"),
      });
      return false;
    }
  }, [hotkey, withExtraDictationHotkeys, showAlertDialog, t]);

  const saveSettings = useCallback(async () => {
    const hotkeyRegistered = await ensureHotkeyRegistered();
    if (!hotkeyRegistered) {
      return false;
    }
    setDictationKey(withExtraDictationHotkeys(hotkey));
    saveAgentName(agentName);

    localStorage.setItem("onboardingCompleted", "true");

    // Cloud transcription always runs against the user's own key.
    if (!useLocalWhisper) {
      updateTranscriptionSettings({ cloudTranscriptionMode: "byok" });
    }

    // Onboarding configures dictation, but the question it asked — local or
    // cloud, and which provider — was about transcription generally. Meeting
    // recording and audio upload have their own scopes and their own local
    // defaults, so without this a user who chose cloud still had their first
    // meeting sent to a Whisper model they never downloaded. The Corti path
    // already did this; it belongs on every path.
    useSettingsStore.getState().mirrorTranscriptionToDerivedScopes();

    try {
      await window.electronAPI?.saveAllKeysToEnv?.();
    } catch (error) {
      logger.error("Failed to persist API keys", { error }, "onboarding");
    }

    return true;
  }, [
    hotkey,
    withExtraDictationHotkeys,
    agentName,
    setDictationKey,
    ensureHotkeyRegistered,
    useLocalWhisper,
    updateTranscriptionSettings,
  ]);

  const [isFinishing, setIsFinishing] = useState(false);

  const nextStep = useCallback(async () => {
    if (currentStep >= steps.length - 1) {
      return;
    }

    const currentStepId = steps[currentStep]?.id;
    if (
      getPlatform() === "darwin" &&
      currentStepId === "permissions" &&
      !permissionsHook.accessibilityPermissionGranted
    ) {
      setAccessibilitySkipped(true);
    }

    const newStep = currentStep + 1;
    setCurrentStep(newStep);

    // Show dictation panel when entering activation step
    if (newStep === activationStepIndex) {
      if (window.electronAPI?.showDictationPanel) {
        window.electronAPI.showDictationPanel();
      }
    }
  }, [
    currentStep,
    setCurrentStep,
    steps,
    activationStepIndex,
    permissionsHook.accessibilityPermissionGranted,
    setAccessibilitySkipped,
  ]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      const newStep = currentStep - 1;
      setCurrentStep(newStep);
    }
  }, [currentStep, setCurrentStep]);

  const finishOnboarding = useCallback(
    async (openSettings = false) => {
      setIsFinishing(true);
      try {
        const saved = await saveSettings();
        if (!saved) {
          return;
        }

        removeCurrentStep();
        onComplete({ openSettings });
      } finally {
        setIsFinishing(false);
      }
    },
    [saveSettings, removeCurrentStep, onComplete]
  );

  const stepTitle = steps[currentStep]?.title;

  const renderStep = () => {
    switch (currentStepId) {
      case "usecase":
        return (
          <UseCaseStep
            eyebrow={stepTitle}
            useCases={onboardingUseCases}
            onUseCasesChange={setOnboardingUseCases}
            note={onboardingUseCaseNote}
            onNoteChange={setOnboardingUseCaseNote}
          />
        );

      case "setup": // Choose Mode & Configure
        return (
          <TranscriptionStep
            eyebrow={stepTitle}
            setup={transcriptionSetup}
            stage={setupStage}
            onStageChange={handleSetupStageChange}
            useCases={onboardingUseCases}
            cloudTranscriptionProvider={cloudTranscriptionProvider}
            onCloudProviderSelect={(provider) =>
              updateTranscriptionSettings({ cloudTranscriptionProvider: provider })
            }
            cloudTranscriptionModel={cloudTranscriptionModel}
            onCloudModelSelect={(model) =>
              updateTranscriptionSettings({ cloudTranscriptionModel: model })
            }
            selectedLocalModel={
              localTranscriptionProvider === "nvidia" ? parakeetModel : whisperModel
            }
            onLocalModelSelect={(modelId) => {
              if (localTranscriptionProvider === "nvidia") {
                updateTranscriptionSettings({ parakeetModel: modelId });
              } else {
                updateTranscriptionSettings({ whisperModel: modelId });
              }
            }}
            localTranscriptionProvider={localTranscriptionProvider}
            onLocalProviderSelect={(provider) =>
              updateTranscriptionSettings({
                localTranscriptionProvider: provider as "whisper" | "nvidia",
              })
            }
            useLocalWhisper={useLocalWhisper}
            onModeChange={(isLocal) => {
              updateTranscriptionSettings({
                useLocalWhisper: isLocal,
                ...(!isLocal ? { cloudTranscriptionMode: "byok" } : {}),
              });
            }}
            cloudTranscriptionBaseUrl={cloudTranscriptionBaseUrl}
            setCloudTranscriptionBaseUrl={(url) =>
              updateTranscriptionSettings({ cloudTranscriptionBaseUrl: url })
            }
            preferredLanguage={preferredLanguage}
            onPreferredLanguageChange={(value) =>
              updateTranscriptionSettings({ preferredLanguage: value })
            }
          />
        );

      case "permissions":
        // Every use case is now a kind of meeting, so capturing the other side
        // of the call is never optional. This used to key off a "meetings"
        // option that no longer exists as a choice — it was the whole product
        // wearing a checkbox.
        return (
          <PermissionsStep
            eyebrow={stepTitle}
            permissions={permissionsHook}
            systemAudio={systemAudio}
            systemAudioRecommended
          />
        );

      case "activation":
        return (
          <ActivationStep
            eyebrow={stepTitle}
            hotkey={hotkey}
            readableHotkey={readableHotkey}
            onHotkeyChange={async (newHotkey) => {
              const success = await registerHotkey(withExtraDictationHotkeys(newHotkey));
              if (success) {
                setHotkey(newHotkey);
              }
            }}
            isRegistering={isHotkeyRegistering}
            validateHotkey={validateHotkeyForInput}
            activationMode={activationMode}
            onActivationModeChange={setActivationMode}
            isUsingNativeShortcut={isUsingNativeShortcut}
            isUsingHyprland={isUsingHyprland}
            hyprlandConfigStatus={hyprlandConfigStatus}
          />
        );

      case "voiceAgent":
        return (
          <VoiceAgentStep
            eyebrow={stepTitle}
            agentName={agentName}
            hotkey={parseHotkeyList(voiceAgentKey)[0] ?? ""}
            readableHotkey={readableVoiceAgentKey}
            onHotkeyChange={(newHotkey) =>
              setVoiceAgentKey(
                serializeHotkeyList([newHotkey, ...parseHotkeyList(voiceAgentKey).slice(1)])
              )
            }
            onHotkeyClear={() =>
              setVoiceAgentKey(serializeHotkeyList(parseHotkeyList(voiceAgentKey).slice(1)))
            }
            validateHotkey={validateVoiceAgentHotkey}
          />
        );

      case "meeting":
        return (
          <MeetingSetupStep
            eyebrow={stepTitle}
            meetingKey={meetingKey}
            setMeetingKey={setMeetingKey}
            dictationKey={hotkey}
          />
        );

      case "finish":
        return (
          <FinishStep
            eyebrow={stepTitle}
            useCases={onboardingUseCases}
            hotkey={readableHotkey}
            download={
              transcriptionSetup.isDownloading && transcriptionSetup.activeDownload.model
                ? {
                    modelName: displayNameForModelId(transcriptionSetup.activeDownload.model),
                    percentage: Math.round(
                      transcriptionSetup.activeDownload.progress?.percentage ?? 0
                    ),
                  }
                : null
            }
            onFinish={(openSettings) => void finishOnboarding(openSettings)}
            isFinishing={isFinishing}
          />
        );

      default:
        return null;
    }
  };

  const canProceed = () => {
    switch (currentStepId) {
      case "usecase":
        return true; // Selection is optional — Next doubles as skip
      case "setup": {
        const modelToCheck = localTranscriptionProvider === "nvidia" ? parakeetModel : whisperModel;
        return canProceedSetup({
          useLocalWhisper,
          localTranscriptionProvider,
          whisperModel,
          parakeetModel,
          // Two sources: the targeted status check this component runs, and
          // the flow-level installed set that refreshes when a background
          // download completes — the latter is what re-opens Next after the
          // user walked ahead mid-download.
          modelDownloaded: isModelDownloaded || transcriptionSetup.installed.has(modelToCheck),
          downloadActive: transcriptionSetup.isDownloading,
          cloudTranscriptionProvider,
          keys: {
            openaiApiKey,
            groqApiKey,
            xaiApiKey,
            mistralApiKey,
            cortiClientId,
            cortiClientSecret,
            tinfoilApiKey,
          },
        });
      }
      case "permissions":
        return areRequiredPermissionsMet(permissionsHook.micPermissionGranted);
      case "activation":
        return hotkey.trim() !== "";
      case "voiceAgent":
        return true; // Voice agent hotkey is optional
      case "meeting":
        return true; // Meeting hotkey is optional
      case "finish":
        return true; // FinishStep renders its own actions
      default:
        return false;
    }
  };

  const goToStep = useCallback(
    (index: number) => {
      // Only ever backwards — identical to pressing Back repeatedly, so no
      // step's gating can be jumped over.
      if (index >= 0 && index < currentStep) {
        setCurrentStep(index);
      }
    },
    [currentStep, setCurrentStep]
  );

  return (
    <div
      className="h-screen flex flex-col bg-background text-foreground overflow-hidden"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => !open && hideConfirmDialog()}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        onConfirm={confirmDialog.onConfirm}
      />

      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => !open && hideAlertDialog()}
        title={alertDialog.title}
        description={alertDialog.description}
        onOk={() => {}}
      />

      <div className="flex min-h-0 flex-1">
        {/* Progress rail — the flow's spine on anything but a very narrow window */}
        <OnboardingRail
          steps={steps}
          currentStep={currentStep}
          onStepSelect={goToStep}
          className="hidden md:flex"
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Drag strip + window controls (Windows/Linux) */}
          <TitleBar className="shrink-0 z-10" />

          {/* Narrow windows lose the rail, so the steps ride along the top */}
          <div className="shrink-0 border-b border-border-subtle px-4 py-2 md:hidden">
            <StepProgress steps={steps} currentStep={currentStep} />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div
              key={currentStepId}
              className="mx-auto w-full max-w-2xl px-6 py-10 sm:px-10 onboarding-step-enter"
            >
              {renderStep()}
            </div>
          </div>

          <div className="shrink-0 border-t border-border-subtle bg-surface-1/60">
            <div className="mx-auto flex h-16 w-full max-w-2xl items-center justify-between px-6 sm:px-10">
              <Button
                onClick={prevStep}
                variant="outline-flat"
                size="sm"
                disabled={currentStep === 0}
                className="px-3"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                {t("common.back")}
              </Button>

              <div className="flex items-center gap-2">
                {currentStepId !== "finish" && (
                  <>
                    {SKIPPABLE_STEPS.has(currentStepId ?? "") && (
                      <Button
                        onClick={nextStep}
                        variant="ghost"
                        size="sm"
                        className="px-3 text-muted-foreground"
                      >
                        {t("common.skip")}
                      </Button>
                    )}
                    <Button onClick={nextStep} disabled={!canProceed()} size="sm" className="px-4">
                      {t("common.next")}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
