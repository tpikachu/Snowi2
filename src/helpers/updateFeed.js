/**
 * Picks the release the app should update to, from GitHub's release list.
 *
 * electron-updater's own GitHub provider reads a tag's prerelease identifier
 * as a channel name and only accepts a tag carrying the same one: running
 * 0.1.0-rc8 it takes rc8-tagged releases only, so v0.1.0-rc9 was never found
 * and every check ended in "No published versions on GitHub" (and a red
 * toast). Snowy tags its releases rcN, so main resolves the release itself —
 * the newest version above the running one, not a draft, carrying the
 * platform's channel file — and points electron-updater's generic provider at
 * that release's download folder. From there the library does what it always
 * did: read the channel file, download with the blockmap, install.
 *
 * The ordering is ours as well. Semver compares prerelease identifiers as
 * strings unless they are pure numbers, so rc10 sorts BELOW rc9 — the library
 * would call rc10 a downgrade of rc9 and refuse it. `compareVersions` splits
 * an identifier like "rc9" into ["rc", 9] (the same shape a dotted "rc.9" has)
 * and compares the number as a number, and updater.js sets `allowDowngrade`
 * so the library defers to the release this module chose.
 *
 * Pure: takes the parsed API response and no network, so the choice is
 * unit-tested against the shapes the feed has actually had.
 */
const semver = require("semver");

const CHANNEL_FILES = {
  win32: "latest.yml",
  darwin: "latest-mac.yml",
  linux: "latest-linux.yml",
};

function channelFileFor(platform) {
  return CHANNEL_FILES[platform] ?? "latest.yml";
}

/** "v0.1.0-rc9" → "0.1.0-rc9"; anything that is not a version tag → null. */
function versionFromTag(tag) {
  if (typeof tag !== "string") return null;
  const match = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/.exec(tag.trim());
  return match ? semver.valid(match[1]) : null;
}

/** "rc9" → ["rc", 9]; "10" → [10]; "beta" → ["beta"]. */
function splitIdentifier(identifier) {
  if (typeof identifier === "number") return [identifier];
  const match = /^([A-Za-z]+)(\d+)$/.exec(identifier);
  if (match) return [match[1], Number(match[2])];
  return [/^\d+$/.test(identifier) ? Number(identifier) : identifier];
}

function comparePrerelease(a, b) {
  // No prerelease is the release itself: above every candidate.
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  const left = a.flatMap(splitIdentifier);
  const right = b.flatMap(splitIdentifier);
  const n = Math.min(left.length, right.length);
  for (let i = 0; i < n; i += 1) {
    const x = left[i];
    const y = right[i];
    if (x === y) continue;
    const xNum = typeof x === "number";
    const yNum = typeof y === "number";
    if (xNum && yNum) return x < y ? -1 : 1;
    // Numbers sort below words, as in semver.
    if (xNum !== yNum) return xNum ? -1 : 1;
    return String(x) < String(y) ? -1 : 1;
  }
  return left.length === right.length ? 0 : left.length < right.length ? -1 : 1;
}

/** -1, 0, 1 like a sort comparator; either side invalid throws. */
function compareVersions(a, b) {
  const left = semver.parse(a);
  const right = semver.parse(b);
  if (!left || !right) throw new Error(`compareVersions: invalid version (${a}, ${b})`);
  const main = left.compareMain(right);
  if (main !== 0) return main;
  return comparePrerelease(left.prerelease, right.prerelease);
}

/**
 * @param {{ releases: unknown, currentVersion: string, platform: string }} input
 * @returns {{ tag: string, version: string, prerelease: boolean } | null}
 */
function resolveLatestRelease({ releases, currentVersion, platform }) {
  if (!Array.isArray(releases)) return null;
  const current = semver.valid(currentVersion);
  if (!current) return null;
  const channelFile = channelFileFor(platform);
  let best = null;
  for (const release of releases) {
    if (!release || release.draft) continue;
    const version = versionFromTag(release.tag_name);
    if (!version || compareVersions(version, current) <= 0) continue;
    const assets = Array.isArray(release.assets) ? release.assets : [];
    if (!assets.some((asset) => asset?.name === channelFile)) continue;
    if (!best || compareVersions(version, best.version) > 0) {
      best = { tag: release.tag_name, version, prerelease: release.prerelease === true };
    }
  }
  return best;
}

/** package.json's `repository` (string or { url }) → { owner, repo } for GitHub, else null. */
function parseGitHubRepository(repository) {
  const url = typeof repository === "string" ? repository : repository?.url;
  if (typeof url !== "string") return null;
  const match = /github\.com[/:]([^/\s]+)\/([^/#?\s]+?)(?:\.git)?\/?$/i.exec(url.trim());
  return match ? { owner: match[1], repo: match[2] } : null;
}

function releasesApiUrl({ owner, repo }, perPage = 30) {
  return `https://api.github.com/repos/${owner}/${repo}/releases?per_page=${perPage}`;
}

/** The base every asset of a release downloads from; the generic provider appends the file names. */
function releaseDownloadBase({ owner, repo }, tag) {
  return `https://github.com/${owner}/${repo}/releases/download/${encodeURIComponent(tag)}`;
}

module.exports = {
  channelFileFor,
  versionFromTag,
  compareVersions,
  resolveLatestRelease,
  parseGitHubRepository,
  releasesApiUrl,
  releaseDownloadBase,
};
