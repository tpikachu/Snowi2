const test = require("node:test");
const assert = require("node:assert/strict");

const {
  shouldShowUpdateBanner,
  snoozeUpdateBanner,
  parseUpdateBannerSnooze,
  UPDATE_BANNER_SNOOZE_MS,
} = require("../../src/utils/updateBanner.ts");

const NOW = 1_800_000_000_000;

test("the banner shows for an available or a downloaded update, and for nothing else", () => {
  const base = { version: "0.1.0-rc9", snooze: null, now: NOW };
  assert.equal(shouldShowUpdateBanner({ ...base, available: true, downloaded: false }), true);
  assert.equal(shouldShowUpdateBanner({ ...base, available: false, downloaded: true }), true);
  assert.equal(shouldShowUpdateBanner({ ...base, available: false, downloaded: false }), false);
});

test("Later hides that version for a day, and a newer release is not covered by it", () => {
  const snooze = snoozeUpdateBanner("0.1.0-rc9", NOW);
  assert.equal(snooze.until, NOW + UPDATE_BANNER_SNOOZE_MS);
  const rc9 = { available: true, downloaded: false, version: "0.1.0-rc9", snooze };
  assert.equal(shouldShowUpdateBanner({ ...rc9, now: NOW + 1000 }), false);
  assert.equal(shouldShowUpdateBanner({ ...rc9, now: NOW + UPDATE_BANNER_SNOOZE_MS }), true);
  assert.equal(shouldShowUpdateBanner({ ...rc9, version: "0.1.0-rc10", now: NOW + 1000 }), true);
  // Snoozing the available state also covers the same version once downloaded.
  assert.equal(shouldShowUpdateBanner({ ...rc9, downloaded: true, now: NOW + 1000 }), false);
});

test("a stored snooze round-trips, and anything unreadable reads as none", () => {
  const snooze = snoozeUpdateBanner("0.1.0-rc9", NOW);
  assert.deepEqual(parseUpdateBannerSnooze(JSON.stringify(snooze)), snooze);
  assert.equal(parseUpdateBannerSnooze(null), null);
  assert.equal(parseUpdateBannerSnooze(""), null);
  assert.equal(parseUpdateBannerSnooze("{not json"), null);
  assert.equal(parseUpdateBannerSnooze(JSON.stringify({ version: 3, until: "soon" })), null);
  assert.equal(parseUpdateBannerSnooze(JSON.stringify({ version: "x", until: Infinity })), null);
});
