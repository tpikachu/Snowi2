const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  recordingRelPath,
  recordingAbsolutePath,
  recordingDownloadName,
  buildMixArgs,
  pickOrphans,
  listRecordingFiles,
  unlinkRecording,
  sweepRecordings,
} = require("../../src/helpers/noteRecordings");

const T0 = 1_700_000_000_000;

test("both sides are delayed to their first byte and mixed without halving", () => {
  const args = buildMixArgs({
    tracks: [
      { path: "mic.pcm", sampleRate: 24000, startedAt: T0 + 320 },
      { path: "system.pcm", sampleRate: 24000, startedAt: T0 },
    ],
    outputPath: "out.mp3",
  });
  // Two raw inputs, described as what they are.
  assert.deepEqual(args.slice(2, 18), [
    "-f",
    "s16le",
    "-ar",
    "24000",
    "-ac",
    "1",
    "-i",
    "mic.pcm",
    "-f",
    "s16le",
    "-ar",
    "24000",
    "-ac",
    "1",
    "-i",
    "system.pcm",
  ]);
  const filter = args[args.indexOf("-filter_complex") + 1];
  // The mic started 320 ms after the system track, so it waits that long.
  assert.equal(
    filter,
    "[0:a]adelay=320[a0];[1:a]adelay=0[a1];[a0][a1]amix=inputs=2:duration=longest:normalize=0[out]"
  );
  assert.deepEqual(args.slice(-10), [
    "-map",
    "[out]",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "64k",
    "-ac",
    "1",
    "-y",
    "out.mp3",
  ]);
});

test("one track needs no filter graph; an unknown start counts as the earliest", () => {
  const single = buildMixArgs({
    tracks: [{ path: "mic.pcm", sampleRate: 24000, startedAt: T0 }],
    outputPath: "out.mp3",
  });
  assert.equal(single.includes("-filter_complex"), false);
  assert.deepEqual(single.slice(single.indexOf("-map"), single.indexOf("-map") + 2), [
    "-map",
    "0:a",
  ]);

  const unknown = buildMixArgs({
    tracks: [
      { path: "mic.pcm", sampleRate: 24000, startedAt: null },
      { path: "system.pcm", sampleRate: 24000, startedAt: T0 + 500 },
    ],
    outputPath: "out.mp3",
  });
  assert.match(
    unknown[unknown.indexOf("-filter_complex") + 1],
    /^\[0:a\]adelay=0\[a0\];\[1:a\]adelay=0\[a1\]/
  );
  assert.throws(() => buildMixArgs({ tracks: [], outputPath: "x" }), /no tracks/);
});

test("stored paths are note-scoped, portable, and cannot leave the recordings folder", () => {
  assert.equal(recordingRelPath(42, T0), `42/${T0}.mp3`);
  const dir = path.join(os.tmpdir(), "snowy-recordings-test");
  assert.equal(recordingAbsolutePath(dir, `42/${T0}.mp3`), path.join(dir, "42", `${T0}.mp3`));
  assert.throws(() => recordingAbsolutePath(dir, "../secrets.txt"), /escapes/);
  assert.throws(() => recordingAbsolutePath(dir, path.join(os.homedir(), "x.mp3")), /escapes/);
  assert.throws(() => recordingAbsolutePath(dir, ""), /escapes/);
});

test("the download name carries the title and the session's start, with nothing a file system rejects", () => {
  const name = recordingDownloadName('Q3 plan: "final"? <draft>', T0);
  assert.match(name, /^Q3 plan- -final-- -draft- \d{4}-\d{2}-\d{2} \d{2}-\d{2}\.mp3$/);
  assert.match(recordingDownloadName("", T0), /^Meeting \d{4}/);
  assert.equal(recordingDownloadName("x", Number.NaN), "x NaN.mp3");
});

test("orphans are files without rows and rows without files, whatever the slashes", () => {
  const { filesToDelete, rowsToDelete } = pickOrphans({
    files: ["1/100.mp3", "2/200.mp3", path.join("3", "300.mp3")],
    rows: [
      { id: 1, relPath: "1/100.mp3" },
      { id: 3, relPath: "3/300.mp3" },
      { id: 4, relPath: "4/400.mp3" },
    ],
  });
  assert.deepEqual(filesToDelete, ["2/200.mp3"]);
  assert.deepEqual(
    rowsToDelete.map((row) => row.id),
    [4]
  );
});

test("the sweep deletes stray files, tidies empty note folders, and names the dead rows", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "snowy-recordings-"));
  fs.mkdirSync(path.join(dir, "1"));
  fs.mkdirSync(path.join(dir, "2"));
  fs.writeFileSync(path.join(dir, "1", "100.mp3"), "keep");
  fs.writeFileSync(path.join(dir, "2", "200.mp3"), "stray");
  fs.writeFileSync(path.join(dir, "2", "notes.txt"), "not a recording");
  assert.deepEqual(listRecordingFiles(dir).sort(), ["1/100.mp3", "2/200.mp3"]);

  const result = sweepRecordings({
    dir,
    rows: [
      { id: 1, relPath: "1/100.mp3" },
      { id: 9, relPath: "9/900.mp3" },
    ],
  });
  assert.deepEqual(result.filesToDelete, ["2/200.mp3"]);
  assert.deepEqual(
    result.rowsToDelete.map((row) => row.id),
    [9]
  );
  assert.equal(fs.existsSync(path.join(dir, "1", "100.mp3")), true);
  assert.equal(fs.existsSync(path.join(dir, "2", "200.mp3")), false);
  // The folder still held a foreign file, so it stays.
  assert.equal(fs.existsSync(path.join(dir, "2")), true);

  unlinkRecording(dir, "1/100.mp3");
  assert.equal(fs.existsSync(path.join(dir, "1")), false);
  // Gone already is not an error.
  unlinkRecording(dir, "1/100.mp3");
  assert.deepEqual(listRecordingFiles(path.join(dir, "nope")), []);
});
