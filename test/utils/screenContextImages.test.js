const test = require("node:test");
const assert = require("node:assert/strict");

const {
  screenContextImages,
  screenImageParts,
  screenImageDataUrl,
} = require("../../src/utils/screenContextImages.ts");

const img = (data, label) => ({ mediaType: "image/jpeg", data, ...(label ? { label } : {}) });

test("one screenshot and a list of them read the same", () => {
  assert.deepEqual(screenContextImages(img("a")), [img("a")]);
  assert.deepEqual(screenContextImages([img("a"), img("b")]), [img("a"), img("b")]);
});

test("nothing attached is an empty list — including an empty array and a blank image", () => {
  // The regression this guards: `[]` is truthy, so a bare `if (config.screenContext)`
  // would promise the model a screenshot the request does not carry.
  assert.deepEqual(screenContextImages(undefined), []);
  assert.deepEqual(screenContextImages(null), []);
  assert.deepEqual(screenContextImages([]), []);
  assert.deepEqual(screenContextImages([img(""), null]), []);
});

test("a lone screenshot gets no label part; several get one label ahead of each", () => {
  const toText = (text) => ({ text });
  const toImage = (image) => ({ image: image.data });

  assert.deepEqual(screenImageParts([img("a", "Screen 1 of 1")], toText, toImage), [
    { image: "a" },
  ]);

  assert.deepEqual(
    screenImageParts(
      [img("a", "Screen 1 of 2, primary"), img("b", "Screen 2 of 2")],
      toText,
      toImage
    ),
    [
      { text: "Screen 1 of 2, primary:" },
      { image: "a" },
      { text: "Screen 2 of 2:" },
      { image: "b" },
    ]
  );
});

test("an unlabeled image among several is still sent, just unintroduced", () => {
  const parts = screenImageParts(
    [img("a", "Screen 1 of 2"), img("b")],
    (text) => ({ text }),
    (image) => ({ image: image.data })
  );
  assert.deepEqual(parts, [{ text: "Screen 1 of 2:" }, { image: "a" }, { image: "b" }]);
});

test("the data URL carries the media type and the bare base64", () => {
  assert.equal(screenImageDataUrl(img("QUJD")), "data:image/jpeg;base64,QUJD");
});
