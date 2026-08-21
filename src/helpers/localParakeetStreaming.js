const debugLogger = require("./debugLogger");
const { downsample24kTo16k } = require("../utils/audioUtils");

/**
 * Live captions from a local streaming (cache-aware) Parakeet/Nemotron model.
 *
 * Why this exists: local meetings used to transcribe on a 5-second timer —
 * buffer audio, decode the buffer offline, emit the whole result as one
 * finished segment. That is why local captions arrived a sentence at a time and
 * felt slow: nothing could appear before the 5 seconds were up, and the decode
 * itself came after. Cloud providers never had this problem because they stream.
 *
 * So this presents the *same interface the cloud streaming clients present* —
 * `onPartialTranscript`, `onFinalTranscript`, `completedSegments`, `sendAudio`
 * — over the local online websocket server. Meeting mode can then attach it
 * with `attachMeetingStreamingHandlers` exactly like Deepgram, which is what
 * makes echo-bleed suppression, mic holdback and segment retraction apply to
 * local meetings without a second implementation of any of them.
 *
 * The caption behaviour comes from the server's own message shape: it refines
 * one segment word by word (`is_final: false`) and then marks it final. Those
 * map to a partial and a final respectively, which is the Google Live Caption
 * pattern — text appears as it is heard and firms up in place, rather than
 * waiting for a sentence to complete.
 */

/** Meeting audio arrives at 24 kHz; the ASR models want 16 kHz. */
const MEETING_SAMPLE_RATE = 24000;
const MODEL_SAMPLE_RATE = 16000;

class LocalParakeetStreaming {
  constructor(wsServer) {
    this.wsServer = wsServer;
    this.stream = null;
    this.isConnected = false;
    this.onPartialTranscript = null;
    this.onFinalTranscript = null;
    this.onError = null;
    this.onSessionEnd = null;
    this.onConnectionLost = null;

    this.finalSegments = [];
    this.sessionStartedAt = null;
    /**
     * Monotonic across the session. The renderer uses it to drop a partial that
     * arrives after the one it supersedes; the server has no sequence of its
     * own, and websocket ordering alone does not survive the IPC hop.
     */
    this.partialSeq = 0;
    /** Segment id → index in `finalSegments`, so a revised final replaces in place. */
    this.settledSegments = new Map();
  }

  /** The finished lines, oldest first — the contract `completedSegments` has. */
  get completedSegments() {
    return this.finalSegments;
  }

  get accumulatedText() {
    return this.finalSegments.join(" ");
  }

  /**
   * @param {object} options
   * @param {string} options.source - "mic" or "system", for logging only. Each
   *   source gets its own instance and its own websocket to the shared server.
   */
  async connect(options = {}) {
    if (this.isConnected) return;

    this.source = options.source || "unknown";
    this.sessionStartedAt = Date.now();

    this.stream = this.wsServer.createOnlineStream({
      onResult: (result) => this._handleResult(result),
      onError: (error) => {
        debugLogger.warn("local parakeet stream error", {
          source: this.source,
          error: error.message,
        });
        this.onError?.(error);
      },
    });

    this.isConnected = true;
    debugLogger.debug("local parakeet streaming connected", { source: this.source });
  }

  _handleResult({ text, segment, isFinal }) {
    if (!text) return;

    // A segment id of null means the server did not label this result. Treat
    // each unlabelled final as its own line rather than folding them together,
    // which is what the accumulator does for the same case.
    const key = segment ?? `unlabelled:${this.finalSegments.length}`;

    if (!isFinal) {
      this.partialSeq += 1;
      this.onPartialTranscript?.(text, {
        utteranceId: String(key),
        seq: this.partialSeq,
      });
      return;
    }

    // The same id can arrive final more than once — the server re-emits a
    // finalized segment when it revises it. Last write wins on the text, but
    // the line keeps its place instead of being appended a second time, which
    // is why the index is tracked rather than just a "seen" set.
    const settledIndex = this.settledSegments.get(key);
    if (settledIndex !== undefined) {
      if (this.finalSegments[settledIndex] === text) return;
      this.finalSegments[settledIndex] = text;

      // Only re-announce a revision of the *newest* line. The consumer reads
      // `completedSegments[length - 1]` to decide what just landed, so firing
      // for an older segment would republish the newest one and put a duplicate
      // in the transcript. The corrected text still reaches the stored
      // transcript through `accumulatedText` at Stop.
      if (settledIndex === this.finalSegments.length - 1) {
        this.onFinalTranscript?.(text, Date.now());
      }
      return;
    }

    this.settledSegments.set(key, this.finalSegments.length);
    this.finalSegments.push(text);

    // Withdraw the caption this final replaces. Without it the partial bubble
    // for this segment stays on screen underneath its own settled line.
    this.onPartialTranscript?.("", { utteranceId: String(key), seq: ++this.partialSeq });
    this.onFinalTranscript?.(text, Date.now());
  }

  /**
   * @param {Buffer} pcmBuffer - 24 kHz mono s16le, as the meeting pipeline
   *   delivers it from both the microphone and the system-audio helper.
   */
  sendAudio(pcmBuffer) {
    if (!this.stream || !this.isConnected) return false;
    if (!pcmBuffer || pcmBuffer.length === 0) return false;

    try {
      this.stream.sendPcm16(downsample24kTo16k(pcmBuffer));
      return true;
    } catch (error) {
      debugLogger.warn("local parakeet sendAudio failed", {
        source: this.source,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Flush and close, returning the session's text like the cloud clients do.
   *
   * Named `disconnect` because that is what the meeting teardown paths call on
   * whatever is in `_meetingMicStreaming`; this class only slots in beside
   * Deepgram and the others if it answers to the same name.
   *
   * Flushes rather than aborts: Stop is usually pressed just after someone
   * stopped talking, and the tail of that sentence is still inside the server.
   */
  async disconnect() {
    if (!this.stream) {
      this.isConnected = false;
      return { text: this.accumulatedText };
    }

    const stream = this.stream;
    this.stream = null;
    this.isConnected = false;

    try {
      await stream.finish();
    } catch (error) {
      debugLogger.warn("local parakeet stream finish failed", {
        source: this.source,
        error: error.message,
      });
    }
    this.onSessionEnd?.();
    return { text: this.accumulatedText };
  }

  /** Drop the connection without waiting for a flush. For teardown on error. */
  abort() {
    try {
      this.stream?.abort();
    } catch {}
    this.stream = null;
    this.isConnected = false;
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      source: this.source,
      segments: this.finalSegments.length,
    };
  }
}

module.exports = {
  LocalParakeetStreaming,
  MEETING_SAMPLE_RATE,
  MODEL_SAMPLE_RATE,
};
