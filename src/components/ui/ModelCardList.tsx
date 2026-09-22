import { Globe, Download, Trash2, X, ExternalLink } from "lucide-react";
import { LocalModelCaveat } from "./LocalModelCaveat";
import { useTranslation } from "react-i18next";
import { Button } from "./button";
import { cn } from "../lib/utils";
import type { ColorScheme } from "../../utils/modelPickerStyles";
import { createExternalLinkHandler, withUtm } from "../../utils/externalLinks";

export interface ModelCardOption {
  value: string;
  label: string;
  description?: string;
  specUrl?: string;
  icon?: string;
  invertInDark?: boolean;
  // Explicit group for SearchableModelList; falls back to the "provider/"
  // prefix of `value` when absent (e.g. Bedrock ids carry no slash).
  group?: string;
  // Local model properties (optional)
  isDownloaded?: boolean;
  isDownloading?: boolean;
  recommended?: boolean;
  /** A short use-case pill after the name ("Best local answers"). */
  badge?: string;
  /** What a model on this computer gives up: web search, or every tool. */
  caveat?: { toolsOff: boolean };
  /** A second line under the row: what the model needs and what it gives up. */
  note?: string;
  /** "warn" when the note says the model will not run well here. */
  noteTone?: "muted" | "warn";
}

/**
 * Rule 3 — a selected model is a raised plate with an accent rail, not a
 * teal-tinted row. In a list of thirty models a tinted row loses against its
 * neighbours the moment the list scrolls; a rail holds the leading edge.
 *
 * Both colour schemes now resolve to the same construction (the app has one
 * accent), so `colorScheme` survives as a prop but no longer forks the look.
 */
const ROW_SELECTED =
  "border-border-control bg-surface-2 shadow-[var(--shadow-control),inset_2px_0_0_var(--color-primary)]";
const ROW_DEFAULT =
  "border-border-subtle bg-surface-1 shadow-(--shadow-panel) hover:border-border-hover hover:bg-surface-2";

const COLOR_CONFIG: Record<
  ColorScheme,
  {
    selected: string;
    default: string;
  }
> = {
  purple: { selected: ROW_SELECTED, default: ROW_DEFAULT },
  blue: { selected: ROW_SELECTED, default: ROW_DEFAULT },
};

/**
 * What the selected row's badge says. Default: "Active". A route that cannot
 * serve yet (a cloud speech provider without its key) passes a warning label
 * instead — a model marked Active over a missing key read as working.
 */
export interface SelectedBadge {
  label: string;
  tone?: "primary" | "warning";
}

interface ModelCardProps {
  model: ModelCardOption;
  isSelected: boolean;
  onSelect: (modelId: string) => void;
  colorScheme?: ColorScheme;
  selectedBadge?: SelectedBadge;
  // Long-form descriptions (e.g. OpenRouter) fill the row and ellipsize
  // instead of sitting flush-right like short metadata.
  truncateDescription?: boolean;
  // Local model actions (optional - when provided, enables local model UI)
  onDownload?: (modelId: string) => void;
  onDelete?: (modelId: string) => void;
  onCancelDownload?: () => void;
  isCancelling?: boolean;
  isInstalling?: boolean;
}

export function ModelCard({
  model,
  isSelected,
  onSelect,
  colorScheme = "purple",
  truncateDescription = false,
  onDownload,
  onDelete,
  onCancelDownload,
  isCancelling = false,
  isInstalling = false,
  selectedBadge,
}: ModelCardProps) {
  const { t } = useTranslation();
  const styles = COLOR_CONFIG[colorScheme];
  const isLocalMode = Boolean(onDownload);
  const isDownloaded = model.isDownloaded;
  const isDownloading = model.isDownloading;
  const specHref = model.specUrl ? withUtm(model.specUrl, "model_spec") : undefined;

  const handleCardClick = () => {
    if (isLocalMode) {
      if (isDownloaded && !isSelected) {
        onSelect(model.value);
      }
    } else {
      onSelect(model.value);
    }
  };

  // A square status pip. No glow: this system reads state from shape and
  // position, and a bloom on a 6px dot is decoration, not information.
  const getStatusDotClass = () => {
    if (!isLocalMode) {
      return isSelected ? "bg-primary" : "bg-border-hover";
    }
    if (isDownloaded) {
      return isSelected ? "bg-primary" : "bg-success";
    }
    if (isDownloading) {
      return "bg-warning";
    }
    return "bg-border-subtle";
  };

  return (
    <div
      onClick={handleCardClick}
      className={`group relative w-full overflow-hidden rounded-surface border p-1.5 pl-2.5 text-left transition-[background-color,border-color,box-shadow] duration-100 ease-snap ${
        isSelected ? styles.selected : styles.default
      } ${!isLocalMode || (isDownloaded && !isSelected) ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-center gap-1.5">
        <div
          className={`size-1.5 shrink-0 rounded-[1px] ${getStatusDotClass()} ${
            isDownloading ? "animate-pulse" : ""
          }`}
        />

        {model.icon ? (
          <img
            src={model.icon}
            alt=""
            className={`w-3.5 h-3.5 shrink-0 ${model.invertInDark ? "icon-monochrome" : ""}`}
            aria-hidden="true"
          />
        ) : (
          <Globe className="w-3.5 h-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}

        <span
          className={cn(
            "truncate text-[13px] font-semibold tracking-[-0.008em] text-foreground",
            truncateDescription && (model.description ? "shrink-0 max-w-[60%]" : "min-w-0 flex-1")
          )}
        >
          {model.label}
        </span>
        {model.description && (
          <span
            className={
              truncateDescription
                ? "min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
                : "shrink-0 text-[11px] tabular-nums text-muted-foreground"
            }
          >
            {model.description}
          </span>
        )}
        {specHref && (
          <a
            href={specHref}
            onClick={createExternalLinkHandler(specHref)}
            className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-primary transition-colors hover:text-primary-hover"
          >
            {t("models.learnMore")}
            <ExternalLink size={9} />
          </a>
        )}

        {model.badge && (
          <span className="micro-caps shrink-0 rounded-control border border-border-subtle bg-surface-3 px-1.5 py-0.5 text-muted-foreground">
            {model.badge}
          </span>
        )}

        {model.recommended && (
          <span className="micro-caps shrink-0 rounded-control border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-primary">
            {t("common.recommended")}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {isSelected && (
            <span
              data-selected-badge={selectedBadge?.tone === "warning" ? "warning" : "active"}
              className={cn(
                "micro-caps rounded-control border px-1.5 py-0.5",
                selectedBadge?.tone === "warning"
                  ? "border-warning/40 bg-warning-subtle text-warning"
                  : "border-primary/25 bg-primary/10 text-primary"
              )}
            >
              {selectedBadge?.label ?? t("common.active")}
            </span>
          )}

          {isLocalMode && (
            <>
              {isDownloaded ? (
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete?.(model.value);
                  }}
                  size="sm"
                  variant="ghost"
                  className="size-7 p-0 text-muted-foreground opacity-0 transition-[color,background-color,opacity] group-hover:opacity-100 hover:text-destructive"
                >
                  <Trash2 size={12} />
                </Button>
              ) : isDownloading ? (
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancelDownload?.();
                  }}
                  disabled={isCancelling || isInstalling}
                  size="sm"
                  variant="outline"
                  className="h-6 border-destructive/35 px-2 text-destructive hover:border-destructive/50 hover:bg-destructive/10"
                >
                  <X size={11} className="mr-0.5" />
                  {isCancelling ? "..." : t("common.cancel")}
                </Button>
              ) : (
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload?.(model.value);
                  }}
                  size="sm"
                  variant="default"
                  className="h-6 px-2"
                >
                  <Download size={11} className="mr-1" />
                  {t("common.download")}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      {(model.note || model.caveat) && (
        // The caveat badge rides the second line, not the title row: beside
        // the name, tier and Recommended it squeezed the name into an
        // ellipsis at ordinary window widths.
        <div
          className={cn(
            "mt-0.5 flex items-center gap-1.5 pl-[18px] text-[11px] leading-snug",
            model.noteTone === "warn" ? "text-warning" : "text-muted-foreground"
          )}
        >
          {model.note && <span className="min-w-0 truncate">{model.note}</span>}
          {model.caveat && <LocalModelCaveat toolsOff={model.caveat.toolsOff} />}
        </div>
      )}
    </div>
  );
}

interface ModelCardListProps {
  models: ModelCardOption[];
  selectedModel: string;
  onModelSelect: (modelId: string) => void;
  colorScheme?: ColorScheme;
  className?: string;
  truncateDescription?: boolean;
  // Local model actions (optional - when provided, enables local model UI)
  onDownload?: (modelId: string) => void;
  onDelete?: (modelId: string) => void;
  onCancelDownload?: () => void;
  isCancelling?: boolean;
  isInstalling?: boolean;
  selectedBadge?: SelectedBadge;
}

export default function ModelCardList({
  models,
  selectedModel,
  onModelSelect,
  colorScheme = "purple",
  className = "",
  truncateDescription = false,
  onDownload,
  onDelete,
  onCancelDownload,
  isCancelling = false,
  isInstalling = false,
  selectedBadge,
}: ModelCardListProps) {
  const { t } = useTranslation();

  if (models.length === 0) {
    return <p className="py-2 text-[13px] text-muted-foreground">{t("models.noneAvailable")}</p>;
  }

  return (
    <div className={`space-y-0.5 ${className}`}>
      {models.map((model) => (
        <ModelCard
          key={model.value}
          model={model}
          isSelected={selectedModel === model.value}
          onSelect={onModelSelect}
          colorScheme={colorScheme}
          truncateDescription={truncateDescription}
          onDownload={onDownload}
          onDelete={onDelete}
          onCancelDownload={onCancelDownload}
          isCancelling={isCancelling}
          isInstalling={isInstalling}
          selectedBadge={selectedBadge}
        />
      ))}
    </div>
  );
}
