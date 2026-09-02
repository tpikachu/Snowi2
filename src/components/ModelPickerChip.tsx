import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { Check, ChevronDown, KeyRound } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
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

export interface ModelSelection {
  mode: "providers" | "local";
  provider: string;
  model: string;
}

interface ModelPickerChipProps {
  /** Reads and writes this scope's config. Ignored when `value` is given. */
  scope?: InferenceScope;
  /** Controlled mode (the action editor's per-action override). */
  value?: { provider: string; model: string } | null;
  onSelect?: (selection: ModelSelection | null) => void;
  /**
   * Renders a leading "use the default" row (overrides only). Its label is
   * also what the chip shows while no override is set; choosing it calls
   * onSelect(null).
   */
  defaultLabel?: string;
  /** "hud" renders on the always-dark cue card; "app" follows the theme. */
  variant?: "app" | "hud";
  className?: string;
}

/** Providers the popover can enumerate: static catalog + a BYOK key field.
 *  OpenRouter/custom type their model ids in and stay in Advanced settings —
 *  an existing selection of theirs still displays, it just can't be built here. */
const listableCloudProviders = () =>
  Object.keys(BYOK_PROVIDER_KEY_FIELDS)
    .filter((id) => id !== "openrouter")
    .map((id) => ({
      id,
      name: REASONING_PROVIDERS[id]?.name ?? getProviderDisplayName(id),
      models: (REASONING_PROVIDERS[id]?.models ?? []).map((m) => ({
        id: m.value,
        label: m.label,
        descriptionKey: m.descriptionKey,
        description: m.description,
      })),
    }));

const shortModelLabel = (modelId: string): string => {
  for (const provider of Object.values(REASONING_PROVIDERS)) {
    const hit = provider.models.find((m) => m.value === modelId);
    if (hit) return hit.label;
  }
  return modelId;
};

export default function ModelPickerChip({
  scope = "chatIntelligence",
  value,
  onSelect,
  defaultLabel,
  variant = "app",
  className,
}: ModelPickerChipProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
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

  const current = value === undefined ? resolved : value;
  const isManaged = value === undefined && resolved.mode === "enterprise";

  // Downloaded local models, fetched when the popover first opens: the main
  // process owns the on-disk truth, and a closed chip should cost nothing.
  const [localModels, setLocalModels] = useState<PickerLocalModelInput[] | null>(null);
  const loadLocalModels = useCallback(async () => {
    try {
      const all = await window.electronAPI?.modelGetAll?.();
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
      if (onSelect) {
        onSelect(selection);
        return;
      }
      const previousMode = selectResolvedLLMConfig(getSettings(), scope).mode || "local";
      setResolvedLLMConfig(scope, selection);
      // Leaving local frees the llama server's RAM; arriving starts on demand.
      if (previousMode === "local" && selection.mode !== "local") {
        void window.electronAPI?.llamaServerStop?.();
      }
    },
    [onSelect, scope, localProviderById]
  );

  const openProviderKeys = useCallback(() => {
    setOpen(false);
    void window.electronAPI?.openControlPanel?.({
      settings: { section: "llms", panel: "providers" },
    });
  }, []);

  const chipLabel = current?.model
    ? shortModelLabel(current.model)
    : (defaultLabel ?? t("agentMode.modelPicker.choose"));

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
    "block truncate text-[10.5px] leading-tight",
    hud ? "text-hud-muted" : "text-muted-foreground"
  );
  const headingClass = cn(
    "px-2 pb-0.5 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.06em]",
    hud ? "text-hud-muted" : "text-muted-foreground"
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
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
          <span className="min-w-0 max-w-[120px] truncate">{chipLabel}</span>
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
        {defaultLabel && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSelect?.(null);
            }}
            className={rowClass}
          >
            <span className="min-w-0 flex-1 truncate">{defaultLabel}</span>
            {!current?.model && (
              <Check
                size={12}
                className={cn("shrink-0", hud ? "text-hud-accent" : "text-primary")}
              />
            )}
          </button>
        )}
        {groups.map((group) =>
          group.hasKey ? (
            <div key={group.providerId}>
              <p className={headingClass}>{group.providerName}</p>
              {group.models.map((model) => {
                const helper = helperText(model);
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => pick(group, model.id)}
                    className={rowClass}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate leading-tight">{model.label}</span>
                      {helper && <span className={helperClass}>{helper}</span>}
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
