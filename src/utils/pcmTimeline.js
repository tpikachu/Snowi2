/**
 * Maps a byte offset in a mirrored PCM stream back to wall-clock time.
 *
 * The meeting's audio mirror is a plain concatenation of the chunks that
 * reached main, and a pause is a hole in the wall clock the bytes know nothing
 * about: capture stops, the file does not grow, and when capture resumes the
 * next byte follows the last one as if no time had passed. A single "started
 * at" anchor would stamp everything after the first pause too early by the
 * length of the pause — and the note's transcript sorts and clocks itself by
 * those stamps.
 *
 * So the mirror records an anchor whenever the audio's own clock (bytes so far
 * at the sample rate) and the arrival clock disagree by more than the
 * tolerance, and a lookup interpolates from the latest anchor at or before
 * the offset. Ordinary delivery jitter stays under the tolerance and adds
 * nothing; a pause, a stalled helper, or an hour of clock skew adds one anchor
 * and re-syncs from there.
 *
 * Chunks arrive after they were captured, so an anchor marks the START of the
 * chunk — arrival minus the chunk's own duration — which is when its first
 * sample was actually heard.
 */
function createPcmTimeline({ sampleRate, bytesPerSample = 2, driftToleranceMs = 1500 } = {}) {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error("createPcmTimeline: sampleRate is required");
  }
  const bytesPerMs = (sampleRate * bytesPerSample) / 1000;
  const anchors = [];
  let bytes = 0;

  /** Note a chunk of `byteLength` bytes that arrived at `arrivalMs`. */
  function record(byteLength, arrivalMs) {
    if (!(byteLength > 0)) return;
    const startedAt = arrivalMs - byteLength / bytesPerMs;
    const last = anchors[anchors.length - 1];
    if (!last) {
      anchors.push({ byteOffset: bytes, wallMs: startedAt });
    } else {
      const expected = last.wallMs + (bytes - last.byteOffset) / bytesPerMs;
      if (Math.abs(startedAt - expected) > driftToleranceMs) {
        anchors.push({ byteOffset: bytes, wallMs: startedAt });
      }
    }
    bytes += byteLength;
  }

  /** Wall-clock ms of the sample that starts at `byteOffset`, or null before any audio. */
  function timeAtByte(byteOffset) {
    if (anchors.length === 0) return null;
    let anchor = anchors[0];
    for (let i = anchors.length - 1; i >= 0; i -= 1) {
      if (anchors[i].byteOffset <= byteOffset) {
        anchor = anchors[i];
        break;
      }
    }
    return anchor.wallMs + (byteOffset - anchor.byteOffset) / bytesPerMs;
  }

  return {
    record,
    timeAtByte,
    get bytes() {
      return bytes;
    },
    get anchors() {
      return anchors.map((anchor) => ({ ...anchor }));
    },
    get startedAt() {
      return anchors.length ? anchors[0].wallMs : null;
    },
  };
}

module.exports = { createPcmTimeline };
