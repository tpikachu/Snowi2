import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../ui/useToast";
import { Button } from "../ui/button";
import { useActionProcessingStore, consumeErrorEvents } from "../../stores/actionProcessingStore";
import { requestSettings } from "../../stores/settingsNavigationStore";

/**
 * Headless. Mount once inside ToastProvider so background-action errors
 * surface even after the user navigates away from the notes view.
 */
export default function BackgroundActionToastListener() {
  const { t } = useTranslation();
  const { toast, dismiss } = useToast();

  const errorCount = useActionProcessingStore((s) => s.errorEvents.length);

  useEffect(() => {
    if (errorCount === 0) return;
    for (const event of consumeErrorEvents()) {
      // An unconfigured model is not a failure the user can retry out of, so
      // the toast carries the trip to the setting that fixes it. Longer-lived
      // than a plain error, because acting on it means reading and clicking.
      const isFixable = event.remedy === "configureNoteFormatting";
      let toastId = "";
      toastId = toast({
        title: t("notes.enhance.title"),
        description: event.message,
        variant: "destructive",
        ...(isFixable
          ? {
              duration: 12000,
              action: (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (toastId) dismiss(toastId);
                    requestSettings({ section: "llms", panel: "noteFormatting" });
                  }}
                  className="h-6 px-2 text-xs text-white/80 hover:bg-white/10 hover:text-white"
                >
                  {t("notes.actions.errors.configure")}
                </Button>
              ),
            }
          : {}),
      });
    }
  }, [errorCount, toast, dismiss, t]);

  return null;
}
