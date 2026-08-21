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
import { getProviderDisplayName, getReasoningModelLabel } from "../../models/ModelRegistry";
import {
  selectResolvedLLMConfig,
  selectResolvedMeetingTranscription,
  selectResolvedNoteFormatting,
  useSettingsStore,
} from "../../stores/settingsStore";

const COLLAPSED_KEY = "homeCapabilitiesCollapsed";

type CapabilityId = "transcription" | "noteFormatting" | "chatIntelligence";

interface Capability {
  id: CapabilityId;
  icon: LucideIcon;
  remedy: SettingsRemedy;
}

/**
 * In the order they come alive. Transcription first because it is the one that
 * already works, and a list that opens with what is broken reads as a fault
 * report rather than a description of the app.
 */
const CAPABILITIES: Capability[] = [
  { id: "transcription", icon: Mic, remedy: "configureMeetingTranscription" },
  // Named "Actions", not "written-up meetings". The write-up is not a separate
  // feature: it is the built-in Generate Notes action, run automatically when a
  // meeting is kept. Calling it anything else here means the button leads to a
  // Settings panel with a different name on it.
  { id: "noteFormatting", icon: Sparkles, remedy: "configureNoteFormatting" },
  { id: "chatIntelligence", icon: MessageSquareText, remedy: "configureChatIntelligence" },
];

interface CapabilityRow extends Capability {
  ready: boolean;
  /** What is actually running, once something is. */
  model: string | null;
  /** Where it runs — a provider name, or "on this machine". */
  where: string | null;
}

/**
 * What Snowy can do right now, and what it is doing it with.
 *
 * Two questions, one card. After onboarding, recording and transcription work
 * and nothing else does — and nothing on screen says so, because a meeting
 * recorded with no model configured is captured perfectly and looks complete
 * right up until someone goes looking for a write-up that was never written.
 * That is the first question, and it is why this exists.
 *
 * The second only matters once things are configured: *which* model. "It is
 * set up" is not an answer when the write-up quality is disappointing, or when
 * the bill arrives, or when someone wants to know whether their transcript
 * left the machine. So a working capability names its model and where it runs,
 * and offers the way back to change it.
 *
 * Every row is written around what the user gets, not what the setting is
 * called: "note formatting is not configured" means nothing to someone who has
 * never seen the phrase, while "meetings are transcribed but never written up"
 * is the thing they would have complained about.
 *
 * Collapses rather than dismisses. Transcription-only is a legitimate way to
 * use this and the free tier is exactly that, so a card that cannot be quieted
 * is nagging — but one that can be erased leaves the user with no way back to
 * an offer they might want later, and no answer to either question above.
 */
export default function CapabilitiesCard() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useLocalStorage<boolean>(COLLAPSED_KEY, false);

  // useShallow because every one of these selectors builds a fresh object per
  // call, and Zustand compares by identity — without it this re-renders forever.
  const resolved = useSettingsStore(
    useShallow((state) => {
      const noteFormatting = selectResolvedNoteFormatting(state);
      const chat = selectResolvedLLMConfig(state, "chatIntelligence");
      const transcription = selectResolvedMeetingTranscription(state);
      return {
        noteFormattingModel: noteFormatting.model,
        noteFormattingProvider: noteFormatting.provider,
        chatModel: chat.model,
        chatProvider: chat.provider,
        isLocalTranscription: transcription.useLocalWhisper,
        localTranscriptionModel:
          transcription.localTranscriptionProvider === "nvidia"
            ? transcription.parakeetModel
            : transcription.whisperModel,
        cloudTranscriptionModel: transcription.cloudTranscriptionModel,
        cloudTranscriptionProvider: transcription.cloudTranscriptionProvider,
      };
    })
  );

  const rows = useMemo((): CapabilityRow[] => {
    const describe = (model: string, provider: string) => ({
      ready: Boolean(model),
      model: model ? getReasoningModelLabel(model) : null,
      where: model && provider ? getProviderDisplayName(provider) : null,
    });

    // Transcription is never "unconfigured" the way a model scope is — a
    // meeting always has an engine — so it reports which one rather than
    // whether. Local says so instead of naming a provider: "on this machine"
    // is the part someone checking on their transcript wants to read.
    const transcription: Pick<CapabilityRow, "ready" | "model" | "where"> =
      resolved.isLocalTranscription
        ? {
            ready: true,
            model: resolved.localTranscriptionModel || t("home.status.transcriptionUnset"),
            where: t("home.capabilities.onThisMachine"),
          }
        : {
            ready: true,
            model: resolved.cloudTranscriptionModel || t("home.status.transcriptionUnset"),
            where: resolved.cloudTranscriptionProvider
              ? getProviderDisplayName(resolved.cloudTranscriptionProvider)
              : null,
          };

    const byId: Record<CapabilityId, Pick<CapabilityRow, "ready" | "model" | "where">> = {
      transcription,
      noteFormatting: describe(resolved.noteFormattingModel, resolved.noteFormattingProvider),
      chatIntelligence: describe(resolved.chatModel, resolved.chatProvider),
    };

    return CAPABILITIES.map((capability) => ({ ...capability, ...byId[capability.id] }));
  }, [resolved, t]);

  const missing = rows.filter((row) => !row.ready);
  const allSet = missing.length === 0;

  const toggleLabel = collapsed ? t("home.capabilities.expand") : t("home.capabilities.collapse");

  return (
    <section className="mt-4 rounded-xl border border-border-subtle bg-surface-2 p-4 shadow-(--shadow-card)">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">{t("home.capabilities.title")}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {collapsed
              ? allSet
                ? t("home.capabilities.collapsedSummaryAllSet")
                : t("home.capabilities.collapsedSummary", { count: missing.length })
              : allSet
                ? t("home.capabilities.descriptionAllSet")
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
        !allSet && (
          <div className="mt-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => requestSettings(SETTINGS_REMEDIES[missing[0].remedy])}
            >
              {t("home.capabilities.configure")}
            </Button>
          </div>
        )
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {rows.map(({ id, icon: Icon, remedy, ready, model, where }) => (
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
                  {/* What is actually running. The model id is rendered as data
                      rather than prose, so it survives being scanned and can be
                      compared against what Settings says without reading a
                      sentence. */}
                  {ready && model && (
                    <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
                      <span className="rounded-sm border border-border-subtle bg-surface-3 px-1 py-px font-medium text-foreground">
                        {model}
                      </span>
                      {where && <span className="text-muted-foreground/70">{where}</span>}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => requestSettings(SETTINGS_REMEDIES[remedy])}
                >
                  {ready ? t("home.capabilities.change") : t("home.capabilities.configure")}
                </Button>
              </li>
            ))}
          </ul>

          {/* Says the quiet part, but only while there is something to buy:
              this needs either a subscription or a key of their own. Finding
              that out after clicking through to Settings is a worse experience
              than being told here. */}
          {!allSet && (
            <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground/70">
              {t("home.capabilities.footnote")}
            </p>
          )}
        </>
      )}
    </section>
  );
}
