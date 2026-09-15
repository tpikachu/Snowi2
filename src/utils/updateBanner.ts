/**
 * When the control panel's update banner shows.
 *
 * The banner is the persistent half of "there's a new version": the corner
 * card closes itself, the rail icon hides during meetings, and a toast is
 * gone in seconds — so the strip stays until acted on. "Later" snoozes it
 * for a day, and only for that version: a newer release un-snoozes on its
 * own. A downloaded update is snoozable too, since restarting is the
 * disruptive part.
 *
 * Pure so the policy is unit-tested; the component owns localStorage.
 */
export interface UpdateBannerSnooze {
  version: string;
  until: number;
}

export const UPDATE_BANNER_SNOOZE_KEY = "updateBannerSnooze";
export const UPDATE_BANNER_SNOOZE_MS = 24 * 60 * 60_000;

export function shouldShowUpdateBanner({
  available,
  downloaded,
  version,
  snooze,
  now,
}: {
  available: boolean;
  downloaded: boolean;
  version: string;
  snooze: UpdateBannerSnooze | null;
  now: number;
}): boolean {
  if (!available && !downloaded) return false;
  if (!snooze) return true;
  if (snooze.version !== version) return true;
  return now >= snooze.until;
}

export function snoozeUpdateBanner(version: string, now: number): UpdateBannerSnooze {
  return { version, until: now + UPDATE_BANNER_SNOOZE_MS };
}

/** The stored snooze, or null for anything unreadable. */
export function parseUpdateBannerSnooze(raw: string | null | undefined): UpdateBannerSnooze | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<UpdateBannerSnooze> | null;
    if (!parsed || typeof parsed.version !== "string" || typeof parsed.until !== "number") {
      return null;
    }
    if (!Number.isFinite(parsed.until)) return null;
    return { version: parsed.version, until: parsed.until };
  } catch {
    return null;
  }
}
