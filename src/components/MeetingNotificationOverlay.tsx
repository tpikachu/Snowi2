import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { MeetingNotificationCard } from "./MeetingNotificationCard";

type PromptVariant = "detected" | "starting" | "underway";

interface NotificationData {
  detectionId: string;
  source: string;
  key: string;
  event: { summary?: string | null } | null;
  variant: PromptVariant;
  joinUrl: string | null;
  /** Main starts recording this long after showing the card, unless answered. */
  autoStartMs?: number | null;
}

export default function MeetingNotificationOverlay() {
  const { t } = useTranslation();
  const [data, setData] = useState<NotificationData | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    let shown = false;

    const show = (d: NotificationData) => {
      if (shown) return;
      shown = true;
      setData(d);
      if (d.autoStartMs) setSecondsLeft(Math.max(1, Math.round(d.autoStartMs / 1000)));
      setTimeout(() => {
        setIsVisible(true);
        window.electronAPI?.meetingNotificationReady?.();
      }, 50);
    };

    const cleanup = window.electronAPI?.onMeetingNotificationData?.((incoming: NotificationData) =>
      show(incoming)
    );

    window.electronAPI?.getMeetingNotificationData?.().then((pulled: NotificationData | null) => {
      if (pulled) show(pulled);
    });

    return () => cleanup?.();
  }, []);

  // The display half of the auto-start countdown. Main owns the real timer —
  // and pauses it while the card is hovered — so this mirrors that rule:
  // frozen under the pointer, ticking otherwise, floored at 1 rather than
  // announcing a zero that main's clock may not have reached yet.
  const countdownArmed = secondsLeft !== null;
  useEffect(() => {
    if (!countdownArmed || isHovered) return undefined;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev === null || prev <= 1 ? prev : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdownArmed, isHovered]);

  const respond = useCallback(
    async (action: string) => {
      if (!data) return;
      setIsVisible(false);
      await new Promise((r) => setTimeout(r, 200));
      window.electronAPI?.meetingNotificationRespond?.(data.detectionId, action);
    },
    [data]
  );

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    window.electronAPI?.setNotificationInteractivity?.(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    window.electronAPI?.setNotificationInteractivity?.(false);
  }, []);

  const variant: PromptVariant = data?.variant ?? "detected";
  const title = (variant !== "detected" && data?.event?.summary) || t("meetingNotification.title");

  return (
    <div className="meeting-notification-window w-full h-full bg-transparent p-3">
      <MeetingNotificationCard
        title={title}
        body={t(`meetingNotification.body.${variant}`)}
        subtext={
          secondsLeft !== null ? t("meetingNotification.autoStart", { seconds: secondsLeft }) : null
        }
        startLabel={data?.joinUrl ? t("meetingNotification.join") : t("meetingNotification.start")}
        onStart={() => respond(data?.joinUrl ? "join" : "start")}
        onDismiss={() => respond("dismiss")}
        closeVisible={isHovered}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={[
          "transition-all duration-300 ease-out",
          isVisible
            ? "translate-x-0 opacity-100 scale-100"
            : "translate-x-[120%] opacity-0 scale-95",
        ].join(" ")}
      />
    </div>
  );
}
