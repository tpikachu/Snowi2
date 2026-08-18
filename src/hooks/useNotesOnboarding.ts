import { useState, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { useSettingsStore } from "../stores/settingsStore";

interface UseNotesOnboardingReturn {
  isComplete: boolean;
  isLLMConfigured: boolean;
  complete: () => void;
}

export function useNotesOnboarding(): UseNotesOnboardingReturn {
  const { useCleanupModel, effectiveModel } = useSettingsStore(
    useShallow((settings) => ({
      useCleanupModel: settings.useCleanupModel,
      effectiveModel: settings.cleanupModel,
    }))
  );

  const [isComplete, setIsComplete] = useState(
    () => localStorage.getItem("notesOnboardingComplete") === "true"
  );

  const isLLMConfigured = useCleanupModel && !!effectiveModel;

  const complete = useCallback(() => {
    localStorage.setItem("notesOnboardingComplete", "true");
    setIsComplete(true);
  }, []);

  return { isComplete, isLLMConfigured, complete };
}
