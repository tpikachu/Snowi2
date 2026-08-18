import { useCallback } from "react";

// Restart the onboarding flow from the beginning (used when a settings panel
// wants the user to redo initial setup).
export function useStartOnboarding() {
  return useCallback(() => {
    localStorage.setItem("onboardingCurrentStep", "0");
    localStorage.removeItem("onboardingCompleted");
    window.location.reload();
  }, []);
}
