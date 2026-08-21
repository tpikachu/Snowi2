import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Mic,
  MessageSquareText,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../lib/utils";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { requestSettings } from "../../stores/settingsNavigationStore";
import { SETTINGS_REMEDIES, type SettingsRemedy } from "../../config/settingsRemedies";
import {
  selectResolvedLLMConfig,
  selectResolvedNoteFormatting,
  useSettingsStore,
} from "../../stores/settingsStore";

const COLLAPSED_KEY = "homeCapabilitiesCollapsed";

type CapabilityId = "transcription" | "noteFormatting" | "chatIntelligence";

interface Capability {
  id: CapabilityId;
  icon: LucideIcon;
  /** Absent for capabilities that need no setup. */
  remedy?: SettingsRemedy;
}

/**
 * In the order they come alive. Transcription first because it is the one that
 * already works, and a list that opens with what is broken reads as a fault
 * report rather than a description of the app.
 */
const CAPABILITIES: Capability[] = [
  { id: "transcription", icon: Mic },
  { id: "noteFormatting", icon: Sparkles, remedy: "configureNoteFormatting" },
  { id: "chatIntelligence", icon: MessageSquareText, remedy: "configureChatIntelligence" },
];

/**
 * What Snowy can do right now, and what the rest would take.
 *
 * After onboarding, recording and transcription work and nothing else does —
 * and nothing on screen says so. A meeting recorded with no model configured is
 * captured perfectly, so the app looks complete right up until someone goes
 * looking for a write-up that was never written, or asks the panel a question
 * it cannot answer. This is the one place that states the boundary before it is
 * discovered the hard way.
 *
 * Every row is written around what the user gets, not what the setting is
 * called: "note formatting is not configured" means nothing to someone who has
 * never seen the phrase, while "meetings are transcribed but never written up"
 * is the thing they would have complained about.
 *
 * Collapses rather than dismisses. Transcription-only is a legitimate way to
 * use this and the free tier is exactly that, so a card that cannot be quieted
 * is nagging — but one that can be erased leaves the user with no way back to
 * an offer they might want later, and no answer to "what does this app
 * actually do". Collapsed, it is one line that still says what is missing.
 *
 * Hidden entirely once everything is configured: at that point it would be a
 * card whose only content is that there is nothing to do.
 */
export default function CapabilitiesCard() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useLocalStorage<boolean>(COLLAPSED_KEY, false);

  // useShallow because both selectors build a fresh object per call, and
  // Zustand compares by identity — without it this re-renders forever.
  const { noteFormattingModel, chatModel } = useSettingsStore(
    useShallow((state) => ({
      noteFormattingModel: selectResolvedNoteFormatting(state).model,
      chatModel: selectResolvedLLMConfig(state, "chatIntelligence").model,
    }))
  );

  const { rows, missing } = useMemo(() => {
    const ready: Record<CapabilityId, boolean> = {
      transcription: true,
      noteFormatting: Boolean(noteFormattingModel),
      chatIntelligence: Boolean(chatModel),
    };
    const built = CAPABILITIES.map((capability) => ({
      ...capability,
      ready: ready[capability.id],
    }));
    return { rows: built, missing: built.filter((row) => !row.ready) };
  }, [noteFormattingModel, chatModel]);

  if (missing.length === 0) return null;

  // The collapsed card keeps one button, and it goes wherever the first
  // unfinished capability is configured.
  const firstRemedy = missing.find((row) => row.remedy)?.remedy;

  const toggleLabel = collapsed ? t("home.capabilities.expand") : t("home.capabilities.collapse");

  return (
    <section className="mt-4 rounded-xl border border-border-subtle bg-surface-2 p-4 shadow-(--shadow-card)">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">{t("home.capabilities.title")}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {collapsed
              ? t("home.capabilities.collapsedSummary", { count: missing.length })
              : t("home.capabilities.description")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          className="-mr-1 -mt-1 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground/60 outline-none transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {collapsed ? (
        firstRemedy && (
          <div className="mt-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => requestSettings(SETTINGS_REMEDIES[firstRemedy])}
            >
              {t("home.capabilities.configure")}
            </Button>
          </div>
        )
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {rows.map(({ id, icon: Icon, remedy, ready }) => (
              <li
                key={id}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg border px-3 py-2.5",
                  ready ? "border-transparent bg-surface-1/60" : "border-border-subtle bg-surface-1"
                )}
              >
                <span
                  className={cn(
                    "mt-px flex size-6 shrink-0 items-center justify-center rounded-control border",
                    ready
                      ? "border-success/30 bg-success-subtle text-success"
                      : "border-border-subtle bg-surface-3 text-muted-foreground"
                  )}
                >
                  {ready ? (
                    <Check size={12} strokeWidth={2.25} />
                  ) : (
                    <Icon size={12} strokeWidth={1.75} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    {t(`home.capabilities.items.${id}.title`)}
                    <span
                      className={cn(
                        "rounded-sm px-1 py-px text-[10px] font-medium",
                        ready ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning"
                      )}
                    >
                      {ready ? t("home.capabilities.ready") : t("home.capabilities.needsSetup")}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    {t(`home.capabilities.items.${id}.${ready ? "ready" : "missing"}`)}
                  </p>
                </div>
                {!ready && remedy && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => requestSettings(SETTINGS_REMEDIES[remedy])}
                  >
                    {t("home.capabilities.configure")}
                  </Button>
                )}
              </li>
            ))}
          </ul>

          {/* Says the quiet part: this needs either a subscription or a key of
              their own. Finding that out after clicking through to Settings is
              a worse experience than being told here. */}
          <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground/70">
            {t("home.capabilities.footnote")}
          </p>
        </>
      )}
    </section>
  );
}
