import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import SettingsPage from "./SettingsPage";
import SettingsSurface from "./settings/SettingsSurface";
import { useUpperLayerDismissGuard } from "./ui/useUpperLayerDismissGuard";
import { useLocalStorage } from "../hooks/useLocalStorage";
import {
  LLM_TAB_STORAGE_KEY,
  LLM_TABS,
  resolveDeepLink,
  resolveSectionId,
  SPEECH_TAB_STORAGE_KEY,
  SPEECH_TABS,
  type LlmTab,
  type SettingsSectionType,
  type SpeechTab,
} from "./settings/settingsNav";

export type { SettingsSectionType };

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSection?: string;
  /**
   * Sub-panel to land on, for deep links that name one outright. Takes
   * precedence over the section's legacy sub-tab mapping.
   */
  initialPanel?: string;
}

/**
 * Settings is a full-window workspace, not a centred dialog: there is far too
 * much configuration here to read through a letterbox, and reusing the shell's
 * own context-pane + content-pane language means the surface a user enters from
 * the rail's gear reads as part of the same app.
 *
 * It is still a Radix dialog, which is what buys the focus trap, the restore of
 * focus to the gear on the way out, Escape-to-dismiss and `aria-modal` — the
 * Content is simply laid out edge to edge instead of as a floating box.
 */
export default function SettingsModal({
  open,
  onOpenChange,
  initialSection,
  initialPanel,
}: SettingsModalProps) {
  const { t } = useTranslation();
  // Settings is dense with Selects. Closing one by clicking away must not also
  // close settings — which, on a full-window surface, reads as being thrown
  // back to Home rather than as a dialog dismissing.
  const { guardInteractOutside, setContentRef } =
    useUpperLayerDismissGuard<React.ElementRef<typeof DialogPrimitive.Content>>();

  const [activeSection, setActiveSection] = useState<SettingsSectionType>(() =>
    resolveSectionId(initialSection)
  );
  const [speechTab, setSpeechTab] = useLocalStorage<SpeechTab>(
    SPEECH_TAB_STORAGE_KEY,
    SPEECH_TABS[0]
  );
  const [llmTab, setLlmTab] = useLocalStorage<LlmTab>(LLM_TAB_STORAGE_KEY, LLM_TABS[0]);
  // Seeded to a value the first render cannot match, so the resolve below runs
  // on mount as well as on change. ControlPanel mounts this component already
  // open (`{showSettings && <SettingsModal open …>}`), so tracking the previous
  // props from the current ones would skip every deep link that arrives with
  // the surface — the section still landed, via its lazy initializer, while the
  // panel silently fell back to whichever tab localStorage last held.
  const [prevOpen, setPrevOpen] = useState(false);

  const applyDeepLink = useCallback(
    (section: string, panel?: string) => {
      const resolved = resolveDeepLink(section, panel);
      setActiveSection(resolved.section);
      if (resolved.speechTab) setSpeechTab(resolved.speechTab);
      if (resolved.llmTab) setLlmTab(resolved.llmTab);
    },
    [setSpeechTab, setLlmTab]
  );

  // Re-resolve the deep link every time the surface is opened, not just on
  // mount — and again when a new one arrives while it is already open, since a
  // toast can deep-link from behind the settings surface.
  const deepLink = `${initialSection ?? ""}|${initialPanel ?? ""}`;
  const [prevDeepLink, setPrevDeepLink] = useState<string | null>(null);

  if (open !== prevOpen || deepLink !== prevDeepLink) {
    setPrevOpen(open);
    setPrevDeepLink(deepLink);
    if (open && initialSection) applyDeepLink(initialSection, initialPanel);
  }

  // A stored tab from an older build can name a panel that no longer exists.
  const safeSpeechTab = SPEECH_TABS.includes(speechTab) ? speechTab : SPEECH_TABS[0];
  const safeLlmTab = LLM_TABS.includes(llmTab) ? llmTab : LLM_TABS[0];

  const activePanel =
    activeSection === "speechToText"
      ? safeSpeechTab
      : activeSection === "llms"
        ? safeLlmTab
        : undefined;

  const handlePanelChange = useCallback(
    (section: SettingsSectionType, panel: string) => applyDeepLink(section, panel),
    [applyDeepLink]
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          ref={setContentRef}
          aria-describedby={undefined}
          onInteractOutside={guardInteractOutside}
          onEscapeKeyDown={(event) => {
            // A hotkey capture field owns the keyboard while it is recording.
            if (document.querySelector("[data-capturing]")) event.preventDefault();
          }}
          className="fixed inset-0 z-50 flex overflow-hidden bg-background duration-150 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        >
          <DialogPrimitive.Title className="sr-only">
            {t("settingsModal.title")}
          </DialogPrimitive.Title>
          <SettingsSurface
            activeSection={activeSection}
            onSectionChange={setActiveSection}
            activePanel={activePanel}
            onPanelChange={handlePanelChange}
            onClose={() => onOpenChange(false)}
          >
            <SettingsPage
              activeSection={activeSection}
              speechTab={safeSpeechTab}
              llmTab={safeLlmTab}
              onRequestClose={() => onOpenChange(false)}
            />
          </SettingsSurface>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
