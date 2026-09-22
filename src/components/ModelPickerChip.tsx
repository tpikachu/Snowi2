import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { Check, ChevronDown, KeyRound } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import { LocalModelCaveat } from "./ui/LocalModelCaveat";
import { cn } from "./lib/utils";
import {
  useSettingsStore,
  selectResolvedLLMConfig,
  setResolvedLLMConfig,
  getSettings,
  BYOK_PROVIDER_KEY_FIELDS,
} from "../stores/settingsStore";
import {
  REASONING_PROVIDERS,
  modelRegistry,
  getProviderDisplayName,
} from "../models/ModelRegistry";
import {
  buildModelPickerGroups,
  type ModelPickerGroup,
  type PickerLocalModelInput,
} from "../utils/modelPickerOptions";
import type { InferenceScope } from "../config/inferenceScopes";
import { openrouterModelLabel, openrouterPickerModels } from "../config/openrouterModels";
import { LOCAL_LLM_ENABLED } from "../config/features";
import {
  describeLocalModel,
  type LocalModelLabels,
  type MachineMemory,
} from "../utils/localModelLabels";
import logger from "../utils/logger";

/**
 * The point-of-use model picker: a quiet chip naming the current model, a
 * popover to change it. Lives where the model is USED — the chat composer,
 * the meeting cue card, an action's editor — because "which brain answers me"
 * is a decision made mid-task, not in Settings. Settings keeps only the API
 * keys; a pick made here writes the same per-scope store keys Settings used
 * to, so it persists and every surface sharing the scope follows.
 *
 * The popover offers only what would actually work: keyed cloud providers
 * and downloaded local models. Keyless providers trail as "add a key" rows
 * that deep-link to Settings — never a model that would 401.
 */

interface ModelSelection {
  mode: "providers" | "local";
  provider: string;
  model: string;
}

interface ModelPickerChipProps {
  /** Reads and writes this scope's config. */
  scope?: InferenceScope;
  /** "hud" renders on the always-dark cue card; "app" follows the theme. */
  variant?: "app" | "hud";
  className?: string;
}

/** Providers the popover can enumerate: a BYOK key field plus a catalog —
 *  the registry's for the vendors, the curated slice for OpenRouter, which
 *  fronts hundreds more and so also takes an id typed in (`acceptsAnyModelId`).
 *  Until 2026-09-15 OpenRouter was filtered out here and its key was dead
 *  weight: the Advanced editor the comment sent people to had been removed. */
const listableCloudProviders = () =>
  Object.keys(BYOK_PROVIDER_KEY_FIELDS).map((id) => ({
    id,
    name: REASONING_PROVIDERS[id]?.name ?? getProviderDisplayName(id),
    models:
      id === "openrouter"
        ? openrouterPickerModels()
        : (REASONING_PROVIDERS[id]?.models ?? []).map((m) => ({
            id: m.value,
            label: m.label,
            descriptionKey: m.descriptionKey,
            description: m.description,
          })),
    acceptsAnyModelId: id === "openrouter",
  }));

const shortModelLabel = (modelId: string): string => {
  for (const provider of Object.values(REASONING_PROVIDERS)) {
    const hit = provider.models.find((m) => m.value === modelId);
    if (hit) return hit.label;
  }
  // Local GGUF models live in the other half of the registry.
  for (const provider of modelRegistry.getAllProviders()) {
    const hit = provider.models.find((m) => m.id === modelId);
    if (hit) return hit.name;
  }
  return openrouterModelLabel(modelId) ?? modelId;
};

export default function ModelPickerChip({
  scope = "chatIntelligence",
  variant = "app",
  className,
}: ModelPickerChipProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // The typed-in id row (OpenRouter): null while collapsed, the draft while open.
  const [customDraft, setCustomDraft] = useState<string | null>(null);
  const hud = variant === "hud";

  const resolved = useSettingsStore(
    useShallow((s) => {
      const config = selectResolvedLLMConfig(s, scope);
      return { mode: config.mode, provider: config.provider, model: config.model };
    })
  );
  const keyedProviderIds = useSettingsStore(
    useShallow((s) => {
      const keyed = new Set<string>();
      for (const [id, field] of Object.entries(BYOK_PROVIDER_KEY_FIELDS)) {
        if (field && (s[field] as string | undefined)?.trim()) keyed.add(id);
      }
      return keyed;
    })
  );

  const current = resolved;
  const isManaged = resolved.mode === "enterprise";

  // Downloaded local models, fetched when the popover first opens: the main
  // process owns the on-disk truth, and a closed chip should cost nothing.
  // With local language models hidden the group is simply empty — a model on
  // disk is not on offer. The machine's memory rides along so each local row
  // can say whether the model fits (localModelLabels.ts).
  const [localModels, setLocalModels] = useState<PickerLocalModelInput[] | null>(null);
  const [machine, setMachine] = useState<MachineMemory | null>(null);
  const loadLocalModels = useCallback(async () => {
    if (!LOCAL_LLM_ENABLED) {
      setLocalModels([]);
      return;
    }
    try {
      const [all, capability] = await Promise.all([
        window.electronAPI?.modelGetAll?.(),
        window.electronAPI?.getCapabilitySnapshot?.().catch(() => null),
      ]);
      if (capability) {
        setMachine({ totalMemGb: capability.totalMemGb, vramGb: capability.gpu?.vramGb ?? null });
      }
      const downloaded = new Set(
        (Array.isArray(all) ? all : [])
          .filter((m: { isDownloaded?: boolean }) => m.isDownloaded)
          .map((m: { id: string }) => m.id)
      );
      const options: PickerLocalModelInput[] = [];
      for (const provider of modelRegistry.getAllProviders()) {
        for (const model of provider.models) {
          if (downloaded.has(model.id)) {
            options.push({
              id: model.id,
              label: model.name,
              providerId: provider.id,
              descriptionKey: model.descriptionKey,
              description: model.description,
              sizeBytes: model.sizeBytes,
              tier: model.tier,
            });
          }
        }
      }
      setLocalModels(options);
    } catch (error) {
      logger.error("Model picker failed to list local models", { error }, "models");
      setLocalModels([]);
    }
  }, []);

  const groups: ModelPickerGroup[] = useMemo(
    () =>
      buildModelPickerGroups({
        cloudProviders: listableCloudProviders(),
        keyedProviderIds,
        localModels: localModels ?? [],
        localGroupName: t("agentMode.modelPicker.localGroup"),
      }),
    [keyedProviderIds, localModels, t]
  );

  const localProviderById = useMemo(() => {
    const map = new Map<string, string>();
    for (const model of localModels ?? []) map.set(model.id, model.providerId);
    return map;
  }, [localModels]);

  const pick = useCallback(
    (group: ModelPickerGroup, modelId: string) => {
      const selection: ModelSelection =
        group.kind === "local"
          ? { mode: "local", provider: localProviderById.get(modelId) ?? "", model: modelId }
          : { mode: "providers", provider: group.providerId, model: modelId };
      setOpen(false);
      setCustomDraft(null);
      const previousMode = selectResolvedLLMConfig(getSettings(), scope).mode || "local";
      setResolvedLLMConfig(scope, selection);
      // Leaving local frees the llama server's RAM; arriving starts on demand.
      if (previousMode === "local" && selection.mode !== "local") {
        void window.electronAPI?.llamaServerStop?.();
      }
    },
    [scope, localProviderById]
  );

  const openProviderKeys = useCallback(() => {
    setOpen(false);
    void window.electronAPI?.openControlPanel?.({
      settings: { section: "llms", panel: "providers" },
    });
  }, []);

  const chipLabel = current.model
    ? shortModelLabel(current.model)
    : t("agentMode.modelPicker.choose");

  const rowClass = cn(
    "flex min-h-8 w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[12px] transition-colors duration-100",
    hud ? "text-hud-foreground/90 hover:bg-white/10" : "text-foreground/90 hover:bg-surface-2"
  );
  // The registry's one-liner ("Fast and cost-efficient"), localized when its
  // key is translated, English registry text otherwise — never the raw key.
  const helperText = (model: { descriptionKey?: string; description?: string }): string | null => {
    if (model.descriptionKey) {
      const translated = t(model.descriptionKey);
      if (translated && translated !== model.descriptionKey) return translated;
    }
    return model.description ?? null;
  };
  const helperClass = cn(
    "flex items-center gap-1.5 text-[10.5px] leading-tight",
    hud ? "text-hud-muted" : "text-muted-foreground"
  );
  const headingClass = cn(
    "px-2 pb-0.5 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.06em]",
    hud ? "text-hud-muted" : "text-muted-foreground"
  );
  const noteClass = cn(
    "px-2 pb-1 text-[10.5px] leading-snug",
    hud ? "text-hud-muted" : "text-muted-foreground"
  );
  const tierClass = cn(
    "shrink-0 rounded-[4px] border px-1 py-px text-[9px] font-semibold uppercase tracking-[0.06em]",
    hud ? "border-white/15 text-hud-muted" : "border-border-subtle text-muted-foreground"
  );
  // A local row's helper is what the person needs at the moment of choice —
  // the memory it takes against this machine — not the registry's one-liner,
  // which is what left "Qwen3.5 9B" looking like an equal to a cloud model
  // (client, 2026-09-15). What it gives up is the badge beside the tier
  // (LocalModelCaveat), with the explanation as its tooltip.
  const localHelper = (labels: LocalModelLabels): { text: string; warn: boolean } => {
    const gb = labels.memoryGb;
    const memory =
      labels.fit === "poor"
        ? t("models.local.memoryTooMuch", { gb })
        : labels.fit === "tight"
          ? t("models.local.memoryTight", { gb })
          : t("models.local.memory", { gb });
    return { text: memory, warn: labels.fit === "poor" };
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setCustomDraft(null);
        if (next && localModels === null) void loadLocalModels();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={isManaged}
          title={isManaged ? t("settingsModal.managedByOrg") : t("common.model")}
          aria-label={t("common.model")}
          className={cn(
            "flex h-6 min-w-0 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium",
            "transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2",
            hud
              ? "text-hud-muted hover:bg-white/10 hover:text-hud-foreground focus-visible:ring-hud-accent/70"
              : "bg-surface-2 text-muted-foreground hover:bg-surface-3 hover:text-foreground focus-visible:ring-ring",
            "disabled:cursor-default disabled:opacity-60",
            className
          )}
        >
          <span className="min-w-0 max-w-[180px] truncate">{chipLabel}</span>
          <ChevronDown size={10} className="shrink-0 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={hud ? "end" : "start"}
        className={cn(
          "max-h-80 w-72 overflow-y-auto p-1.5",
          hud &&
            "border-white/10 bg-[oklch(0.21_0.008_230)] text-hud-foreground shadow-[0_8px_24px_-8px_rgb(0_0_0/0.7)]"
        )}
      >
        {groups.map((group) =>
          group.hasKey ? (
            <div key={group.providerId}>
              <p className={headingClass}>{group.providerName}</p>
              {group.kind === "local" && <p className={noteClass}>{t("models.local.note")}</p>}
              {group.models.map((model) => {
                const local =
                  group.kind === "local" && model.sizeBytes !== undefined
                    ? describeLocalModel(
                        { id: model.id, sizeBytes: model.sizeBytes, tier: model.tier },
                        machine
                      )
                    : null;
                const helper = local
                  ? localHelper(local)
                  : (() => {
                      const text = helperText(model);
                      return text ? { text, warn: false } : null;
                    })();
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => pick(group, model.id)}
                    title={helper?.text}
                    className={cn(rowClass, local?.fit === "poor" && "opacity-60")}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="min-w-0 truncate leading-tight">{model.label}</span>
                        {local && (
                          <span className={tierClass}>{t(`models.local.tier.${local.tier}`)}</span>
                        )}
                      </span>
                      {(helper || local) && (
                        // The caveat badge sits on the helper line, after the
                        // memory figure, so a long model name keeps its row.
                        <span className={cn(helperClass, helper?.warn && "text-warning")}>
                          {helper && <span className="min-w-0 truncate">{helper.text}</span>}
                          {local && <LocalModelCaveat toolsOff={local.toolsOff} hud={hud} />}
                        </span>
                      )}
                    </span>
                    {current?.model === model.id && (
                      <Check
                        size={12}
                        className={cn("shrink-0", hud ? "text-hud-accent" : "text-primary")}
                      />
                    )}
                  </button>
                );
              })}
              {group.acceptsAnyModelId &&
                current?.provider === group.providerId &&
                !!current.model &&
                !group.models.some((m) => m.id === current.model) && (
                  /* An id typed in earlier: shown as the selection it is. */
                  <button
                    type="button"
                    onClick={() => pick(group, current.model)}
                    className={rowClass}
                  >
                    <span className="min-w-0 flex-1 truncate leading-tight">{current.model}</span>
                    <Check
                      size={12}
                      className={cn("shrink-0", hud ? "text-hud-accent" : "text-primary")}
                    />
                  </button>
                )}
              {group.acceptsAnyModelId &&
                (customDraft === null ? (
                  <button
                    type="button"
                    onClick={() => setCustomDraft("")}
                    className={cn(rowClass, hud ? "text-hud-muted" : "text-muted-foreground")}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {t("agentMode.modelPicker.customModel")}
                    </span>
                  </button>
                ) : (
                  <form
                    className="flex items-center gap-1 px-2 py-1"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const id = customDraft.trim();
                      if (id) pick(group, id);
                    }}
                  >
                    <input
                      autoFocus
                      value={customDraft}
                      onChange={(event) => setCustomDraft(event.target.value)}
                      placeholder={t("agentMode.modelPicker.customModelPlaceholder")}
                      aria-label={t("agentMode.modelPicker.customModel")}
                      spellCheck={false}
                      className={cn(
                        "h-7 min-w-0 flex-1 rounded-md border px-2 text-[12px] outline-none",
                        hud
                          ? "border-white/15 bg-white/5 text-hud-foreground placeholder:text-hud-muted focus:border-hud-accent/60"
                          : "border-border-subtle bg-background text-foreground placeholder:text-muted-foreground focus:border-primary/50"
                      )}
                    />
                    <button
                      type="submit"
                      disabled={!customDraft.trim()}
                      className={cn(
                        "h-7 shrink-0 rounded-md px-2 text-[11px] font-medium disabled:opacity-50",
                        hud
                          ? "bg-white/10 text-hud-foreground hover:bg-white/15"
                          : "bg-surface-2 text-foreground hover:bg-surface-3"
                      )}
                    >
                      {t("agentMode.modelPicker.useModel")}
                    </button>
                  </form>
                ))}
            </div>
          ) : (
            /* No key: one row advertising the provider, walking to Settings. */
            <button
              key={group.providerId}
              type="button"
              onClick={openProviderKeys}
              className={cn(rowClass, hud ? "text-hud-muted" : "text-muted-foreground")}
            >
              <span className="min-w-0 flex-1 truncate">{group.providerName}</span>
              <span className="flex shrink-0 items-center gap-1 text-[10.5px]">
                <KeyRound size={10} />
                {t("agentMode.modelPicker.addKey")}
              </span>
            </button>
          )
        )}
      </PopoverContent>
    </Popover>
  );
}
