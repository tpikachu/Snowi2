const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");

// The module requires electron at load; the pure functions never touch it.
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "electron") {
    return { screen: {}, desktopCapturer: {}, systemPreferences: {} };
  }
  return originalLoad.call(this, request, ...rest);
};
const { averageLuminance, backdropTone, thumbnailRect } = require("../../src/helpers/dotBackdrop");
Module._load = originalLoad;

/** A width×height BGRA bitmap filled with one colour, with a painted rect. */
function bitmap(width, height, fill, paint) {
  const buf = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inPaint =
        paint &&
        x >= paint.x &&
        x < paint.x + paint.width &&
        y >= paint.y &&
        y < paint.y + paint.height;
      const [r, g, b] = inPaint ? paint.rgb : fill;
      const i = (y * width + x) * 4;
      buf[i] = b;
      buf[i + 1] = g;
      buf[i + 2] = r;
      buf[i + 3] = 255;
    }
  }
  return buf;
}

test("averageLuminance reads BGRA and averages only the rectangle asked for", () => {
  const img = bitmap(10, 10, [0, 0, 0], { x: 5, y: 0, width: 5, height: 10, rgb: [255, 255, 255] });
  assert.equal(averageLuminance(img, 10, 10, { x: 0, y: 0, width: 5, height: 10 }), 0);
  assert.ok(
    Math.abs(averageLuminance(img, 10, 10, { x: 5, y: 0, width: 5, height: 10 }) - 1) < 1e-9
  );
  // Half and half.
  const whole = averageLuminance(img, 10, 10, { x: 0, y: 0, width: 10, height: 10 });
  assert.ok(Math.abs(whole - 0.5) < 1e-9);
});

test("averageLuminance clamps to the bitmap and returns null for an empty rectangle", () => {
  const img = bitmap(4, 4, [255, 255, 255]);
  assert.ok(averageLuminance(img, 4, 4, { x: -3, y: -3, width: 5, height: 5 }) > 0.99);
  assert.equal(averageLuminance(img, 4, 4, { x: 10, y: 10, width: 2, height: 2 }), null);
});

test("a pure red or green reads by its relative luminance, not its brightness", () => {
  const green = bitmap(2, 2, [0, 255, 0]);
  const blue = bitmap(2, 2, [0, 0, 255]);
  assert.ok(averageLuminance(green, 2, 2, { x: 0, y: 0, width: 2, height: 2 }) > 0.7);
  assert.ok(averageLuminance(blue, 2, 2, { x: 0, y: 0, width: 2, height: 2 }) < 0.1);
});

test("backdropTone flips only outside the hysteresis band and holds the previous answer inside it", () => {
  assert.equal(backdropTone(0.9), "light");
  assert.equal(backdropTone(0.1), "dark");
  assert.equal(backdropTone(0.5, "light"), "light");
  assert.equal(backdropTone(0.5, "dark"), "dark");
  // No previous answer: the nearer side.
  assert.equal(backdropTone(0.52), "light");
  assert.equal(backdropTone(0.48), "dark");
  // Nothing read: whatever was known.
  assert.equal(backdropTone(null, "light"), "light");
  assert.equal(backdropTone(null), null);
});

test("thumbnailRect maps window bounds onto the display's scaled thumbnail", () => {
  const rect = thumbnailRect(
    { x: 1100, y: 40, width: 96, height: 96 },
    { x: 100, y: 0, width: 1600, height: 900 },
    200,
    112.5
  );
  assert.deepEqual(rect, { x: 125, y: 5, width: 12, height: 12 });
});
