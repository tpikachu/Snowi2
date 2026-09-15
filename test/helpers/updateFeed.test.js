const test = require("node:test");
const assert = require("node:assert/strict");
const semver = require("semver");

const {
  resolveLatestRelease,
  versionFromTag,
  compareVersions,
  parseGitHubRepository,
  releaseDownloadBase,
  releasesApiUrl,
  channelFileFor,
} = require("../../src/helpers/updateFeed");

const release = (tag, assets, extra = {}) => ({
  tag_name: tag,
  draft: false,
  prerelease: tag.includes("-"),
  assets: assets.map((name) => ({ name })),
  ...extra,
});
const WIN = ["latest.yml", "Snowy-Setup.exe", "Snowy-Setup.exe.blockmap"];
const BOTH = [...WIN, "latest-mac.yml", "Snowy-mac.zip"];

test("rc tags order by their number — where semver, and so the library, read them as words", () => {
  // The trap this module exists for: to semver, "rc10" < "rc9".
  assert.equal(semver.gt("0.1.0-rc10", "0.1.0-rc9"), false);
  assert.equal(compareVersions("0.1.0-rc10", "0.1.0-rc9"), 1);
  assert.equal(compareVersions("0.1.0-rc9", "0.1.0-rc10"), -1);
  assert.equal(compareVersions("0.1.0-rc8", "0.1.0-rc8"), 0);
  // A dotted spelling means the same thing.
  assert.equal(compareVersions("0.1.0-rc.10", "0.1.0-rc9"), 1);
  assert.equal(compareVersions("0.1.0-rc.9", "0.1.0-rc9"), 0);
  // The release itself sits above every candidate; the next series above it.
  assert.equal(compareVersions("0.1.0", "0.1.0-rc11"), 1);
  assert.equal(compareVersions("0.1.1-rc1", "0.1.0"), 1);
  assert.equal(compareVersions("0.2.0-rc1", "0.1.9"), 1);
  // Words before numbers, and a longer list wins on a shared prefix, as in semver.
  assert.equal(compareVersions("0.1.0-beta.2", "0.1.0-rc1"), -1);
  assert.equal(compareVersions("0.1.0-rc1.1", "0.1.0-rc1"), 1);
  assert.throws(() => compareVersions("nope", "0.1.0"));
});

test("an rc install is offered the next rc — the case the library's channel matching refused", () => {
  const releases = [release("v0.1.0-rc9", BOTH), release("v0.1.0-rc8", BOTH)];
  assert.deepEqual(
    resolveLatestRelease({ releases, currentVersion: "0.1.0-rc8", platform: "win32" }),
    { tag: "v0.1.0-rc9", version: "0.1.0-rc9", prerelease: true }
  );
  // …and rc9 is offered rc10, which semver would have called a downgrade.
  const later = [release("v0.1.0-rc10", BOTH), ...releases];
  assert.equal(
    resolveLatestRelease({ releases: later, currentVersion: "0.1.0-rc9", platform: "win32" }).tag,
    "v0.1.0-rc10"
  );
});

test("an rc install is carried to the stable release, and a stable install to the next rc", () => {
  const releases = [release("v0.1.0", BOTH), release("v0.1.0-rc9", BOTH)];
  assert.equal(
    resolveLatestRelease({ releases, currentVersion: "0.1.0-rc9", platform: "win32" }).version,
    "0.1.0"
  );
  const later = [release("v0.1.1-rc1", BOTH), ...releases];
  assert.equal(
    resolveLatestRelease({ releases: later, currentVersion: "0.1.0", platform: "darwin" }).version,
    "0.1.1-rc1"
  );
});

test("the newest eligible release wins regardless of feed order", () => {
  const releases = [
    release("v0.1.0-rc9", BOTH),
    release("v0.1.0-rc11", BOTH),
    release("v0.1.0-rc10", BOTH),
  ];
  assert.equal(
    resolveLatestRelease({ releases, currentVersion: "0.1.0-rc8", platform: "win32" }).tag,
    "v0.1.0-rc11"
  );
});

test("a release without the platform's channel file cannot be installed and is skipped", () => {
  // rc1–rc7 were published before publishAutoUpdate was on: installers, no yml.
  const releases = [
    release("v0.1.0-rc9", ["Snowy-Setup-0.1.0-rc9.exe"]),
    release("v0.1.0-rc8", ["latest.yml"]),
  ];
  assert.equal(
    resolveLatestRelease({ releases, currentVersion: "0.1.0-rc8", platform: "win32" }),
    null
  );
  // A Windows-only feed file does not serve a Mac.
  const winOnly = [release("v0.1.0-rc9", WIN)];
  assert.equal(
    resolveLatestRelease({ releases: winOnly, currentVersion: "0.1.0-rc8", platform: "darwin" }),
    null
  );
  assert.equal(
    resolveLatestRelease({ releases: winOnly, currentVersion: "0.1.0-rc8", platform: "win32" }).tag,
    "v0.1.0-rc9"
  );
});

test("drafts, helper-binary tags, and older releases are ignored", () => {
  const releases = [
    release("v0.2.0", BOTH, { draft: true }),
    release("windows-text-monitor-v1.0.0", ["windows-text-monitor-win32-x64.zip"]),
    release("linux-text-monitor-v1.0.0", ["linux-text-monitor-linux-x64.tar.gz"]),
    release("v0.1.0-rc7", BOTH),
  ];
  assert.equal(
    resolveLatestRelease({ releases, currentVersion: "0.1.0-rc8", platform: "win32" }),
    null
  );
});

test("garbage in yields nothing, never a throw", () => {
  assert.equal(
    resolveLatestRelease({ releases: null, currentVersion: "0.1.0", platform: "win32" }),
    null
  );
  assert.equal(
    resolveLatestRelease({
      releases: [null, {}, { tag_name: 5 }],
      currentVersion: "0.1.0",
      platform: "win32",
    }),
    null
  );
  assert.equal(
    resolveLatestRelease({
      releases: [release("v9.9.9", BOTH)],
      currentVersion: "not-a-version",
      platform: "win32",
    }),
    null
  );
});

test("tags parse with or without the v, and only as full versions", () => {
  assert.equal(versionFromTag("v0.1.0-rc9"), "0.1.0-rc9");
  assert.equal(versionFromTag("0.1.0"), "0.1.0");
  assert.equal(versionFromTag("v0.1"), null);
  assert.equal(versionFromTag("release-0.1.0"), null);
  assert.equal(versionFromTag(undefined), null);
});

test("the repository comes from package.json in any of git's spellings", () => {
  const expected = { owner: "tpikachu", repo: "Snowi2" };
  assert.deepEqual(parseGitHubRepository("git+https://github.com/tpikachu/Snowi2.git"), expected);
  assert.deepEqual(
    parseGitHubRepository({ type: "git", url: "https://github.com/tpikachu/Snowi2" }),
    expected
  );
  assert.deepEqual(parseGitHubRepository("git@github.com:tpikachu/Snowi2.git"), expected);
  assert.equal(parseGitHubRepository("https://gitlab.com/x/y.git"), null);
  assert.equal(parseGitHubRepository(undefined), null);
});

test("URLs point at the fork's API and at one release's download folder", () => {
  const repo = { owner: "tpikachu", repo: "Snowi2" };
  assert.equal(
    releasesApiUrl(repo),
    "https://api.github.com/repos/tpikachu/Snowi2/releases?per_page=30"
  );
  assert.equal(
    releaseDownloadBase(repo, "v0.1.0-rc9"),
    "https://github.com/tpikachu/Snowi2/releases/download/v0.1.0-rc9"
  );
  assert.equal(channelFileFor("darwin"), "latest-mac.yml");
  assert.equal(channelFileFor("freebsd"), "latest.yml");
});
