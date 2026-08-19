import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../ui/useToast";
import { configureToastProps } from "../ui/configureToastProps";
import { useActionProcessingStore, consumeErrorEvents } from "../../stores/actionProcessingStore";

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
      let toastId = "";
      toastId = toast({
        title: t("notes.enhance.title"),
        description: event.message,
        variant: "destructive",
        // Any remedy earns the trip to Settings, not just note formatting:
        // the route it resolves to lives in config/settingsRemedies.ts.
        ...configureToastProps(event.remedy ?? null, () => {
          if (toastId) dismiss(toastId);
        }),
      });
    }
  }, [errorCount, toast, dismiss, t]);

  return null;
}
