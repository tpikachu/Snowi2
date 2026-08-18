export function openExternalLink(url: string): void {
  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function createExternalLinkHandler(url: string) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    openExternalLink(url);
  };
}

// Outbound links open unchanged — no attribution parameters are added.
// Kept as a pass-through so existing call sites keep working.
export function withUtm(url: string, _campaign = "app"): string {
  return url;
}
