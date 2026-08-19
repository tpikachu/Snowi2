/**
 * A bounded, in-memory ring of PCM chunks — the pre-roll for a meeting the
 * user has not agreed to record yet.
 *
 * Chunks are kept exactly as the capture worklet produced them and evicted
 * whole. Splitting one to hit a byte target to the sample would buy ~33ms of
 * precision at the cost of handing the transcription stream a boundary it
 * never sees in normal capture.
 *
 * The cap is the point: this holds audio captured before consent, so it must
 * be impossible for it to grow into a recording. Nothing here writes to disk.
 */

export interface PcmRingBufferOptions {
  /** Samples per second of the incoming PCM. */
  sampleRate: number;
  /** Bytes per sample (2 for the Int16 the meeting worklet emits). */
  bytesPerSample?: number;
  /** How much audio to keep. Older audio falls off the back. */
  maxDurationMs: number;
}

export class PcmRingBuffer {
  private chunks: ArrayBuffer[] = [];
  private bytes = 0;
  private readonly maxBytes: number;
  private readonly bytesPerMs: number;

  constructor({ sampleRate, bytesPerSample = 2, maxDurationMs }: PcmRingBufferOptions) {
    this.bytesPerMs = (sampleRate * bytesPerSample) / 1000;
    this.maxBytes = Math.max(0, Math.floor(this.bytesPerMs * maxDurationMs));
  }

  /** Appends a chunk, evicting the oldest until the cap is respected. */
  push(chunk: ArrayBuffer): void {
    if (this.maxBytes === 0 || chunk.byteLength === 0) return;

    // A chunk larger than the whole window would evict everything and then sit
    // there over the cap; the window cannot represent it, so it is refused.
    if (chunk.byteLength > this.maxBytes) {
      this.clear();
      return;
    }

    this.chunks.push(chunk);
    this.bytes += chunk.byteLength;

    while (this.bytes > this.maxBytes && this.chunks.length > 0) {
      const evicted = this.chunks.shift();
      this.bytes -= evicted?.byteLength ?? 0;
    }
  }

  /** Milliseconds of audio currently held. */
  get durationMs(): number {
    return this.bytesPerMs === 0 ? 0 : this.bytes / this.bytesPerMs;
  }

  get byteLength(): number {
    return this.bytes;
  }

  get isEmpty(): boolean {
    return this.chunks.length === 0;
  }

  /**
   * Hands over everything held and empties the ring in one step.
   *
   * Deliberately not a getter plus a separate clear: a caller that read the
   * audio and then failed to clear would leave pre-consent audio alive, and
   * that is the one mistake this class exists to make impossible.
   */
  take(): ArrayBuffer[] {
    const taken = this.chunks;
    this.chunks = [];
    this.bytes = 0;
    return taken;
  }

  clear(): void {
    this.chunks = [];
    this.bytes = 0;
  }
}
