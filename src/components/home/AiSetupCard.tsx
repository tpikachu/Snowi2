import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { MessageSquareText, Sparkles, X } from "lucide-react";
import { Button } from "../ui/button";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { requestSettings } from "../../stores/settingsNavigationStore";
import { SETTINGS_REMEDIES, type SettingsRemedy } from "../../config/settingsRemedies";
import {
  selectResolvedLLMConfig,
  selectResolvedNoteFormatting,
  useSettingsStore,
} from "../../stores/settingsStore";

const DISMISSED_KEY = "homeAiSetupDismissed";

interface MissingCapability {
  id: "noteFormatting" | "chatIntelligence";
  icon: typeof Sparkles;
  remedy: SettingsRemedy;
}

const CAPABILITIES: MissingCapability[] = [
  { id: "noteFormatting", icon: Sparkles, remedy: "configureNoteFormatting" },
  { id: "chatIntelligence", icon: MessageSquareText, remedy: "configureChatIntelligence" },
];

/**
 * What Snowy still cannot do, and what it would take.
 *
 * Transcription works on its own — a meeting recorded with no model configured
 * is captured and transcribed perfectly. That is exactly the problem: nothing
 * about the app looks broken, so the two features that never run are invisible
 * until someone goes looking for a write-up that was never written or asks a
 * question the assistant cannot answer.
 *
 * Written around what the user gets rather than what the setting is called. A
 * card that says "note formatting is not configured" tells someone who has
 * never heard the phrase nothing at all; "meetings are transcribed but never
 * written up" tells them what they are missing.
 *
 * Dismissible, and gone for good once dismissed. Transcription-only is a
 * legitimate way to use this — the free tier is exactly that — and a
 * permanent card advertising a paid feature to someone who has already
 * declined it is nagging, not helping.
 */
export default function AiSetupCard() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useLocalStorage<boolean>(DISMISSED_KEY, false);

  // useShallow because both selectors build a fresh object per call, and
  // Zustand compares by identity — without it this re-renders forever.
  const { noteFormattingModel, chatModel } = useSettingsStore(
    useShallow((state) => ({
      noteFormattingModel: selectResolvedNoteFormatting(state).model,
      chatModel: selectResolvedLLMConfig(state, "chatIntelligence").model,
    }))
  );

  const missing = useMemo(() => {
    const configured: Record<MissingCapability["id"], boolean> = {
      noteFormatting: Boolean(noteFormattingModel),
      chatIntelligence: Boolean(chatModel),
    };
    return CAPABILITIES.filter((capability) => !configured[capability.id]);
  }, [noteFormattingModel, chatModel]);

  if (dismissed || missing.length === 0) return null;

  return (
    <section className="mt-4 rounded-xl border border-border-subtle bg-surface-2 p-4 shadow-(--shadow-card)">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">{t("home.aiSetup.title")}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t("home.aiSetup.description")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={t("home.aiSetup.dismiss")}
          className="-mr-1 -mt-1 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground/60 outline-none transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X size={13} />
        </button>
      </div>

      <ul className="mt-3 space-y-2">
        {missing.map(({ id, icon: Icon, remedy }) => (
          <li
            key={id}
            className="flex items-start gap-2.5 rounded-lg border border-border-subtle bg-surface-1 px-3 py-2.5"
          >
            <span className="mt-px flex size-6 shrink-0 items-center justify-center rounded-control border border-border-subtle bg-surface-3 text-muted-foreground">
              <Icon size={12} strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground">
                {t(`home.aiSetup.capabilities.${id}.title`)}
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {t(`home.aiSetup.capabilities.${id}.description`)}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => requestSettings(SETTINGS_REMEDIES[remedy])}
            >
              {t("home.aiSetup.configure")}
            </Button>
          </li>
        ))}
      </ul>

      {/* Says the quiet part: this needs either a subscription or a key of
          their own. Finding that out after clicking through to Settings is a
          worse experience than being told here. */}
      <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground/70">
        {t("home.aiSetup.footnote")}
      </p>
    </section>
  );
}
