import { createContext, useContext } from "react";

export interface SettingsSurfaceMetrics {
  /** Content column is narrow enough that label/control rows must stack. */
  isCompact: boolean;
  /** Content column can carry two balanced columns of grouped panels. */
  isWide: boolean;
}

export const SettingsSurfaceContext = createContext<SettingsSurfaceMetrics>({
  isCompact: false,
  isWide: false,
});

export function useSettingsSurface(): SettingsSurfaceMetrics {
  return useContext(SettingsSurfaceContext);
}

/** Width below which the content column stacks its rows. */
export const SETTINGS_COMPACT_PX = 640;
/**
 * Width from which grouped panels flow into two columns. Set so each column
 * still clears ~520px — narrower than that and a label/description/control row
 * starts to crowd, which defeats the point of the second column.
 */
export const SETTINGS_WIDE_PX = 1120;
