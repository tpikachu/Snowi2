import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Key, Cpu } from "lucide-react";
import { selectMeetingSpeechReadiness, useSettingsStore } from "../../stores/settingsStore";
import {
  InferenceModeSelector,
  SettingsPanel,
  SettingsPanelRow,
  SettingsRow,
} from "../ui/SettingsSection";
import type { InferenceModeOption } from "../ui/SettingsSection";
import { Toggle } from "../ui/toggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { IDLE_STOP_CHOICES, normalizeIdleStopMinutes } from "../../utils/meetingIdleStop";
import { formatBytes } from "../../utils/formatBytes";
import { SPEAKER_IDENTIFICATION_ENABLED } from "../../helpers/speakerIdentificationPolicy";
import TranscriptionModelPicker from "../TranscriptionModelPicker";
import { SpeechRouteTest } from "./SpeechRouteTest";
import type { InferenceMode } from "../../types/electron";

export function MeetingSpeakerDetectionRow() {
  const { t } = useTranslation();
  const speakerDiarizationEnabled = useSettingsStore((s) => s.speakerDiarizationEnabled);
  const setSpeakerDiarizationEnabled = useSettingsStore((s) => s.setSpeakerDiarizationEnabled);

  // While identification is off app-wide, this toggle controls nothing — the
  // policy ignores the stored preference. Hiding the row beats leaving a switch
  // that flips and changes no behaviour. The preference itself is untouched, so
  // the row returns with the user's setting intact if the feature comes back.
  if (!SPEAKER_IDENTIFICATION_ENABLED) return null;

  return (
    <SettingsRow
      label={t("settings.meeting.speakerDetection.title")}
      description={t("settings.meeting.speakerDetection.description")}
    >
      <Toggle checked={speakerDiarizationEnabled} onChange={setSpeakerDiarizationEnabled} />
    </SettingsRow>
  );
}

/**
 * The archive pass: the meeting re-transcribed by the tier's slower model
 * after Stop, before the write-up. Only the local engines run it, so the row
 * shows with the local picker.
 */
export function MeetingArchivePassRow() {
  const { t } = useTranslation();
  const meetingArchivePass = useSettingsStore((s) => s.meetingArchivePass);
  const setMeetingArchivePass = useSettingsStore((s) => s.setMeetingArchivePass);

  return (
    <SettingsRow
      label={t("settings.meeting.archivePass.title")}
      description={t("settings.meeting.archivePass.description")}
    >
      <Toggle checked={meetingArchivePass} onChange={setMeetingArchivePass} />
    </SettingsRow>
  );
}

/**
 * The idle stop: a meeting ends by itself after this long without speech
 * (client direction, 2026-09-22). Minutes, "Never" for 0; the store keeps
 * the value to the listed choices.
 */
export function MeetingIdleStopRow() {
  const { t } = useTranslation();
  const minutes = useSettingsStore((s) => s.meetingIdleStopMinutes);
  const setMinutes = useSettingsStore((s) => s.setMeetingIdleStopMinutes);

  return (
    <SettingsRow
      label={t("settings.meeting.idleStop.title")}
      description={t("settings.meeting.idleStop.description")}
    >
      <Select
        value={String(minutes)}
        onValueChange={(value) => setMinutes(normalizeIdleStopMinutes(value))}
      >
        <SelectTrigger
          aria-label={t("settings.meeting.idleStop.title")}
          className="h-7 w-36 rounded-lg px-2.5 text-xs [&>svg]:h-3 [&>svg]:w-3"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {IDLE_STOP_CHOICES.map((choice) => (
            <SelectItem key={choice} value={String(choice)}>
              {choice === 0
                ? t("settings.meeting.idleStop.never")
                : t("settings.meeting.idleStop.minutes", { count: choice })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsRow>
  );
}

/**
 * The recordings kept with meeting notes (noteRecordings.js in main): every
 * engine, cloud or local, since the audio is mirrored before transcription.
 * The description carries what is on disk, so the cost of keeping them is
 * visible where the switch is.
 */
export function MeetingRecordingsRow() {
  const { t } = useTranslation();
  const keep = useSettingsStore((s) => s.meetingKeepRecordings);
  const setKeep = useSettingsStore((s) => s.setMeetingKeepRecordings);
  const [usage, setUsage] = useState<{ count: number; bytes: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI
      ?.noteRecordingsUsage?.()
      .then((result) => {
        if (!cancelled && result) setUsage(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const description = [
    t("settings.meeting.recordings.description"),
    usage && usage.count > 0
      ? t("settings.meeting.recordings.usage", {
          count: usage.count,
          size: formatBytes(usage.bytes, 1),
        })
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <SettingsRow label={t("settings.meeting.recordings.title")} description={description}>
      <Toggle checked={keep} onChange={setKeep} />
    </SettingsRow>
  );
}

const noop = () => {};

export function MeetingTranscriptionPanel() {
  const { t } = useTranslation();

  const {
    meetingTranscriptionMode,
    setMeetingTranscriptionMode,
    setMeetingUseLocalWhisper,
    meetingWhisperModel,
    setMeetingWhisperModel,
    meetingLocalTranscriptionProvider,
    setMeetingLocalTranscriptionProvider,
    meetingParakeetModel,
    setMeetingParakeetModel,
    meetingCloudTranscriptionProvider,
    setMeetingCloudTranscriptionProvider,
    meetingCloudTranscriptionModel,
    setMeetingCloudTranscriptionModel,
    meetingCloudTranscriptionBaseUrl,
    setMeetingCloudTranscriptionBaseUrl,
    setMeetingCloudTranscriptionMode,
  } = useSettingsStore();
  // The engine card in use is "Active" only when it could transcribe:
  // chosen without its key, a model, or (local) the model's download, the
  // badge says which is missing.
  const speechReadiness = useSettingsStore(selectMeetingSpeechReadiness);
  const status = (mode: InferenceMode) =>
    mode === meetingTranscriptionMode && speechReadiness !== "ready"
      ? t(`transcription.${speechReadiness}`)
      : undefined;
  const transcriptionModes: InferenceModeOption[] = [
    {
      id: "providers",
      label: t("settingsPage.transcription.modes.providers"),
      description: t("settingsPage.transcription.modes.providersDesc"),
      icon: <Key className="w-4 h-4" />,
      status: status("providers"),
    },
    {
      id: "local",
      label: t("settingsPage.transcription.modes.local"),
      description: t("settingsPage.transcription.modes.localDesc"),
      icon: <Cpu className="w-4 h-4" />,
      status: status("local"),
    },
    // No Self-Hosted card: hidden on client direction (2026-09) until the
    // streaming self-host path actually ships.
  ];
  const handleTranscriptionModeSelect = (mode: InferenceMode) => {
    if (mode === meetingTranscriptionMode) return;
    setMeetingTranscriptionMode(mode);
    setMeetingUseLocalWhisper(mode === "local");
    setMeetingCloudTranscriptionMode("byok");
  };

  const handleLocalTranscriptionModelSelect = useCallback(
    (modelId: string) => {
      if (meetingLocalTranscriptionProvider === "nvidia") {
        setMeetingParakeetModel(modelId);
      } else {
        setMeetingWhisperModel(modelId);
      }
    },
    [meetingLocalTranscriptionProvider, setMeetingParakeetModel, setMeetingWhisperModel]
  );

  const renderTranscriptionPicker = (mode: "cloud" | "local") => (
    <TranscriptionModelPicker
      streamingOnly
      transcriptionContext="meeting"
      selectedCloudProvider={meetingCloudTranscriptionProvider}
      onCloudProviderSelect={setMeetingCloudTranscriptionProvider}
      selectedCloudModel={meetingCloudTranscriptionModel}
      onCloudModelSelect={setMeetingCloudTranscriptionModel}
      selectedLocalModel={
        meetingLocalTranscriptionProvider === "nvidia" ? meetingParakeetModel : meetingWhisperModel
      }
      onLocalModelSelect={handleLocalTranscriptionModelSelect}
      selectedLocalProvider={meetingLocalTranscriptionProvider}
      onLocalProviderSelect={setMeetingLocalTranscriptionProvider}
      useLocalWhisper={mode === "local"}
      onModeChange={noop}
      mode={mode}
      cloudTranscriptionBaseUrl={meetingCloudTranscriptionBaseUrl}
      setCloudTranscriptionBaseUrl={setMeetingCloudTranscriptionBaseUrl}
      variant="settings"
    />
  );

  return (
    <div className="space-y-3">
      <InferenceModeSelector
        modes={transcriptionModes}
        activeMode={meetingTranscriptionMode}
        onSelect={handleTranscriptionModeSelect}
      />

      {meetingTranscriptionMode === "providers" && renderTranscriptionPicker("cloud")}
      {meetingTranscriptionMode === "local" && renderTranscriptionPicker("local")}
      <SettingsPanel>
        <SettingsPanelRow>
          <SpeechRouteTest />
        </SettingsPanelRow>
        {meetingTranscriptionMode === "local" && (
          <SettingsPanelRow>
            <MeetingArchivePassRow />
          </SettingsPanelRow>
        )}
        <SettingsPanelRow>
          <MeetingRecordingsRow />
        </SettingsPanelRow>
        <SettingsPanelRow>
          <MeetingIdleStopRow />
        </SettingsPanelRow>
        <SettingsPanelRow>
          <MeetingSpeakerDetectionRow />
        </SettingsPanelRow>
      </SettingsPanel>
    </div>
  );
}
