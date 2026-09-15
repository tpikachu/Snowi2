const fs = require("fs");
const path = require("path");
const { createPcmTimeline } = require("../utils/pcmTimeline");

/**
 * A raw copy of one meeting track, kept only so the archive pass has audio to
 * re-transcribe once the meeting ends.
 *
 * Plain PCM appended as it arrives — no container, no re-encode — because the
 * writer runs on the audio path and must never stall it. The timeline beside
 * the file is what turns a byte offset back into the moment it was heard
 * (see pcmTimeline.js); without it every pause would shift everything after
 * it earlier. The file lives in the safe temp dir under a session-unique name
 * and is unlinked by whoever ends the pass, or by discard() if the meeting is
 * cancelled first.
 */
function createMeetingAudioMirror({ dir, source, sampleRate, sessionKey }) {
  if (!dir || !source || !sampleRate) {
    throw new Error("createMeetingAudioMirror: dir, source and sampleRate are required");
  }
  const filePath = path.join(dir, `snowy-meeting-${sessionKey}-${source}.pcm`);
  const stream = fs.createWriteStream(filePath);
  const timeline = createPcmTimeline({ sampleRate, bytesPerSample: 2 });
  let error = null;
  let ended = false;
  stream.on("error", (err) => {
    error = err;
  });

  return {
    source,
    path: filePath,
    sampleRate,
    timeline,
    get error() {
      return error;
    },
    write(buffer, arrivalMs = Date.now()) {
      if (error || ended || !buffer?.length) return;
      timeline.record(buffer.length, arrivalMs);
      stream.write(buffer);
    },
    /** Finish the file; resolves with what the pass needs to read it. */
    end() {
      if (ended) return Promise.resolve({ path: filePath, timeline, bytes: timeline.bytes, error });
      ended = true;
      return new Promise((resolve) => {
        stream.end(() => resolve({ path: filePath, timeline, bytes: timeline.bytes, error }));
      });
    },
    /** Abandon the file without waiting on it. */
    discard() {
      ended = true;
      stream.destroy();
      fs.unlink(filePath, () => {});
    },
  };
}

module.exports = { createMeetingAudioMirror };
