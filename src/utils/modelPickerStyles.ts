export type ColorScheme = "purple" | "blue";

export interface ModelPickerStyles {
  container: string;
  header: string;
  modelCard: { selected: string; default: string };
  badges: { selected: string; downloaded: string; recommended: string };
  buttons: { download: string; select: string; delete: string; refresh: string };
}

export const MODEL_PICKER_COLORS: Record<ColorScheme, ModelPickerStyles> = {
  purple: {
    container:
      "bg-surface-1 rounded-lg overflow-hidden border border-border-subtle shadow-(--shadow-raised)",
    header: "font-medium text-foreground tracking-tight",
    modelCard: {
      selected:
        "border-primary/45 bg-primary/10 dark:bg-primary/12 shadow-(--shadow-selected) relative",
      default:
        "border-border-subtle bg-surface-2/60 hover:border-border-hover hover:bg-surface-raised/70 hover:shadow-(--shadow-card-hover-subtle) transition-[background-color,border-color,box-shadow] duration-150 ease-snap",
    },
    badges: {
      selected:
        "text-[10px] text-primary-foreground bg-primary px-1.5 py-0.5 rounded-sm font-medium",
      downloaded:
        "text-[10px] text-success dark:text-success bg-success/10 dark:bg-success/12 px-1.5 py-0.5 rounded-sm",
      recommended:
        "text-[10px] text-primary bg-primary/10 dark:bg-primary/12 px-1.5 py-0.5 rounded-sm font-medium",
    },
    buttons: {
      download: "",
      select: "border-primary/25 text-primary hover:bg-primary/8",
      delete:
        "text-destructive hover:text-destructive/90 hover:bg-destructive/8 border-destructive/25",
      refresh: "border-primary/25 text-primary hover:bg-primary/8",
    },
  },
  blue: {
    container:
      "bg-surface-1 rounded-lg overflow-hidden border border-border-subtle shadow-(--shadow-raised)",
    header: "text-sm font-medium text-foreground tracking-tight",
    modelCard: {
      selected:
        "border-primary/45 bg-primary/10 dark:bg-primary/12 shadow-(--shadow-selected) relative",
      default:
        "border-border-subtle bg-surface-2/60 hover:border-border-hover hover:bg-surface-raised/70 hover:shadow-(--shadow-card-hover-subtle) transition-[background-color,border-color,box-shadow] duration-150 ease-snap",
    },
    badges: {
      selected:
        "text-[10px] text-primary-foreground bg-primary px-1.5 py-0.5 rounded-sm font-medium",
      downloaded: "text-[10px] text-success bg-success/10 px-1.5 py-0.5 rounded-sm font-medium",
      recommended: "text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-sm font-medium",
    },
    buttons: {
      download: "",
      select:
        "border-border text-foreground hover:bg-surface-raised hover:border-border-hover",
      delete:
        "text-destructive hover:text-destructive/90 hover:bg-destructive/8 border-destructive/25",
      refresh:
        "border-border text-foreground hover:bg-surface-raised hover:border-border-hover",
    },
  },
};

export function getModelPickerStyles(colorScheme: ColorScheme): ModelPickerStyles {
  return MODEL_PICKER_COLORS[colorScheme];
}
