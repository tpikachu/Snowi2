/**
 * `noteFormatting*` settings keys, renamed to `actions*`.
 *
 * Note formatting was never a feature of its own. Writing up a meeting is the
 * built-in Generate Notes action, run automatically when a meeting is kept, and
 * every other action ran on the same model — so the scope was named after one
 * of the things it did and then listed as a peer of Chat. It is called
 * `actions` now, and these are the keys the old name wrote.
 *
 * Pure and storage-injected so the rules can be tested without a browser: this
 * runs once, before anything reads a setting, and a mistake here silently
 * resets somebody's configured model.
 */

/**
 * Spelled out rather than derived from `INFERENCE_SCOPES`, because a migration
 * has to name what the *old* build wrote. Deriving it from today's definition
 * would make this rewrite itself the next time the scope changes, and then it
 * would be migrating from wherever the keys happen to be to the same place.
 */
export const ACTIONS_SCOPE_RENAMES: ReadonlyArray<readonly [string, string]> = [
  ["noteFormattingMode", "actionsMode"],
  ["noteFormattingProvider", "actionsProvider"],
  ["noteFormattingModel", "actionsModel"],
  ["noteFormattingCloudMode", "actionsCloudMode"],
  ["noteFormattingCloudBaseUrl", "actionsCloudBaseUrl"],
  ["noteFormattingRemoteUrl", "actionsRemoteUrl"],
  ["noteFormattingDisableThinking", "actionsDisableThinking"],
];

export const LLM_TAB_KEY = "settings.llmsTab";

/**
 * The scope's Custom-endpoint API key is deliberately absent.
 *
 * It is a secret: it lives encrypted under `userData/secure-keys`, keyed by a
 * filename that still says "note formatting", and it is loaded through IPC
 * rather than read from here. Nothing about it is in web storage to migrate —
 * see the comment on that entry in `config/secretKeys.js`.
 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Copies, rather than moves.
 *
 * A user who installs this build and then goes back to an older one finds
 * their model still configured, because the old keys were never removed. The
 * cost is a handful of stale entries; the alternative is a downgrade that
 * looks like the app forgot everything.
 */
export function migrateActionsScopeKeys(storage: KeyValueStorage): void {
  for (const [from, to] of ACTIONS_SCOPE_RENAMES) {
    // Never clobbers. A non-null new key means this has already run, and the
    // old value is whatever the user last set under the previous build — which
    // is older than what they have since chosen here.
    if (storage.getItem(to) !== null) continue;
    const value = storage.getItem(from);
    if (value !== null) storage.setItem(to, value);
  }

  // The remembered Settings tab is a stored id like any other. Without this the
  // panel still opens — an unknown tab falls back to the first one, which is
  // Actions — but only by accident of ordering.
  if (storage.getItem(LLM_TAB_KEY) === "noteFormatting") {
    storage.setItem(LLM_TAB_KEY, "actions");
  }
}
