import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { MeetingNotificationCard } from "../MeetingNotificationCard";
import { HotkeyInput } from "../ui/HotkeyInput";
import StepShell, { StepSection } from "./StepShell";
import { useHotkeyRegistration } from "../../hooks/useHotkeyRegistration";
import { validateHotkeyForSlot } from "../../utils/hotkeyValidation";
import { parseHotkeyList, serializeHotkeyList } from "../../utils/hotkeys";

interface MeetingSetupStepProps {
  eyebrow?: string;
  meetingKey: string;
  setMeetingKey: (key: string) => void;
  dictationKey: string;
}

export default function MeetingSetupStep({
  eyebrow,
  meetingKey,
  setMeetingKey,
  dictationKey,
}: MeetingSetupStepProps) {
  const { t } = useTranslation();

  const meetingRegisterFn = useCallback(async (hotkey: string) => {
    const result = await window.electronAPI?.registerMeetingHotkey?.(hotkey);
    return result ?? { success: false, message: "Electron API unavailable" };
  }, []);

  const { registerHotkey: registerMeetingHotkey, isRegistering } = useHotkeyRegistration({
    onSuccess: (registeredHotkey) => {
      setMeetingKey(registeredHotkey);
    },
    showSuccessToast: false,
    showErrorToast: true,
    registerFn: meetingRegisterFn,
  });

  const validateMeetingHotkey = useCallback(
    (hotkey: string) =>
      validateHotkeyForSlot(hotkey, { "settingsPage.general.hotkey.title": dictationKey }, t),
    [dictationKey, t]
  );

  return (
    <StepShell
      eyebrow={eyebrow}
      title={t("onboarding.meeting.title")}
      description={t("onboarding.meeting.description")}
    >
      <div className="space-y-2">
        {/* A faithful preview of the real notification, framed like a desktop corner */}
        <div className="relative overflow-hidden rounded-xl border border-border-subtle bg-gradient-to-br from-surface-2 via-surface-1 to-primary/8 px-4 pt-4 pb-9">
          <div className="pointer-events-none select-none">
            <MeetingNotificationCard
              title={t("meetingNotification.title")}
              body={t("meetingNotification.body.detected")}
              startLabel={t("meetingNotification.start")}
              className="ml-auto w-full max-w-[300px] shadow-xl"
            />
          </div>
        </div>
        <p className="text-xs leading-snug text-muted-foreground/80">
          {t("onboarding.meeting.autoDetect")}
        </p>
      </div>

      <StepSection
        label={t("onboarding.meeting.hotkeyLabel")}
        hint={t("onboarding.meeting.hotkeyHint")}
      >
        <HotkeyInput
          value={parseHotkeyList(meetingKey)[0] ?? ""}
          onChange={async (newHotkey) => {
            // Edits the primary meeting hotkey; extra bindings are preserved.
            await registerMeetingHotkey(
              serializeHotkeyList([newHotkey, ...parseHotkeyList(meetingKey).slice(1)])
            );
          }}
          disabled={isRegistering}
          validate={validateMeetingHotkey}
        />
        {meetingKey && (
          <button
            onClick={async () => {
              await window.electronAPI?.registerMeetingHotkey?.("");
              setMeetingKey("");
            }}
            disabled={isRegistering}
            className="mt-2 rounded-sm text-xs text-muted-foreground/70 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {t("hotkeyInput.remove")}
          </button>
        )}
      </StepSection>
    </StepShell>
  );
}
